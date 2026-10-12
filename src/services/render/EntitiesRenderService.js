import L, {Map as LeafletMap, LayerGroup, LatLngBounds} from "leaflet";
import "leaflet.markercluster";
import EntityConfig from "../../configs/EntityConfig";
import Entity from "../../models/Entity";
import Logger from "../../util/Logger";
import HaMapUtilities from "../../util/HaMapUtilities";
import HaDateRangeService from "../HaDateRangeService";
import HaLinkedEntityService from "../HaLinkedEntityService";
import HaHistoryService from "../HaHistoryService";
import FocusFollowConfig from "../../configs/FocusFollowConfig";



/** How far apart, as a fraction of a pin, spread markers sit: overlapping a little. */
const SPREAD_GAP = 0.7;

export default class EntitiesRenderService {

  /** @type {[Entity]} */
  entities = [];
  /** @type {[EntityConfig]} */
  entityConfigs = [];
  /** @type {object} */
  hass;
  /** @type {LeafletMap} */
  map;
  /** @type {boolean} */
  isDarkMode = false;
  /** @type {HaDateRangeService} */
  dateRangeManager;
  /** @type {HaLinkedEntityService} */
  linkedEntityService;
  /** @type {HaHistoryService} */
  historyService;
  /** @type {FocusFollowConfig} */
  focusFollowConfig;
  /** @type {L.MarkerClusterGroup} */
  markerClusterGroup;
  /** @type {string} */
  markerGrouping;
  /** @type {boolean} */
  isFollowPaused = false;
  /** @type {number|null} */
  _followPauseTimer = null;
  /** @type {boolean} */
  _isAutoFitting = false;

  constructor(map, hass, focusFollowConfig, entityConfigs, linkedEntityService, dateRangeManager, historyService, isDarkMode, markerGrouping = "none") {
    this.map = map;
    this.hass = hass;
    this.focusFollowConfig = focusFollowConfig;
    this.entityConfigs = entityConfigs;
    this.linkedEntityService = linkedEntityService;
    this.dateRangeManager = dateRangeManager;
    this.historyService = historyService;
    this.isDarkMode = isDarkMode;
    this.markerGrouping = markerGrouping;
  }

