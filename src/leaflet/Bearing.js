import L from 'leaflet';
import Logger from '../util/Logger.js';

// Turning the map: `bearing` is the compass direction the top of the card
// points at, so `bearing: 90` puts east at the top, north on the left.
//
// Only quarter turns are supported, which keeps this small: Leaflet itself never
// learns the map is turned. It is laid out in a box of its own, as tall as the
// card is wide and as wide as it is tall, and that box is turned by CSS. Every
// bounds, fit, tile range and layer point stays an ordinary axis-aligned one in
// Leaflet's own frame ("container frame" below); only what reaches the screen
// is turned. What has to know about it:
// - markers, tooltips and controls are turned back so they stay upright;
// - pointer positions, drag offsets and arrow keys come from the screen, and
//   are turned into the container frame;
// - anything given in screen terms (the card's focus padding) is turned too.
//
// With no bearing none of this is installed.

/** The bearings that can be shown; anything else is treated as 0. */
export const BEARINGS = [0, 90, 180, 270];

/**
 * @param {*} value the configured `bearing`
 * @returns {number} 0, 90, 180 or 270
 */
export function normalizeBearing(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const degrees = Number(value);
  if (!Number.isFinite(degrees)) {
    Logger.warn(`[HaMapCard] bearing "${value}" is not a number; showing the map with north up.`);
    return 0;
  }
  const bearing = ((degrees % 360) + 360) % 360;
  if (!BEARINGS.includes(bearing)) {
    Logger.warn(`[HaMapCard] bearing ${value} is not a multiple of 90; showing the map with north up.`);
    return 0;
  }
  return bearing;
}

/**
 * @param {L.Map} map
 * @returns {number} the map's bearing, 0 for an ordinary map
 */
export function getBearing(map) {
  return map?._mapCardBearing ?? 0;
}

/**
 * Turn a vector by `degrees` clockwise on screen (y points down), the way CSS's
 * `rotate()` does. Quarter turns are exact, so pixels stay whole.
 * @param {number} degrees a multiple of 90
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
function turn(degrees, x, y) {
  switch (((degrees % 360) + 360) % 360) {
    case 90: return {x: -y || 0, y: x};
    case 180: return {x: -x || 0, y: -y || 0};
    case 270: return {x: y, y: -x || 0};
    default: return {x, y};
  }
}

/**
 * The container is turned anticlockwise by the bearing (CSS `rotate(-bearing)`),
 * which brings the bearing to the top. A vector on screen is the same vector in
 * the container frame turned back clockwise by it.
 * @param {number} bearing
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function screenToContainer(bearing, x, y) {
  return turn(bearing, x, y);
}

/**
 * A vector in the container frame, as it is seen on screen.
 * @param {number} bearing
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function containerToScreen(bearing, x, y) {
  return turn(-bearing, x, y);
}

const SIDES = ["top", "right", "bottom", "left"];

/**
 * A side of the screen as a side of the container: with `bearing: 90` the top of
 * the screen is the container's right.
 * @param {number} bearing
 * @param {string} side top, right, bottom or left
 * @returns {string}
 */
export function screenSideToContainer(bearing, side) {
  const i = SIDES.indexOf(side);
  return i < 0 ? side : SIDES[(i + bearing / 90) % 4];
}

/**
 * Padding given per side of the screen, as padding per side of the container.
 * @param {number} bearing
 * @param {{top: number, right: number, bottom: number, left: number}} padding
 * @returns {{top: number, right: number, bottom: number, left: number}}
 */
export function screenPaddingToContainer(bearing, padding) {
  const turned = {};
  for (const side of SIDES) {
    turned[screenSideToContainer(bearing, side)] = padding[side];
  }
  return turned;
}

/**
 * How much the card is scaled on screen (a CSS `zoom` or `transform: scale` on
 * something round it), from the container's on-screen box. That box is the
 * turned one, so on a quarter turn its width is the container's height.
 * @param {HTMLElement} container
 * @param {DOMRect} rect
 * @param {number} bearing
 * @returns {number}
 */
function screenScale(container, rect, bearing) {
  const across = bearing % 180 ? container.offsetHeight : container.offsetWidth;
  return (across && rect.width / across) || 1;
}

/**
 * Lay the map out turned: `outer` stays the card's own box on screen, and the
 * map goes in a new, turned box inside it.
 * @param {HTMLElement} outer the element the map fills on screen
 * @param {number} bearing 90, 180 or 270
 * @returns {HTMLElement} the element to create the Leaflet map in
 */
export function createTurnedContainer(outer, bearing) {
  outer.classList.add("map-card-turned");
  const inner = document.createElement("div");
  inner.className = `map-card-rotated map-card-bearing-${bearing}`;
  if (bearing % 180) {
    inner.classList.add("map-card-quarter-turn");
  }
  inner.style.transform = `rotate(${-bearing}deg)`;
  // What is turned back to stand upright again.
  inner.style.setProperty("--map-card-upright", `${bearing}deg`);
  outer.appendChild(inner);
  return inner;
}

/**
 * Undo createTurnedContainer, once the map in it has been removed.
 * @param {HTMLElement} inner
 */
export function removeTurnedContainer(inner) {
  inner.parentNode?.classList.remove("map-card-turned");
  inner.remove();
}

