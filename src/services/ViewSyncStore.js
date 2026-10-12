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

/** @returns {{center: L.LatLng, zoom: number, movedAt: number|undefined}|undefined} */
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
  return { center: entry.center, zoom: entry.zoom, movedAt: entry.movedAt };
}

/**
 * Record a group's view. `byUser` is false for a move the card made itself (a
 * fit to its entities, or adopting this very view), which keeps the view but
 * not the moment: `movedAt` is when somebody last moved the map by hand, so a
 * card that adopts the view can hold off `focus_follow` from then on.
 */
export function setSharedView(group, center, zoom, byUser = true) {
  if (group) {
    const now = Date.now();
    const movedAt = byUser ? now : store.get(group)?.movedAt;
    store.set(group, { center, zoom, time: now, movedAt });
  }
}
