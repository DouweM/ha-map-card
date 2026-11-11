import L from "leaflet";
import { describe, it, expect, jest, afterEach } from "@jest/globals";
import {
  normalizeBearing,
  getBearing,
  createTurnedContainer,
  removeTurnedContainer,
  turnMap,
  screenToContainer,
  containerToScreen,
  screenPaddingToContainer,
} from "./Bearing.js";
import Logger from "../util/Logger.js";
import MapCard from "../components/MapCard.js";

// Only MapCard's stylesheet is used here, as text.
jest.mock("lit", () => ({
  LitElement: class LitElement {},
  html: (strings) => strings.join(""),
  css: (strings) => strings.join(""),
}));

// The card on screen: 300px wide, 200px tall, at (10, 20).
const SCREEN = {left: 10, top: 20, width: 300, height: 200};
const CENTER = [19.4326, -99.1332];

function sized(el, width, height) {
  Object.defineProperty(el, "clientWidth", {value: width, configurable: true});
  Object.defineProperty(el, "clientHeight", {value: height, configurable: true});
  Object.defineProperty(el, "offsetWidth", {value: width, configurable: true});
  Object.defineProperty(el, "offsetHeight", {value: height, configurable: true});
}

/**
 * A real Leaflet map laid out as MapCard lays out a turned one, with the sizes a
 * browser would give it (jsdom does no layout): the turned box is the card
 * transposed, and its on-screen box is the card's.
 */
function turnedMap(bearing, scale = 1) {
  const outer = document.createElement("div");
  document.body.appendChild(outer);
  const inner = createTurnedContainer(outer, bearing);
  const quarter = bearing % 180 !== 0;
  sized(inner, quarter ? SCREEN.height : SCREEN.width, quarter ? SCREEN.width : SCREEN.height);
  inner.getBoundingClientRect = () => ({
    left: SCREEN.left, top: SCREEN.top,
    width: SCREEN.width * scale, height: SCREEN.height * scale,
    right: SCREEN.left + SCREEN.width * scale, bottom: SCREEN.top + SCREEN.height * scale,
  });
  const map = L.map(inner).setView(CENTER, 18);
  turnMap(map, bearing);
  return {outer, inner, map};
}

/**
 * Where a container point lands on screen, relative to the card's centre, by
 * what CSS does with the transform on the turned box: rotate(a) is the matrix
 * [cos a, -sin a; sin a, cos a] with y pointing down (clockwise on screen), about
 * the box's centre. Deliberately not Bearing.js's own helpers.
 */
function onScreen(inner, p) {
  const match = /rotate\((-?[\d.]+)deg\)/.exec(inner.style.transform);
  const a = (match ? Number(match[1]) : 0) * Math.PI / 180;
  const x = p.x - inner.clientWidth / 2;
  const y = p.y - inner.clientHeight / 2;
  const round = (v) => Math.round(v * 1000) / 1000 || 0;
  return {x: round(x * Math.cos(a) - y * Math.sin(a)), y: round(x * Math.sin(a) + y * Math.cos(a))};
}

