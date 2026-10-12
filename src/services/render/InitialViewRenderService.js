import EntitiesRenderService from "./EntitiesRenderService";
import Map from 'leaflet';
import HaMapUtilities from '../../util/HaMapUtilities.js';
import Logger from "../../util/Logger.js";
import { getSharedView } from "../ViewSyncStore.js";

export default class InitialViewRenderService {

  hass;
  config;
  /** @type {EntitiesRenderService} */
  entitiesRenderService;
  /** @type {Map} */
  map;

  constructor(map, config, hass, entitiesRenderService) {
    this.map = map;
    this.config = config;
    this.hass = hass;
    this.entitiesRenderService = entitiesRenderService;
  }

  setup() {
    Logger.debug("[InitialViewRenderService] Setting up initial view");
    const container = this.map?.getContainer();

    if (!container) return;

    // If the container is already sized, apply the view immediately. Otherwise,
    // use a one-shot ResizeObserver to wait for the browser to lay out the
    // container, then apply the view once real dimensions are available.
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      this._applyInitialView();
    } else {
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        try {
          if (this.map?.getContainer()?.isConnected) {
            this.map.invalidateSize();
            this._applyInitialView();
          }
        } catch (e) {
          Logger.debug("[InitialViewRenderService] Map no longer available, skipping initial view", e);
        }
      });
      observer.observe(container);
    }
  }

  _applyInitialView() {
    // If another card in the same sync_group has already moved, adopt its view.
    const shared = getSharedView(this.config.syncGroup);
    if (shared) {
      Logger.debug("[InitialViewRenderService] Adopting shared view from group " + this.config.syncGroup);
      // Taking up the group's view is not somebody moving this map.
      this.entitiesRenderService._isAutoFitting = true;
      this.map.once('moveend', () => {
        this.entitiesRenderService._isAutoFitting = false;
      });
      this.map.setView(shared.center, shared.zoom);
      // But it is where somebody left the map, so it gets the same grace from
      // focus_follow as if they had just moved this one.
      this.entitiesRenderService.pauseFollowSince(shared.movedAt);
      return;
    }

    const latLng = this.getConfiguredLatLong(this.config, this.hass);

    if (latLng) {
      Logger.debug("[InitialViewRenderService] Setting up initial view to " + latLng);
      // The configured view is the card's own doing, not a move to share as
      // somebody's.
      if (this.entitiesRenderService) {
        this.entitiesRenderService._isAutoFitting = true;
        this.map.once?.('moveend', () => {
          this.entitiesRenderService._isAutoFitting = false;
        });
      }
      this.map.setView(latLng, this.config.zoom);
      return;
    }
    this.entitiesRenderService.setInitialView();
  }

  render() { }

  /**
   * Get latLng based on configuration
   * - Return specific x/y if set
   * - Return x/y of focused entity if provided
   * - Return null (default behavior)
   * @param {object} config
   * @param {object} hass
   * @returns {[number, number]|null}
   */
  getConfiguredLatLong(config, hass) {
    if (Number.isFinite(config.x) && Number.isFinite(config.y)) {
      return [config.x, config.y];
    }

    if (config.focusEntity) {
      return this.getFocusedEntityLatLng(config.focusEntity, hass);
    }

    // Default
    return null;
  }

  /**
   *
   * @param {string} entityId
   * @param {object} hass
   * @returns {[number, number]}
   */
  getFocusedEntityLatLng(entityId, hass) {
    const entity = hass.states[entityId];

    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    // Get lat/lng (inc sub trackers)
    let latLng = HaMapUtilities.getEntityLatLng(entityId, hass.states);
    if (latLng) return latLng;

    // Unable to find
    throw new Error(`Entity ${entityId} has no longitude & latitude.`);
  }
}
