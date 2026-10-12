import FocusFollowConfig from "../../configs/FocusFollowConfig";
import EntitiesRenderService from "./EntitiesRenderService";
import { LatLng, latLng, point } from "leaflet";

describe("EntitiesRenderService", () => {
  describe("render", () => {
    it("should have a method", () => {
      expect(new EntitiesRenderService().render).toBeDefined();
    });

    it("pushes the latest hass onto each entity before update", async () => {
      const focusFollow = new FocusFollowConfig("none");
      const service = new EntitiesRenderService({}, {}, focusFollow, [], {}, {}, {}, false, false);
      const firstHass = { id: "old" };
      const nextHass = { id: "new" };
      const entity = {
        hass: firstHass,
        update: jest.fn(),
        config: { focusOnFit: false },
      };
      service.entities = [entity];

      await service.render(nextHass);

      expect(service.hass).toBe(nextHass);
      expect(entity.hass).toBe(nextHass);
      expect(entity.update).toHaveBeenCalled();
    });
  });

  describe("setup", () => {
    it("should have a method", () => {
      expect(new EntitiesRenderService().setup).toBeDefined();
    });
  });

  describe("setInitialView", () => {
    it("With 2 Latlngs", () => {
      const map = {
        setView: jest.fn(),
        fitBounds: jest.fn(),
        once: jest.fn(),
      };
      const hass = {};
      const entitiesRenderService = new EntitiesRenderService(map, [], hass, {}, {}, {}, true);

      // Test data
      const testData = [
        [1.1, 2.1],
        [ 2.1, 3.1],
        [ 1.7, -4.9]
      ];
      entitiesRenderService.entities = testDataToMarker(testData);

      entitiesRenderService.setInitialView();
      expect(map.fitBounds).toBeCalledWith({"_northEast": {"lat": 2.2, "lng": 3.9000000000000004}, "_southWest": {"lat": 1, "lng": -5.7}}, {});
    });

    it("zooms no closer than focus_max_zoom", () => {
      const map = {
        setView: jest.fn(),
        fitBounds: jest.fn(),
        once: jest.fn(),
      };
      const focusFollow = new FocusFollowConfig("contains", 0, 16);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, false);
      // Everyone in one spot: an empty bounds, which Leaflet fits at its maximum zoom.
      entitiesRenderService.entities = testDataToMarker([[40.7617, -73.988], [40.7617, -73.988]]);

      entitiesRenderService.setInitialView();
      expect(map.fitBounds).toBeCalledWith(expect.anything(), { maxZoom: 16 });
    });

    it("leaves the --map-card-focus-padding edges clear", () => {
      const container = document.createElement("div");
      container.style.setProperty("--map-card-focus-padding", "0 80px 10px 0");
      document.body.appendChild(container);
      const map = {
        setView: jest.fn(),
        fitBounds: jest.fn(),
        once: jest.fn(),
        getContainer: () => container,
      };
      const focusFollow = new FocusFollowConfig("contains", 0, 16);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, false);
      entitiesRenderService.entities = testDataToMarker([[1.1, 2.1], [2.1, 3.1]]);

      entitiesRenderService.setInitialView();
      expect(map.fitBounds).toBeCalledWith(expect.anything(), {
        maxZoom: 16,
        paddingTopLeft: [0, 0],
        paddingBottomRight: [80, 10],
      });
      container.remove();
    });
  });

  describe("updateInitialView", () => {
    it("in case of no entities with focusOnFit", () => {
      const map = {
        setView: jest.fn(),
        fitBounds: jest.fn(),
        getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(true)}),
      };
      const hass = {};
      const entitiesRenderService = new EntitiesRenderService(map, [], hass, {}, {}, {}, true);

      // Test data
      const testData = [
        [1.1, 2.1],
        [ 2.1, 3.1],
        [ 1.7, -4.9]
      ];

      entitiesRenderService.entities = testDataToMarker(testData, false);
      entitiesRenderService.updateInitialView();
      expect(map.fitBounds).not.toBeCalled();
      
  });

  it("in case of FocusFollow.isNone", () => {
    const map = {
      setView: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(true)}),
    };
    const focusFollow = new FocusFollowConfig("contains");
    const hass = {};
    const entitiesRenderService = new EntitiesRenderService(map, hass, focusFollow, {}, {}, {}, true);

    // Test data
    const testData = [
      [1.1, 2.1],
      [ 2.1, 3.1],
      [ 1.7, -4.9]
    ];

    entitiesRenderService.entities = testDataToMarker(testData);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).not.toBeCalled();
  });

  it("in case of FocusFollow.isContains", () => {
    const map = {
      setView: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(true)}),
    };
    const focusFollow = new FocusFollowConfig("contains");
    const hass = {};
    const entitiesRenderService = new EntitiesRenderService(map, hass, focusFollow, {}, {}, {}, true);

    // Test data
    const testData = [
      [1.1, 2.1],
      [ 2.1, 3.1],
      [ 1.7, -4.9]
    ];

    entitiesRenderService.entities = testDataToMarker(testData);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).not.toBeCalled();
  });

  it("in case of FocusFollow.isContains and bounds not contains", () => {
    const map = {
      setView: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(false)}),
      once: jest.fn(),
    };
    const focusFollow = new FocusFollowConfig("contains");
    const hass = {};
    const entitiesRenderService = new EntitiesRenderService(map, hass, focusFollow, {}, {}, {}, true);

    // Test data
    const testData = [
      [1.1, 2.1],
      [ 2.1, 3.1],
      [ 1.7, -4.9]
    ];

    entitiesRenderService.entities = testDataToMarker(testData);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).toBeCalled();
  });

  describe("pauseFollowSince", () => {
    const serviceWith = (focusFollow) => {
      const map = { setView: jest.fn(), fitBounds: jest.fn(), once: jest.fn(), on: jest.fn(),
        getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(false)}) };
      const service = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, false);
      service.entities = testDataToMarker([[1.1, 2.1], [2.1, 3.1]]);
      return { map, service };
    };

    it("holds off following for the rest of the pause after the move", () => {
      jest.useFakeTimers();
      const { map, service } = serviceWith(new FocusFollowConfig("contains", 60));
      service.pauseFollowSince(Date.now() - 20 * 1000);
      service.updateInitialView();
      expect(map.fitBounds).not.toBeCalled();

      jest.advanceTimersByTime(40 * 1000);
      expect(service.isFollowPaused).toBe(false);
      expect(map.fitBounds).toBeCalled();
      jest.useRealTimers();
    });

    it("does nothing once the pause has run out, or without one", () => {
      const late = serviceWith(new FocusFollowConfig("contains", 60)).service;
      late.pauseFollowSince(Date.now() - 61 * 1000);
      expect(late.isFollowPaused).toBe(false);

      const unpaused = serviceWith(new FocusFollowConfig("contains")).service;
      unpaused.pauseFollowSince(Date.now());
      expect(unpaused.isFollowPaused).toBe(false);

      const never = serviceWith(new FocusFollowConfig("contains", 60)).service;
      never.pauseFollowSince(undefined);
      expect(never.isFollowPaused).toBe(false);
    });
  });

  describe("_focusPadding", () => {
    const paddingFor = (value, size = {x: 400, y: 300}) => {
      const container = document.createElement("div");
      container.style.setProperty("--map-card-focus-padding", value);
      document.body.appendChild(container);
      const service = new EntitiesRenderService({getContainer: () => container, getSize: () => size}, {}, new FocusFollowConfig("contains"), [], {}, {}, {}, false);
      const padding = service._focusPadding();
      container.remove();
      return padding;
    };

    it("reads CSS padding shorthand", () => {
      expect(paddingFor("10px")).toEqual({top: 10, right: 10, bottom: 10, left: 10});
      expect(paddingFor("10px 20px")).toEqual({top: 10, right: 20, bottom: 10, left: 20});
      expect(paddingFor("10px 20px 30px")).toEqual({top: 10, right: 20, bottom: 30, left: 20});
      expect(paddingFor("1px 2px 3px 4px")).toEqual({top: 1, right: 2, bottom: 3, left: 4});
    });

    it("ignores what isn't padding", () => {
      expect(paddingFor("")).toEqual({top: 0, right: 0, bottom: 0, left: 0});
      expect(paddingFor("wide")).toEqual({top: 0, right: 0, bottom: 0, left: 0});
      expect(paddingFor("-5px")).toEqual({top: 0, right: 0, bottom: 0, left: 0});
    });

    it("drops padding that would leave too little of the map clear", () => {
      expect(paddingFor("10px 350px 10px 0")).toEqual({top: 10, right: 0, bottom: 10, left: 0});
      expect(paddingFor("0 80px", {x: 0, y: 0})).toEqual({top: 0, right: 0, bottom: 0, left: 0});
    });
  });

  it("in case of a map that isn't laid out", () => {
    const map = {
      setView: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(false)}),
      getSize: () => ({x: 0, y: 0}),
      once: jest.fn(),
    };
    const entitiesRenderService = new EntitiesRenderService(map, {}, new FocusFollowConfig("contains"), [], {}, {}, {}, false);
    entitiesRenderService.entities = testDataToMarker([[1.1, 2.1], [2.1, 3.1]]);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).not.toBeCalled();
  });

  it("in case of FocusFollow.isContains and an entity under the padding", () => {
    const container = document.createElement("div");
    container.style.setProperty("--map-card-focus-padding", "0 100px 0 0");
    document.body.appendChild(container);
    // A 400px-wide view of longitudes 0..4 and latitudes 0..4: the right
    // 100px, east of longitude 3, is covered.
    const map = {
      setView: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(true)}),
      getSize: () => ({x: 400, y: 400}),
      containerPointToLatLng: ([x, y]) => latLng(4 - y / 100, x / 100),
      getContainer: () => container,
      once: jest.fn(),
    };
    const focusFollow = new FocusFollowConfig("contains");
    const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, {}, {}, {}, true);

    entitiesRenderService.entities = testDataToMarker([[2, 1], [2, 3.5]]);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).toBeCalled();

    map.fitBounds.mockClear();
    entitiesRenderService.entities = testDataToMarker([[2, 1], [2, 2.5]]);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).not.toBeCalled();
    container.remove();
  });

  it("in case of FocusFollow.isRefocus", () => {
    const map = {
      setView: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue({contains: jest.fn().mockReturnValue(true)}),
      once: jest.fn(),
    };
    const focusFollow = new FocusFollowConfig("refocus");
    const hass = {};
    const entitiesRenderService = new EntitiesRenderService(map, hass, focusFollow, {}, {}, {}, true);

    // Test data
    const testData = [
      [1.1, 2.1],
      [ 2.1, 3.1],
      [ 1.7, -4.9]
    ];

    entitiesRenderService.entities = testDataToMarker(testData);
    entitiesRenderService.updateInitialView();
    expect(map.fitBounds).toBeCalled();
  });

  describe("follow pause", () => {
    function createMapWithListeners() {
      const handlers = {};
      const onceHandlers = {};
      const map = {
        setView: jest.fn(),
        fitBounds: jest.fn(),
        getBounds: jest.fn().mockReturnValue({ contains: jest.fn().mockReturnValue(true) }),
        on: jest.fn((event, handler) => { handlers[event] = handler; }),
        once: jest.fn((event, handler) => { onceHandlers[event] = handler; }),
        off: jest.fn(),
      };
      return { map, handlers, onceHandlers };
    }

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("registers pause/resume listeners when focus_follow is set and pause is configured", () => {
      const { map } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);

      entitiesRenderService.setup();

      expect(map.on).toBeCalledWith('mousedown', expect.any(Function));
      expect(map.on).toBeCalledWith('dragstart', expect.any(Function));
      expect(map.on).toBeCalledWith('zoomstart', expect.any(Function));
      expect(map.on).toBeCalledWith('mouseup', expect.any(Function));
      expect(map.on).toBeCalledWith('dragend', expect.any(Function));
      expect(map.on).toBeCalledWith('zoomend', expect.any(Function));
    });

    it("does not register listeners when focus_follow is none", () => {
      const { map } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("none", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);

      entitiesRenderService.setup();

      expect(map.on).not.toBeCalled();
    });

    it("does not register listeners when no pause is configured", () => {
      const { map } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus");
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);

      entitiesRenderService.setup();

      expect(map.on).not.toBeCalled();
    });

    it("skips fitBounds while follow is paused", () => {
      const { map } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);

      const testData = [
        [1.1, 2.1],
        [2.1, 3.1],
      ];
      entitiesRenderService.entities = testDataToMarker(testData);
      entitiesRenderService.isFollowPaused = true;

      entitiesRenderService.updateInitialView();

      expect(map.fitBounds).not.toBeCalled();
    });

    it("re-fits the view immediately once the pause timeout elapses, without waiting for an entity update", () => {
      const { map, handlers } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();
      entitiesRenderService.entities = testDataToMarker([
        [1.1, 2.1],
        [2.1, 3.1],
      ]);

      handlers.dragstart();
      handlers.dragend();
      expect(map.fitBounds).not.toBeCalled();

      jest.advanceTimersByTime(5000);

      expect(entitiesRenderService.isFollowPaused).toBe(false);
      expect(map.fitBounds).toBeCalled();
    });

    it("pauses on drag start and resumes after the configured timeout on drag end", () => {
      const { map, handlers } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();

      handlers.dragstart();
      expect(entitiesRenderService.isFollowPaused).toBe(true);

      handlers.dragend();
      expect(entitiesRenderService.isFollowPaused).toBe(true);

      jest.advanceTimersByTime(5000);
      expect(entitiesRenderService.isFollowPaused).toBe(false);
    });

    it("extends the pause if interaction happens again before the timeout elapses", () => {
      const { map, handlers } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();

      handlers.dragstart();
      handlers.dragend();

      jest.advanceTimersByTime(4000);
      handlers.mousedown();
      handlers.mouseup();

      jest.advanceTimersByTime(4000);
      expect(entitiesRenderService.isFollowPaused).toBe(true);

      jest.advanceTimersByTime(1000);
      expect(entitiesRenderService.isFollowPaused).toBe(false);
    });

    it("ignores interaction events fired by its own auto-fit", () => {
      const { map, handlers } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();

      entitiesRenderService._isAutoFitting = true;
      handlers.zoomstart();

      expect(entitiesRenderService.isFollowPaused).toBe(false);
    });

    it("clears the pending resume timer on cleanup", () => {
      const { map, handlers } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();

      handlers.dragstart();
      handlers.dragend();
      entitiesRenderService.cleanup();

      jest.advanceTimersByTime(5000);
      expect(entitiesRenderService.isFollowPaused).toBe(true);
    });

    it("removes the pause/resume listeners on cleanup", () => {
      const { map } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();

      entitiesRenderService.cleanup();

      expect(map.off).toBeCalledWith('mousedown', expect.any(Function));
      expect(map.off).toBeCalledWith('dragstart', expect.any(Function));
      expect(map.off).toBeCalledWith('zoomstart', expect.any(Function));
      expect(map.off).toBeCalledWith('mouseup', expect.any(Function));
      expect(map.off).toBeCalledWith('dragend', expect.any(Function));
      expect(map.off).toBeCalledWith('zoomend', expect.any(Function));
    });

    it("does not treat its own animated auto-fit as a user interaction until the animation settles", () => {
      const { map, handlers, onceHandlers } = createMapWithListeners();
      const focusFollow = new FocusFollowConfig("refocus", 5);
      const entitiesRenderService = new EntitiesRenderService(map, {}, focusFollow, [], {}, {}, {}, true, false);
      entitiesRenderService.setup();
      entitiesRenderService.entities = testDataToMarker([
        [1.1, 2.1],
        [2.1, 3.1],
      ]);

      // Programmatic refocus: fitBounds animates, so zoomend fires asynchronously
      // well after this call returns, while _isAutoFitting is still true.
      entitiesRenderService.updateInitialView();
      expect(map.fitBounds).toBeCalledTimes(1);
      expect(entitiesRenderService._isAutoFitting).toBe(true);

      // zoomstart/zoomend caused by our own animation must be ignored.
      handlers.zoomstart();
      handlers.zoomend();
      expect(entitiesRenderService.isFollowPaused).toBe(false);
      expect(entitiesRenderService._followPauseTimer).toBeNull();

      // Only once the animation actually completes (moveend) do we stop guarding.
      onceHandlers.moveend();
      expect(entitiesRenderService._isAutoFitting).toBe(false);

      // A genuine user-triggered zoom afterwards is tracked normally and does
      // not cause a self-triggered refocus loop.
      handlers.zoomend();
      expect(entitiesRenderService._followPauseTimer).not.toBeNull();
    });
  });
});

