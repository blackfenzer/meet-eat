import { describe, expect, it } from "vitest";
import { displayNameFor } from "./display-name";

const mook = { id: "p1", name: "Mook", guestNumber: 1 };
const ploy = { id: "p2", name: "Ploy", guestNumber: 2 };

describe("displayNameFor", () => {
  it("shows real names when anonymous mode is off", () => {
    expect(displayNameFor(ploy, { anonymous: false, viewerId: "p1", viewerIsAdmin: false }))
      .toBe("Ploy");
  });

  it("hides other people behind a stable guest label", () => {
    expect(displayNameFor(ploy, { anonymous: true, viewerId: "p1", viewerIsAdmin: false }))
      .toBe("Guest 2");
  });

  it("uses the participant's own number, not their position in a list", () => {
    expect(displayNameFor({ ...ploy, guestNumber: 7 }, {
      anonymous: true, viewerId: "p1", viewerIsAdmin: false,
    })).toBe("Guest 7");
  });

  it("still shows you your own name", () => {
    expect(displayNameFor(ploy, { anonymous: true, viewerId: "p2", viewerIsAdmin: false }))
      .toBe("Ploy");
  });

  it("always shows real names to the organiser, who has to moderate", () => {
    expect(displayNameFor(ploy, { anonymous: true, viewerId: "p1", viewerIsAdmin: true }))
      .toBe("Ploy");
  });

  it("does not depend on who is asking when anonymous mode is off", () => {
    expect(displayNameFor(mook, { anonymous: false, viewerId: "p2", viewerIsAdmin: false }))
      .toBe("Mook");
  });
});
