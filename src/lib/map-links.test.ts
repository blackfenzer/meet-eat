import { describe, expect, it } from "vitest";
import { appleMapsTransitUrl, googleMapsTransitUrl, parseCoordinates } from "./map-links";

describe("parseCoordinates", () => {
  it("reads a plain comma-separated pair", () => {
    expect(parseCoordinates("13.7455, 100.5343")).toEqual({
      latitude: 13.7455,
      longitude: 100.5343,
    });
  });

  it("reads a pair with no space", () => {
    expect(parseCoordinates("13.7455,100.5343")).toEqual({
      latitude: 13.7455,
      longitude: 100.5343,
    });
  });

  it("reads negative coordinates", () => {
    expect(parseCoordinates("-33.8688,151.2093")).toEqual({
      latitude: -33.8688,
      longitude: 151.2093,
    });
  });

  it("reads a Google Maps place URL", () => {
    const url =
      "https://www.google.com/maps/place/Som+Tam+Nua/@13.7455,100.5343,17z/data=!3m1";
    expect(parseCoordinates(url)).toEqual({ latitude: 13.7455, longitude: 100.5343 });
  });

  it("reads a Google Maps query URL", () => {
    expect(parseCoordinates("https://maps.google.com/?q=13.7455,100.5343")).toEqual({
      latitude: 13.7455,
      longitude: 100.5343,
    });
  });

  it("reads an at-style Google Maps URL", () => {
    expect(parseCoordinates("https://www.google.com/maps/@13.7455,100.5343,15z")).toEqual({
      latitude: 13.7455,
      longitude: 100.5343,
    });
  });

  it("rejects an out-of-range latitude", () => {
    expect(parseCoordinates("91.0, 100.5")).toBeNull();
  });

  it("rejects an out-of-range longitude", () => {
    expect(parseCoordinates("13.7, 181.0")).toBeNull();
  });

  it("rejects a single number", () => {
    expect(parseCoordinates("13.7455")).toBeNull();
  });

  it("rejects free text", () => {
    expect(parseCoordinates("Siam Square Soi 5")).toBeNull();
  });

  it("rejects an empty value", () => {
    expect(parseCoordinates("")).toBeNull();
  });

  it("accepts the exact bounds", () => {
    expect(parseCoordinates("-90,180")).toEqual({ latitude: -90, longitude: 180 });
  });
});

describe("googleMapsTransitUrl", () => {
  it("routes to coordinates in transit mode", () => {
    const url = googleMapsTransitUrl({ latitude: 13.7455, longitude: 100.5343, name: "Som Tam Nua" });
    expect(url).toContain("travelmode=transit");
    expect(url).toContain("destination=13.7455%2C100.5343");
  });

  it("falls back to the place name when there are no coordinates", () => {
    const url = googleMapsTransitUrl({ latitude: null, longitude: null, name: "Som Tam Nua" });
    expect(url).toContain("destination=Som+Tam+Nua");
    expect(url).toContain("travelmode=transit");
  });

  it("escapes a name with special characters", () => {
    const url = googleMapsTransitUrl({ latitude: null, longitude: null, name: "Jay & Fai" });
    expect(url).not.toContain("Jay & Fai");
    expect(url).toContain("Jay+%26+Fai");
  });

  it("is an https google maps link", () => {
    const url = googleMapsTransitUrl({ latitude: 1, longitude: 2, name: "x" });
    expect(url.startsWith("https://www.google.com/maps/dir/")).toBe(true);
  });
});

describe("appleMapsTransitUrl", () => {
  it("routes to coordinates with the transit flag", () => {
    const url = appleMapsTransitUrl({ latitude: 13.7455, longitude: 100.5343, name: "Som Tam Nua" });
    expect(url).toContain("daddr=13.7455%2C100.5343");
    expect(url).toContain("dirflg=r");
  });

  it("falls back to the place name", () => {
    const url = appleMapsTransitUrl({ latitude: null, longitude: null, name: "Som Tam Nua" });
    expect(url).toContain("daddr=Som+Tam+Nua");
  });

  it("is an https apple maps link", () => {
    const url = appleMapsTransitUrl({ latitude: 1, longitude: 2, name: "x" });
    expect(url.startsWith("https://maps.apple.com/")).toBe(true);
  });
});