function testDataToMarker(testData, focusOnFit = true) {
  return testData.map((data) => {
    return {     
      latLng: new LatLng(data[0], data[1]),
      config: {
        focusOnFit: focusOnFit,
      },
    };
  });
}
  describe("_updateSpreadOffsets", () => {
    const at = (lat, lng, size = 48) => ({
      latLng: latLng(lat, lng),
      marker: {},
      config: { size, group: true },
      _spreadOffset: null,
      _spreadApplied: null,
      _updateMarkerIcon: jest.fn(),
    });

    // One pixel per 1e-5 degree: 48px pins overlap below ~0.0005 degrees apart.
    const map = { latLngToLayerPoint: (ll) => point(ll.lng * 1e5, -ll.lat * 1e5) };

    const service = (entities) => {
      const s = new EntitiesRenderService(map, {}, new FocusFollowConfig("none"), [], {}, {}, {}, false, "spread");
      s.entities = entities;
      return s;
    };

    it("retries co-located markers whose offset never reached the DOM", () => {
      // A cold page load: the offsets are computed while the map is still being
      // laid out, so _updateMarkerIcon cannot find the element and applies nothing.
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.1);
      const s = service([a, b]);

      s._updateSpreadOffsets();
      expect(a._updateMarkerIcon).toHaveBeenCalledTimes(1);
      expect(a._spreadOffset).not.toBeNull();
      expect(a._spreadApplied).toBeNull(); // nothing landed

      // Second pass, same positions. Keying off the intent would skip these forever;
      // keying off what was applied must try again.
      s._updateSpreadOffsets();
      expect(a._updateMarkerIcon).toHaveBeenCalledTimes(2);
      expect(b._updateMarkerIcon).toHaveBeenCalledTimes(2);
    });

    it("stops re-applying once the offset is actually on the marker", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.1);
      const s = service([a, b]);
      // Simulate a successful application, as _updateMarkerIcon does when the
      // element exists.
      const land = (e) => e._updateMarkerIcon.mockImplementation(() => {
        e._spreadApplied = { x: e._spreadOffset.x, y: e._spreadOffset.y };
      });
      land(a); land(b);

      s._updateSpreadOffsets();
      s._updateSpreadOffsets();

      expect(a._updateMarkerIcon).toHaveBeenCalledTimes(1);
      expect(b._updateMarkerIcon).toHaveBeenCalledTimes(1);
    });

    it("separates two markers in the same spot", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.1);
      service([a, b])._updateSpreadOffsets();
      expect(a._spreadOffset).not.toEqual(b._spreadOffset);
    });

    it("spreads markers that are near but not in the same spot", () => {
      // 10px apart: almost entirely on top of each other at this zoom.
      const west = at(19.4, -99.1);
      const east = at(19.4, -99.0999);
      service([east, west])._updateSpreadOffsets();
      const x = (e, lng) => lng * 1e5 + e._spreadOffset.x;
      const gap = x(east, -99.0999) - x(west, -99.1);
      // Placed 0.7 of a pin apart, overlapping a little, west still west.
      expect(gap).toBeGreaterThanOrEqual(33);
      expect(gap).toBeLessThanOrEqual(35);
      expect(east._spreadOffset.y).toBe(0);
    });

    it("leaves markers alone that barely overlap", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.0996); // 40px apart, more than 0.7 of a 48px pin
      service([a, b])._updateSpreadOffsets();
      expect(a._spreadOffset).toBeNull();
      expect(b._spreadOffset).toBeNull();
    });

    it("spreads a chain of three as one group", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.09975);
      const c = at(19.4, -99.0995);
      service([a, b, c])._updateSpreadOffsets();
      const pos = [[a, -99.1], [b, -99.09975], [c, -99.0995]]
        .map(([e, lng]) => point(lng * 1e5 + e._spreadOffset.x, -19.4 * 1e5 + e._spreadOffset.y));
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          expect(pos[i].distanceTo(pos[j])).toBeGreaterThanOrEqual(32);
        }
      }
    });

    const drawn = (e, lat, lng) => point(lng * 1e5 + e._spreadOffset.x, -lat * 1e5 + e._spreadOffset.y);

    it("keeps three markers on the sides they really are", () => {
      // One well to the west, two just east of it and close together.
      const a = at(19.4, -99.1);
      const b = at(19.40001, -99.09975);
      const c = at(19.39999, -99.09975);
      service([b, c, a])._updateSpreadOffsets();
      const [pa, pb, pc] = [drawn(a, 19.4, -99.1), drawn(b, 19.40001, -99.09975), drawn(c, 19.39999, -99.09975)];
      expect(pa.x).toBeLessThan(pb.x);
      expect(pa.x).toBeLessThan(pc.x);
      expect(pb.y).toBeLessThan(pc.y); // b is north of c
    });

    it("keeps east east when two share the centre", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.1);
      const east = at(19.4, -99.0998);
      const west = at(19.4, -99.1002);
      service([a, b, east, west])._updateSpreadOffsets();
      expect(drawn(east, 19.4, -99.0998).x).toBeGreaterThan(drawn(west, 19.4, -99.1002).x);
    });

    it("clears the spread once zooming in separates them", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.0999);
      const s = service([a, b]);
      s._updateSpreadOffsets();
      expect(a._spreadOffset).not.toBeNull();
      a._spreadApplied = a._spreadOffset;
      s.map = { latLngToLayerPoint: (ll) => point(ll.lng * 1e6, -ll.lat * 1e6) };
      s._updateSpreadOffsets();
      expect(a._spreadOffset).toBeNull();
      expect(b._spreadOffset).toBeNull();
    });

    it("waits for a view before spreading", () => {
      const a = at(19.4, -99.1);
      const b = at(19.4, -99.1);
      const s = service([a, b]);
      s.map = { latLngToLayerPoint: () => { throw new Error("Set map center and zoom first."); } };
      expect(() => s._updateSpreadOffsets()).not.toThrow();
      expect(a._updateMarkerIcon).not.toHaveBeenCalled();
    });

    it("leaves a lone marker unoffset", () => {
      const solo = at(19.4, -99.1);
      service([solo])._updateSpreadOffsets();
      expect(solo._spreadOffset).toBeNull();
      expect(solo._updateMarkerIcon).not.toHaveBeenCalled();
    });
  });
});