afterEach(() => {
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("normalizeBearing", () => {
  it("takes quarter turns, any way they are written", () => {
    expect(normalizeBearing(90)).toBe(90);
    expect(normalizeBearing("180")).toBe(180);
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(450)).toBe(90);
    expect(normalizeBearing(360)).toBe(0);
  });

  it("treats no bearing as 0 without a word", () => {
    const warn = jest.spyOn(Logger, "warn").mockImplementation(() => {});
    expect(normalizeBearing(undefined)).toBe(0);
    expect(normalizeBearing(null)).toBe(0);
    expect(normalizeBearing(0)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about anything else and shows north up", () => {
    const warn = jest.spyOn(Logger, "warn").mockImplementation(() => {});
    expect(normalizeBearing(45)).toBe(0);
    expect(normalizeBearing("east")).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("the direction of bearing: 90", () => {
  const ahead = (map, dLat, dLng) =>
    map.latLngToContainerPoint([CENTER[0] + dLat, CENTER[1] + dLng]);

  it("puts east at the top, north on the left, south on the right and west at the bottom", () => {
    const {inner, map} = turnedMap(90);
    const d = 0.0002;
    const east = onScreen(inner, ahead(map, 0, d));
    const north = onScreen(inner, ahead(map, d, 0));
    const south = onScreen(inner, ahead(map, -d, 0));
    const west = onScreen(inner, ahead(map, 0, -d));

    expect(east.x).toBe(0);
    expect(east.y).toBeLessThan(0); // above the centre
    expect(north.y).toBe(0);
    expect(north.x).toBeLessThan(0);
    expect(south.x).toBeGreaterThan(0);
    expect(west.y).toBeGreaterThan(0);
  });

  it("fills the card: the turned box covers exactly the card's own box", () => {
    const {inner} = turnedMap(90);
    const corners = [[0, 0], [inner.clientWidth, inner.clientHeight]].map(([x, y]) => onScreen(inner, {x, y}));
    const xs = corners.map((c) => Math.abs(c.x));
    const ys = corners.map((c) => Math.abs(c.y));
    expect(xs).toEqual([SCREEN.width / 2, SCREEN.width / 2]);
    expect(ys).toEqual([SCREEN.height / 2, SCREEN.height / 2]);
  });

  it("agrees with the helpers the rest of the card uses", () => {
    for (const bearing of [90, 180, 270]) {
      const {inner, map} = turnedMap(bearing);
      const p = ahead(map, 0.0001, 0.0003);
      const fromCenter = {x: p.x - inner.clientWidth / 2, y: p.y - inner.clientHeight / 2};
      expect(containerToScreen(bearing, fromCenter.x, fromCenter.y)).toEqual(onScreen(inner, p));
      const back = screenToContainer(bearing, ...Object.values(onScreen(inner, p)));
      expect(back.x).toBeCloseTo(fromCenter.x);
      expect(back.y).toBeCloseTo(fromCenter.y);
    }
  });
});

describe("pointer input on a turned map", () => {
  it("reads a click above the centre as east of it", () => {
    const {map} = turnedMap(90);
    const p = map.mouseEventToContainerPoint({
      clientX: SCREEN.left + SCREEN.width / 2,
      clientY: SCREEN.top + SCREEN.height / 2 - 50,
    });
    const at = map.containerPointToLatLng(p);
    expect(at.lng).toBeGreaterThan(CENTER[1]);
    expect(at.lat).toBeCloseTo(CENTER[0], 6);
  });

  it("lands a click where the point under it is drawn, at any bearing and scale", () => {
    for (const bearing of [90, 180, 270]) {
      for (const scale of [1, 1.5]) {
        const {inner, map} = turnedMap(bearing, scale);
        const target = map.latLngToContainerPoint([CENTER[0] + 0.0001, CENTER[1] + 0.0002]);
        const s = onScreen(inner, target);
        const p = map.mouseEventToContainerPoint({
          clientX: SCREEN.left + (SCREEN.width / 2 + s.x) * scale,
          clientY: SCREEN.top + (SCREEN.height / 2 + s.y) * scale,
        });
        expect(p.x).toBeCloseTo(target.x);
        expect(p.y).toBeCloseTo(target.y);
      }
    }
  });

  it("drags the map along under the finger", () => {
    const {inner, map} = turnedMap(90);
    const draggable = map.dragging._draggable;
    // Finger down, then 40px right and 25px up on screen.
    draggable._startPoint = L.point(100, 100);
    draggable._startPos = L.point(0, 0);
    draggable._newPos = L.point(999, 999); // what Leaflet's own sum would be is ignored
    draggable._lastEvent = {clientX: 140, clientY: 75};
    draggable._updatePosition();

    const moved = draggable._newPos;
    const s = onScreen(inner, {x: moved.x + inner.clientWidth / 2, y: moved.y + inner.clientHeight / 2});
    expect(s).toEqual({x: 40, y: -25});
    expect(L.DomUtil.getPosition(map._mapPane)).toEqual(moved);
  });

  it("pans the way the arrow keys point", () => {
    const {map} = turnedMap(90);
    const up = map.keyboard._panKeys[38];
    // Up on screen is east, which is +x in the map's own frame.
    expect(up[0]).toBeGreaterThan(0);
    expect(up[1]).toBe(0);
  });
});

describe("tooltips on a turned map", () => {
  it("opens a 'top' tooltip above the marker on screen, its text upright", () => {
    const {map} = turnedMap(90);
    const marker = L.marker(CENTER, {icon: L.divIcon({html: "<div>x</div>"})}).addTo(map);
    marker.bindTooltip("Douwe", {direction: "top", offset: [0, -28]}).openTooltip();
    const el = marker.getTooltip().getElement();

    // Top of the screen is the map's right, so is its arrow side.
    expect(el.classList.contains("leaflet-tooltip-right")).toBe(true);
    expect(el.firstChild.className).toBe("map-card-upright");
    expect(el.textContent).toBe("Douwe");

    // The offset went up the screen too: 28px towards +x in the map's frame.
    const at = L.DomUtil.getPosition(el);
    const point = map.latLngToLayerPoint(CENTER);
    expect(at.x - point.x).toBe(28);

    // New content is set upright as well, and only wrapped once.
    marker.setTooltipContent("Gaby");
    expect(el.querySelectorAll(".map-card-upright").length).toBe(1);
    expect(el.textContent).toBe("Gaby");
  });

  it("leaves tooltips on an ordinary map alone", () => {
    const el = document.createElement("div");
    sized(el, 300, 200);
    document.body.appendChild(el);
    const map = L.map(el).setView(CENTER, 18);
    const marker = L.marker(CENTER, {icon: L.divIcon({html: "<div>x</div>"})}).addTo(map);
    marker.bindTooltip("Douwe", {direction: "top"}).openTooltip();
    const tip = marker.getTooltip().getElement();
    expect(tip.classList.contains("leaflet-tooltip-top")).toBe(true);
    expect(tip.innerHTML).toBe("Douwe");
  });
});

describe("markers on a turned map", () => {
  // The card's own stylesheet, so the rules under test are the ones shipped.
  function cardStyles() {
    const style = document.createElement("style");
    style.textContent = String(MapCard.styles);
    document.head.appendChild(style);
    return [...style.sheet.cssRules].filter((r) => r.style?.transform);
  }

  it("turns what's inside a marker back upright, and not what carries its position or spread", () => {
    const rules = cardStyles();
    const {inner, map} = turnedMap(90);
    const html = '<div class="spread-wrapper" style="transform: translate(30px, 0px);"><map-card-entity-marker></map-card-entity-marker></div>';
    const marker = L.marker(CENTER, {icon: L.divIcon({html, className: "", iconSize: [48, 48]})}).addTo(map);
    const icon = marker.getElement();
    const face = icon.querySelector("map-card-entity-marker");
    const wrapper = icon.querySelector(".spread-wrapper");
    const turning = (el) => rules.filter((r) => el.matches(r.selectorText));

    const upright = turning(face);
    expect(upright.length).toBe(1);
    expect(upright[0].style.transform).toBe("rotate(var(--map-card-upright))");
    // The box turns by -90, the face back by +90: upright.
    expect(inner.style.transform).toBe("rotate(-90deg)");
    expect(inner.style.getPropertyValue("--map-card-upright")).toBe("90deg");
    expect(turning(wrapper)).toEqual([]);
    expect(turning(icon)).toEqual([]);

    // A cluster's icon (no spread wrapper) is turned upright as well.
    const cluster = L.marker(CENTER, {icon: L.divIcon({html: "<div><span>3</span></div>", className: "marker-cluster"})}).addTo(map);
    expect(turning(cluster.getElement().firstChild).length).toBe(1);
  });

  it("matches nothing on an ordinary map", () => {
    const rules = cardStyles();
    const el = document.createElement("div");
    sized(el, 300, 200);
    document.body.appendChild(el);
    const map = L.map(el).setView(CENTER, 18);
    const marker = L.marker(CENTER, {icon: L.divIcon({html: '<div class="spread-wrapper"><map-card-entity-marker></map-card-entity-marker></div>'})}).addTo(map);
    const face = marker.getElement().querySelector("map-card-entity-marker");
    expect(rules.filter((r) => face.matches(r.selectorText))).toEqual([]);
  });
});

describe("image overlays on a turned map", () => {
  it("are laid out in the map's own frame, so they turn with the tiles", () => {
    const {inner, map} = turnedMap(90);
    const overlay = L.imageOverlay("aerial.png", [[CENTER[0] - 0.0005, CENTER[1] - 0.0002], [CENTER[0] + 0.0005, CENTER[1] + 0.0002]]).addTo(map);
    const img = overlay.getElement();
    expect(inner.contains(img)).toBe(true);
    // A tall (north-south) image is tall in the map's frame, and so lies on its
    // side on screen once the box is turned: north to the left.
    expect(parseFloat(img.style.height)).toBeGreaterThan(parseFloat(img.style.width));
  });
});

describe("focus padding", () => {
  it("turns screen sides into the map's", () => {
    // Bearing 90: the screen's top is the map's right, its right the map's bottom.
    expect(screenPaddingToContainer(90, {top: 1, right: 2, bottom: 3, left: 4}))
      .toEqual({right: 1, bottom: 2, left: 3, top: 4});
    expect(screenPaddingToContainer(0, {top: 1, right: 2, bottom: 3, left: 4}))
      .toEqual({top: 1, right: 2, bottom: 3, left: 4});
  });
});

describe("turning and unturning", () => {
  it("knows the bearing of a turned map only", () => {
    const {map} = turnedMap(270);
    expect(getBearing(map)).toBe(270);
    expect(getBearing({})).toBe(0);
    expect(getBearing(undefined)).toBe(0);
  });

  it("removes its box", () => {
    const {outer, inner, map} = turnedMap(90);
    map.remove();
    removeTurnedContainer(inner);
    expect(outer.children.length).toBe(0);
    expect(outer.classList.contains("map-card-turned")).toBe(false);
  });
});
