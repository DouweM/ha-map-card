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
    // Group entities by proximity (within ~1 meter), excluding group: false entities
    const groups = new Map();
    for (const entity of this.entities) {
      if (!entity.marker || entity.config.group === false) continue;
      const latLng = entity.latLng;
      const key = `${latLng.lat.toFixed(5)},${latLng.lng.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entity);
    }

    for (const group of groups.values()) {
      if (group.length <= 1) {
        // Single entity — clear any previous offset
        if (group[0]._spreadOffset || group[0]._spreadApplied) {
          group[0]._spreadOffset = null;
          group[0]._updateMarkerIcon();
        }
        continue;
      }

      const n = group.length;
      const maxSize = Math.max(...group.map(e => e.config.size));
      const radius = maxSize * 0.35;

      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i / n) + Math.PI; // start from left
        const newOffset = {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius)
        };

        // Compare against what actually landed on the marker, not what was last
        // asked for: on a cold load the DOM node may not exist yet, and keying off
        // the intent would record the offset as handled and never come back.
        const prev = group[i]._spreadApplied;
        group[i]._spreadOffset = newOffset;
        if (!prev || prev.x !== newOffset.x || prev.y !== newOffset.y) {
          group[i]._updateMarkerIcon();
        }
      }
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
