import Logger from "../util/Logger";

export default class FocusFollowConfig {

  /**
   * @type {string}
   * @private
   */
  selection = "none";

  /**
   * @type {number}
   * @private
   */
  pauseSeconds = 0;

  /**
   * The closest a fit to the entities may zoom in; undefined for the map's own maximum.
   * @type {number|undefined}
   */
  maxZoom = undefined;

  constructor(config, pauseSeconds, maxZoom) {
    this.selection = ['refocus', 'contains', 'none' ].includes(config) ? config : "none";
    const parsedPauseSeconds = Number(pauseSeconds);
    this.pauseSeconds = (!isNaN(parsedPauseSeconds) && parsedPauseSeconds > 0) ? parsedPauseSeconds : 0;
    const parsedMaxZoom = Number(maxZoom);
    this.maxZoom = (maxZoom != null && maxZoom !== "" && !isNaN(parsedMaxZoom)) ? parsedMaxZoom : undefined;
    Logger.debug(`[FocusFollowConfig]: Setting up focus follow config with selection ${this.selection}, pauseSeconds ${this.pauseSeconds}`);
  }

  get isRefocus() {
    return this.selection == "refocus";
  }

  get isNone() {
    return this.selection == "none";
  }

  get isContains() {
    return this.selection == "contains";
  }

  get hasPause() {
    return this.pauseSeconds > 0;
  }

  /** @returns {object} options for Leaflet's fitBounds */
  get fitOptions() {
    return this.maxZoom === undefined ? {} : { maxZoom: this.maxZoom };
  }

  get pauseMilliseconds() {
    return this.pauseSeconds * 1000;
  }

}