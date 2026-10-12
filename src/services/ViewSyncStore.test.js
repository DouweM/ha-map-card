import { describe, it, expect } from '@jest/globals';
import { getSharedView, setSharedView } from "./ViewSyncStore";

describe("ViewSyncStore", () => {
  it("remembers when somebody last moved the map, not when the card did", () => {
    setSharedView("a", [1, 2], 10);
    const moved = getSharedView("a").movedAt;
    expect(moved).toBeDefined();

    setSharedView("a", [3, 4], 12, false);
    expect(getSharedView("a")).toEqual({ center: [3, 4], zoom: 12, movedAt: moved });
  });

  it("has no move for a view only a card ever set", () => {
    setSharedView("b", [1, 2], 10, false);
    expect(getSharedView("b").movedAt).toBeUndefined();
  });
});
