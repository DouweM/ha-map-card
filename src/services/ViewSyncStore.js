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
 */

const store = new Map();

/** @returns {{center: L.LatLng, zoom: number}|undefined} */
export function getSharedView(group) {
  return group ? store.get(group) : undefined;
}

export function setSharedView(group, center, zoom) {
  if (group) {
    store.set(group, { center, zoom });
  }
}