  setup() {
    Logger.debug("[EntitiesRenderService] Marker grouping mode: " + this.markerGrouping);
    if (this.markerGrouping === "cluster") {
      this.markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        removeOutsideVisibleBounds: false,
      });
      this.map.addLayer(this.markerClusterGroup);
      Logger.debug("[EntitiesRenderService] Marker cluster group created and added to map");
    }

    this.entities = this.entityConfigs.map((configEntity) => {
      // Attempt to setup entity. Skip on fail, so one bad entity does not affect others.
      try {
        const entity = new Entity(configEntity, this.hass, this.map, this.historyService, this.dateRangeManager, this.linkedEntityService, this.isDarkMode);
        entity.setup(this.markerClusterGroup);
        return entity;
      } catch (e){
        Logger.error("Entity: " + configEntity.id + " skipped due to missing data", e);
        HaMapUtilities.renderWarningOnMap(this.map, "Entity: " + configEntity.id + " could not be loaded. See console for details.");
        return null;
      }
    })
    // Remove skipped entities.
    .filter(v => v);

    if (!this.focusFollowConfig.isNone && this.focusFollowConfig.hasPause) {
      this._setupFollowPauseListeners();
    }

    if (this.markerGrouping === "spread") {
      // Overlap is measured on screen, so it changes with the zoom. This also
      // catches the first setView, before which nothing can be projected.
      this._onSpreadZoom = () => this._updateSpreadOffsets();
      this.map.on('zoomend', this._onSpreadZoom);
    }
  }

  _setupFollowPauseListeners() {
    this._pauseFollow = () => {
      if (this._isAutoFitting) { return; }
      this.isFollowPaused = true;
      if (this._followPauseTimer) {
        clearTimeout(this._followPauseTimer);
        this._followPauseTimer = null;
      }
    };

    this._scheduleResume = () => {
      if (this._isAutoFitting) { return; }
      if (this._followPauseTimer) {
        clearTimeout(this._followPauseTimer);
      }
      this._followPauseTimer = setTimeout(() => {
        this.isFollowPaused = false;
        this._followPauseTimer = null;
        this.updateInitialView();
      }, this.focusFollowConfig.pauseMilliseconds);
    };

    this.map.on('mousedown', this._pauseFollow);
    this.map.on('dragstart', this._pauseFollow);
    this.map.on('zoomstart', this._pauseFollow);
    this.map.on('mouseup', this._scheduleResume);
    this.map.on('dragend', this._scheduleResume);
    this.map.on('zoomend', this._scheduleResume);
  }

  /**
   * Hold off focus_follow for what is left of its pause after a move made at
   * `movedAt` (epoch ms) -- somebody moving another card in the same
   * sync_group, whose view this one has just taken up.
   * @param {number|undefined} movedAt
   */
  pauseFollowSince(movedAt) {
    if (movedAt === undefined || this.focusFollowConfig.isNone || !this.focusFollowConfig.hasPause) {
      return;
    }
    const remaining = movedAt + this.focusFollowConfig.pauseMilliseconds - Date.now();
    if (remaining <= 0) {
      return;
    }
    this.isFollowPaused = true;
    if (this._followPauseTimer) {
      clearTimeout(this._followPauseTimer);
    }
    this._followPauseTimer = setTimeout(() => {
      this.isFollowPaused = false;
      this._followPauseTimer = null;
      this.updateInitialView();
    }, remaining);
  }

  cleanup() {
    if (this._followPauseTimer) {
      clearTimeout(this._followPauseTimer);
      this._followPauseTimer = null;
    }
    if (this._pauseFollow) {
      this.map.off('mousedown', this._pauseFollow);
      this.map.off('dragstart', this._pauseFollow);
      this.map.off('zoomstart', this._pauseFollow);
    }
    if (this._onSpreadZoom) {
      this.map.off('zoomend', this._onSpreadZoom);
      this._onSpreadZoom = null;
    }
    if (this._scheduleResume) {
      this.map.off('mouseup', this._scheduleResume);
      this.map.off('dragend', this._scheduleResume);
      this.map.off('zoomend', this._scheduleResume);
    }
  }

  async render(hass) {
    if (hass) {
      this.hass = hass;
    }
    this.entities.forEach((ent) => {
      // Entity keeps the hass object from setup(); Lovelace replaces hass on
      // every state change, so without this the marker reads a stale snapshot
      // and never moves (#217).
      try {
        if (this.hass) {
          ent.hass = this.hass;
        }
        ent.update(this.markerClusterGroup);
      } catch (e) {
        Logger.error("Entity: " + ent.id + " failed to update", e);
      }
    });
    if (this.markerGrouping === "spread") {
      this._updateSpreadOffsets();
    }
    this.updateInitialView();
  }

  _updateSpreadOffsets() {
    // Markers whose pins overlap on screen by more than a little, excluding
    // group: false entities. Two people a few metres apart are as stacked as two
    // in the same spot once the map is zoomed out, so this works in pixels.
    const placed = [];
    for (const entity of this.entities) {
      if (!entity.marker || entity.config.group === false) continue;
      let point;
      try {
        // Where the marker is drawn, which lags latLng by up to
        // positionUpdateThreshold.
        point = this.map.latLngToLayerPoint(entity.marker.getLatLng?.() ?? entity.latLng);
      } catch (e) {
        // No view yet; the first zoomend comes back here.
        return;
      }
      placed.push({ entity, point, size: entity.config.size });
    }

    // Union nearby markers, so a chain of three ends up in one group.
    const parent = placed.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const gap = SPREAD_GAP * Math.max(placed[i].size, placed[j].size);
        if (placed[i].point.distanceTo(placed[j].point) < gap) {
          parent[root(i)] = root(j);
        }
      }
    }
    const groups = new Map();
    placed.forEach((m, i) => {
      const r = root(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(m);
    });

    for (const group of groups.values()) {
      if (group.length <= 1) {
        // Single entity — clear any previous offset
        const entity = group[0].entity;
        if (entity._spreadOffset || entity._spreadApplied) {
          entity._spreadOffset = null;
          entity._updateMarkerIcon();
        }
        continue;
      }

      // Lay the group out on a circle round its centre, neighbours SPREAD_GAP of
      // a pin apart: still touching, so they read as together, but each face
      // shows. Members keep the side of the centre they are really on, so
      // whoever is to the west stays to the west.
      const n = group.length;
      const cx = group.reduce((sum, m) => sum + m.point.x, 0) / n;
      const cy = group.reduce((sum, m) => sum + m.point.y, 0) / n;
      const gap = SPREAD_GAP * Math.max(...group.map(m => m.size));
      const radius = n === 2 ? gap / 2 : gap / (2 * Math.sin(Math.PI / n));
      // Members on the centre itself have no side, and take the slots left over.
      const angleOf = (m) => Math.hypot(m.point.x - cx, m.point.y - cy) >= 0.5
        ? Math.atan2(m.point.y - cy, m.point.x - cx)
        : null;
      const sided = group.filter(m => angleOf(m) !== null).sort((a, b) => angleOf(a) - angleOf(b));
      const ordered = [...sided, ...group.filter(m => angleOf(m) === null)];
      // Turn the circle to sit closest to where they all really are (the mean
      // of each one's angle less its slot's), not pinned to whoever sorts first.
      let start = Math.PI; // start from left
      if (sided.length) {
        let sin = 0, cos = 0;
        sided.forEach((m, i) => {
          const a = angleOf(m) - 2 * Math.PI * i / n;
          sin += Math.sin(a);
          cos += Math.cos(a);
        });
        start = Math.atan2(sin, cos);
      }

      ordered.forEach((m, i) => {
        const angle = start + 2 * Math.PI * i / n;
        const newOffset = {
          x: Math.round(cx + Math.cos(angle) * radius - m.point.x),
          y: Math.round(cy + Math.sin(angle) * radius - m.point.y)
        };

        // Compare against what actually landed on the marker, not what was last
        // asked for: on a cold load the DOM node may not exist yet, and keying off
        // the intent would record the offset as handled and never come back.
        const prev = m.entity._spreadApplied;
        m.entity._spreadOffset = newOffset;
        if (!prev || prev.x !== newOffset.x || prev.y !== newOffset.y) {
          m.entity._updateMarkerIcon();
        }
      });
    }
  }

  toggleClustering() {
    if (this.markerGrouping === "cluster") {
      this.markerGrouping = "none";
    } else {
      this.markerGrouping = "cluster";
    }

    if (this.markerGrouping === "cluster") {
      // Enable clustering
      this.markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        removeOutsideVisibleBounds: false,
      });
      this.map.addLayer(this.markerClusterGroup);

      // Move non-excluded markers to cluster group
      this.entities.forEach((entity) => {
        if (entity.marker && entity.config.group !== false && this.map.hasLayer(entity.marker)) {
          this.map.removeLayer(entity.marker);
          this.markerClusterGroup.addLayer(entity.marker);
        }
      });
    } else {
      // Disable clustering
      if (this.markerClusterGroup) {
        this.markerClusterGroup.clearLayers();
        this.map.removeLayer(this.markerClusterGroup);
        this.markerClusterGroup = null;
      }

      // Add all markers directly to map
      this.entities.forEach((entity) => {
        if (entity.marker && !this.map.hasLayer(entity.marker)) {
          entity.marker.addTo(this.map);
        }
      });
    }
  }

  updateInitialView() {
    if(this.focusFollowConfig.isNone) {
      return;
    }
    if(this.isFollowPaused) {
      return;
    }
    const points = this.entities.filter(e => e.config.focusOnFit).map((e) => e.latLng);
    if(points.length === 0) {
      return;
    }
    // A map that isn't laid out (a hidden tab or card) has no view to fit to;
    // it fits again on the first update once it's shown.
    const size = this.map.getSize?.();
    if(size && (size.x === 0 || size.y === 0)) {
      return;
    }
    // If not, get bounds of all markers rendered
    const bounds = (new LatLngBounds(points)).pad(0.1);
    const padding = this._focusPadding();
    if(this.focusFollowConfig.isContains) {
      if(this._visibleBounds(padding).contains(bounds)) {
        return;
      }
    }
    this._isAutoFitting = true;
    this.map.once('moveend', () => {
      this._isAutoFitting = false;
    });
    this.map.fitBounds(bounds, this._fitOptions(padding));
    Logger.debug("[EntitiesRenderService.updateInitialView]: Updating bounds to: " + points.join(","));
  }

  setInitialView() {
    const points = this.entities.filter(e => e.config.focusOnFit).map((e) => e.latLng);
    if(points.length === 0) {
      return;
    }
    // If not, get bounds of all markers rendered
    const bounds = (new LatLngBounds(points)).pad(0.1);
    this._isAutoFitting = true;
    this.map.once('moveend', () => {
      this._isAutoFitting = false;
    });
    this.map.fitBounds(bounds, this._fitOptions(this._focusPadding()));
    Logger.debug("[EntitiesRenderService.setInitialView]: Setting initial view to: " + points.join(","));
  }

  /**
   * Space along each edge of the map that a fit leaves clear, from the
   * `--map-card-focus-padding` CSS property: one to four lengths in pixels, in
   * the order of CSS's own `padding`. It is a property rather than an option so
   * that whatever covers part of the map -- an overlay laid over it by the
   * dashboard -- can say how much it covers, and change that as it grows.
   * @returns {{top: number, right: number, bottom: number, left: number}}
   */
  _focusPadding() {
    const none = {top: 0, right: 0, bottom: 0, left: 0};
    const container = this.map.getContainer?.();
    if(!container || typeof getComputedStyle !== "function") {
      return none;
    }
    const value = getComputedStyle(container).getPropertyValue("--map-card-focus-padding").trim();
    const lengths = value.split(/\s+/).filter(Boolean).map((v) => parseFloat(v));
    if(lengths.length === 0 || lengths.length > 4 || lengths.some((v) => isNaN(v) || v < 0)) {
      if(value) {
        Logger.debug(`[EntitiesRenderService._focusPadding]: Ignoring --map-card-focus-padding "${value}"`);
      }
      return none;
    }
    const [top, right = top, bottom = top, left = right] = lengths;
    // Padding that leaves next to nothing clear is no help: Leaflet would fit
    // into a negative space at its maximum zoom, and nothing would ever be
    // contained, so every update would refit. Drop it on that axis instead.
    const size = this.map.getSize?.();
    const clear = (extent, a, b) => extent - a - b >= extent / 4;
    const horizontal = !size || clear(size.x, left, right);
    const vertical = !size || clear(size.y, top, bottom);
    if(!horizontal || !vertical) {
      Logger.debug(`[EntitiesRenderService._focusPadding]: Ignoring --map-card-focus-padding "${value}" on a ${size.x}x${size.y} map`);
    }
    return {
      top: vertical ? top : 0,
      right: horizontal ? right : 0,
      bottom: vertical ? bottom : 0,
      left: horizontal ? left : 0,
    };
  }

  /**
   * The part of the map a fit would keep markers in: the view less its padding.
   * @param {{top: number, right: number, bottom: number, left: number}} padding
   * @returns {LatLngBounds}
   */
  _visibleBounds(padding) {
    const view = this.map.getBounds();
    if(!padding.top && !padding.right && !padding.bottom && !padding.left) {
      return view;
    }
    const size = this.map.getSize();
    return new LatLngBounds(
      this.map.containerPointToLatLng([padding.left, size.y - padding.bottom]),
      this.map.containerPointToLatLng([size.x - padding.right, padding.top]),
    );
  }

  /**
   * @param {{top: number, right: number, bottom: number, left: number}} padding
   * @returns {object} options for Leaflet's fitBounds
   */
  _fitOptions(padding) {
    const options = {...(this.focusFollowConfig?.fitOptions ?? {})};
    if(padding.top || padding.right || padding.bottom || padding.left) {
      options.paddingTopLeft = [padding.left, padding.top];
      options.paddingBottomRight = [padding.right, padding.bottom];
    }
    return options;
  }
}