/**
 * Teach a map created in a turned container to read the screen.
 * @param {L.Map} map
 * @param {number} bearing 90, 180 or 270
 */
export function turnMap(map, bearing) {
  map._mapCardBearing = bearing;

  // Where a pointer is, for clicks, scroll-wheel and pinch zoom, box zoom and
  // sticky tooltips. Leaflet divides the on-screen box by the container's own
  // size, which on a quarter turn are each other's transpose, so measure from
  // the centre (which turning doesn't move) and turn the offset instead.
  map.mouseEventToContainerPoint = function (e) {
    const container = this._container;
    const rect = container.getBoundingClientRect();
    const scale = screenScale(container, rect, bearing);
    const v = screenToContainer(
      bearing,
      (e.clientX - rect.left - rect.width / 2) / scale,
      (e.clientY - rect.top - rect.height / 2) / scale,
    );
    return L.point(v.x + container.clientWidth / 2, v.y + container.clientHeight / 2);
  };

  // Dragging works on raw screen offsets from where the pointer went down, so
  // the map would slide sideways under the finger. Recompute the new position
  // from the same offset turned into the container frame, before Leaflet's own
  // predrag handlers (max bounds, world wrap) and the move itself see it.
  const draggable = map.dragging?._draggable;
  if (draggable) {
    const updatePosition = draggable._updatePosition;
    draggable._updatePosition = function () {
      const e = this._lastEvent;
      const first = e?.touches && e.touches.length === 1 ? e.touches[0] : e;
      if (first && this._startPoint && this._startPos) {
        const container = map._container;
        const scale = screenScale(container, container.getBoundingClientRect(), bearing);
        const v = screenToContainer(
          bearing,
          (first.clientX - this._startPoint.x) / scale,
          (first.clientY - this._startPoint.y) / scale,
        );
        this._newPos = this._startPos.add(L.point(v.x, v.y));
      }
      return updatePosition.apply(this, arguments);
    };
  }

  // Arrow keys pan the way they point on screen.
  const keyboard = map.keyboard;
  if (keyboard?._setPanDelta) {
    const setPanDelta = keyboard._setPanDelta;
    keyboard._setPanDelta = function () {
      setPanDelta.apply(this, arguments);
      for (const key of Object.keys(this._panKeys)) {
        const [x, y] = this._panKeys[key];
        const v = screenToContainer(bearing, x, y);
        this._panKeys[key] = [v.x, v.y];
      }
    };
    keyboard._setPanDelta(map.options.keyboardPanDelta);
  }
}

// Tooltips: a direction and offset are meant on screen ("top" is above the
// marker), so on a turned map they are turned into the container frame, and
// the text is turned back upright -- a quarter turn by writing it vertically,
// which keeps the box the shape of the text, anything left over by turning the
// text itself. Patched on Leaflet's Tooltip (bundled with this card, so no
// other map sees it), and only for tooltips on a turned map.
const tooltip = L.Tooltip?.prototype ?? {};
const setPosition = tooltip._setPosition;
tooltip._setPosition = function (pos) {
  const bearing = getBearing(this._map);
  if (!bearing) {
    return setPosition.call(this, pos);
  }
  const map = this._map;
  const container = this._container;
  const width = container.offsetWidth;
  const height = container.offsetHeight;
  let direction = this.options.direction;
  let offset = L.point(this.options.offset);
  let anchor = L.point(this._getAnchor());

  if (!["top", "bottom", "left", "right", "center"].includes(direction)) {
    // auto: on whichever side of the point faces the middle of the screen, the
    // offset mirrored for the left as Leaflet does.
    const fromCenter = map.layerPointToContainerPoint(pos).subtract(map.getSize().divideBy(2));
    const onScreen = containerToScreen(bearing, fromCenter.x, fromCenter.y);
    direction = onScreen.x < 0 ? "right" : "left";
    if (direction === "left") {
      offset = L.point(-offset.x, offset.y);
      anchor = L.point(-anchor.x, anchor.y);
    }
  }

  const turned = screenSideToContainer(bearing, direction);
  let sub;
  if (turned === "top") sub = [width / 2, height];
  else if (turned === "bottom") sub = [width / 2, 0];
  else if (turned === "right") sub = [0, height / 2];
  else if (turned === "left") sub = [width, height / 2];
  else sub = [width / 2, height / 2];

  const shift = screenToContainer(bearing, offset.x + anchor.x, offset.y + anchor.y);
  pos = pos.subtract(L.point(sub[0], sub[1], true)).add(L.point(shift.x, shift.y));

  for (const side of ["right", "left", "top", "bottom"]) {
    L.DomUtil.removeClass(container, "leaflet-tooltip-" + side);
  }
  L.DomUtil.addClass(container, "leaflet-tooltip-" + turned);
  L.DomUtil.setPosition(container, pos);
};

const updateContent = tooltip._updateContent;
tooltip._updateContent = function () {
  const result = updateContent.apply(this, arguments);
  const node = this._contentNode;
  if (getBearing(this._map) && node && !(node.childNodes.length === 1 && node.firstChild.classList?.contains("map-card-upright"))) {
    const upright = document.createElement("span");
    upright.className = "map-card-upright";
    while (node.firstChild) {
      upright.appendChild(node.firstChild);
    }
    node.appendChild(upright);
  }
  return result;
};
