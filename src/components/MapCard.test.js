import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import MapCard from './MapCard.js';
import L from 'leaflet';

jest.mock('leaflet');
jest.mock('lit', () => ({
  LitElement: class LitElement {
    static get properties() { return {}; }
    static get styles() { return ''; }
    requestUpdate() {}
    connectedCallback() {}
  },
  html: (strings) => strings.join(''),
  css: (strings) => strings.join('')
}));
jest.mock('../util/Logger.js');

describe('MapCard', () => {
  let card;

  beforeEach(() => {
    card = new MapCard();
    card.setup = jest.fn();
    card.requestUpdate = jest.fn();
    card.shadowRoot = {
      querySelector: jest.fn()
    };
  });

  describe('firstUpdated', () => {
    it('should call setup() when hass is available', () => {
      card.hass = { states: {}, themes: {} };

      card.firstUpdated();

      expect(card.setup).toHaveBeenCalled();
    });

    it('should not call setup() when hass is unavailable', () => {
      card.hass = undefined;

      card.firstUpdated();

      expect(card.setup).not.toHaveBeenCalled();
    });
  });

  describe('render', () => {
    beforeEach(() => {
      card._config = {
        title: 'Test',
        mapHeight: 300
      };
      card.hass = { states: {}, themes: { darkMode: false } };
      card.themeMode = 'light';
    });

    it('should call setup() when setupNeeded, hass is available, and #map exists', () => {
      card.setupNeeded = true;
      card.shadowRoot.querySelector.mockReturnValue(document.createElement('div'));

      card.render();

      expect(card.setup).toHaveBeenCalled();
      expect(card.shadowRoot.querySelector).toHaveBeenCalledWith('#map');
    });

    it('should not call setup() when setupNeeded is false', () => {
      card.setupNeeded = false;
      card.shadowRoot.querySelector.mockReturnValue(document.createElement('div'));

      card.render();

      expect(card.setup).not.toHaveBeenCalled();
    });

    it('should not call setup() when hass is unavailable', () => {
      card.setupNeeded = true;
      card.hass = undefined;
      card.shadowRoot.querySelector.mockReturnValue(document.createElement('div'));

      card.render();

      expect(card.setup).not.toHaveBeenCalled();
    });

    it('should not call setup() when #map element is missing', () => {
      card.setupNeeded = true;
      card.shadowRoot.querySelector.mockReturnValue(null);

      card.render();

      expect(card.setup).not.toHaveBeenCalled();
    });
  });

  describe('bearing', () => {
    let mapEl, fakeMap;

    const setUpMap = (bearing) => {
      mapEl = document.createElement('div');
      mapEl.id = 'map';
      card.shadowRoot.querySelector.mockReturnValue(mapEl);
      card.hass = { states: {}, themes: { darkMode: false } };
      card.themeMode = 'light';
      card._config = { mapOptions: { zoomSnap: 1 }, tileLayer: null, syncGroup: null, bearing };
      fakeMap = { options: { doubleClickZoom: false }, remove: jest.fn() };
      L.map.mockReturnValue(fakeMap);
      L.Icon = { Default: {} };
      card.map = card._setupMap();
    };

    it('creates the map in #map itself, untouched, without one', () => {
      setUpMap(0);
      expect(L.map).toHaveBeenLastCalledWith(mapEl, { zoomSnap: 1 });
      expect(mapEl.children.length).toBe(0);
      expect(mapEl.className).toBe('light');
      expect(fakeMap._mapCardBearing).toBeUndefined();
      expect(fakeMap.mouseEventToContainerPoint).toBeUndefined();
    });

    it('creates the map in a turned box inside #map with one, and removes it again', () => {
      setUpMap(90);
      const inner = mapEl.firstElementChild;
      expect(L.map).toHaveBeenLastCalledWith(inner, { zoomSnap: 1 });
      expect(inner.className).toBe('map-card-rotated map-card-bearing-90 map-card-quarter-turn');
      expect(mapEl.classList.contains('map-card-turned')).toBe(true);
      expect(fakeMap._mapCardBearing).toBe(90);

      card._teardown();
      expect(fakeMap.remove).toHaveBeenCalled();
      expect(mapEl.children.length).toBe(0);
      expect(mapEl.classList.contains('map-card-turned')).toBe(false);
    });
  });

  describe('connectedCallback', () => {
    it('should request an update when setupNeeded is true', () => {
      card.setupNeeded = true;

      card.connectedCallback();

      expect(card.requestUpdate).toHaveBeenCalled();
    });

    it('should not request an update when setupNeeded is false', () => {
      card.setupNeeded = false;

      card.connectedCallback();

      expect(card.requestUpdate).not.toHaveBeenCalled();
    });
  });
});
