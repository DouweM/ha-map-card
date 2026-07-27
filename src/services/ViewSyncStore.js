/**
 * Shared map view state, keyed by a `sync_group` name.
 *
 * Cards that set the same `sync_group` share their center/zoom: panning or
 * zooming one updates the store, and any other card in the group adopts that
 * view when it is (re)created — e.g. when switching between dashboard tabs.
 *
 * The store lives in module scope, so it is re-created on every full page
 * load. That means the synced view is intentionally forgotten on reload and
 * each card falls back to its configured default position.
 *
 * A synced view is also forgotten after TTL_MS of inactivity (no pan/zoom or
 * tab switch that re-applies it), so the maps return to their default framing.
 */

const store = new Map();

// Forget a synced view this long after it was last set.
const TTL_MS = 10 * 60 * 1000;

/** @returns {{center: L.LatLng, zoom: number}|undefined} */
export function getSharedView(group) {
  if (!group) {
    return undefined;
  }
  const entry = store.get(group);
  if (!entry) {
    return undefined;
  }
  if (Date.now() - entry.time > TTL_MS) {
    store.delete(group);
    return undefined;
  }
  return { center: entry.center, zoom: entry.zoom };
}

export function setSharedView(group, center, zoom) {
  if (group) {
    store.set(group, { center, zoom, time: Date.now() });
  }
}
