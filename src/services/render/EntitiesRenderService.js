import {Map, LayerGroup, LatLngBounds} from "leaflet";
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
  /** @type {Map} */
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

  }

  async render() {
    this.entities.forEach((ent) => {
      ent.update(this.markerClusterGroup);
    });
    if (this.markerGrouping === "spread") {
      this._updateSpreadOffsets();
    } else if (this._spreadDebugOnce !== true) {
      this._spreadDebugOnce = true;
      console.warn(`[ha-map-card] markerGrouping="${this.markerGrouping}", entities=${this.entities.length}`);
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

    if (this._spreadDebugOnce2 !== true) {
      this._spreadDebugOnce2 = true;
      const groupSummary = [...groups.entries()].map(([k, v]) => `${k}(${v.map(e => e.id).join(',')})`).join(' | ');
      console.warn(`[ha-map-card spread] ${groups.size} groups: ${groupSummary}`);
    }

    for (const group of groups.values()) {
      if (group.length <= 1) {
        // Single entity — clear any previous offset
        if (group[0]._spreadOffset) {
          group[0]._spreadOffset = null;
          group[0]._updateMarkerIcon();
        }
        continue;
      }

      const n = group.length;
      const maxSize = Math.max(...group.map(e => e.config.size));
      const radius = maxSize * 0.35;

      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i / n) - Math.PI / 2; // start from top
        const newOffset = {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius)
        };

        const prev = group[i]._spreadOffset;
        if (!prev || prev.x !== newOffset.x || prev.y !== newOffset.y) {
          group[i]._spreadOffset = newOffset;
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
    const points = this.entities.filter(e => e.config.focusOnFit).map((e) => e.latLng);
    if(points.length === 0) {
      return;
    }
    // If not, get bounds of all markers rendered
    const bounds = (new LatLngBounds(points)).pad(0.1);
    if(this.focusFollowConfig.isContains) {
      if(this.map.getBounds().contains(bounds)) {
        return;
      }
    }
    this.map.fitBounds(bounds);
    Logger.debug("[EntitiesRenderService.updateInitialView]: Updating bounds to: " + points.join(","));
  }

  setInitialView() {
    const points = this.entities.filter(e => e.config.focusOnFit).map((e) => e.latLng);
    if(points.length === 0) {
      return;
    }
    // If not, get bounds of all markers rendered
    const bounds = (new LatLngBounds(points)).pad(0.1);
    this.map.fitBounds(bounds);
    Logger.debug("[EntitiesRenderService.setInitialView]: Setting initial view to: " + points.join(","));
  }
}
