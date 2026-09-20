/**
 * Locations and the handoff to a real maps app.
 *
 * SPEC.md deliberately keeps no routing engine here: the map shows where a
 * place is, and "Get there" hands the destination to Google or Apple Maps in
 * transit mode, which already know Bangkok's BTS, MRT and buses.
 */

export type Coordinates = { latitude: number; longitude: number };

export type Destination = {
  latitude: number | null;
  longitude: number | null;
  name: string;
};

const PAIR = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function inRange(latitude: number, longitude: number): Coordinates | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Accepts either a typed "lat, lng" pair or a pasted Google Maps link, since
 * copying the link is what people actually do on a phone.
 */
export function parseCoordinates(raw: string): Coordinates | null {
  const value = raw.trim();
  if (!value) return null;

  // `@lat,lng` is how Google Maps encodes the map centre in a place URL.
  const at = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(value);
  if (at) return inRange(Number(at[1]), Number(at[2]));

  const query = /[?&]q=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(value);
  if (query) return inRange(Number(query[1]), Number(query[2]));

  // A bare pair, but only if that is all the value contains — otherwise stray
  // numbers in a sentence would read as a location.
  const pair = PAIR.exec(value);
  if (pair && pair[0].trim() === value) {
    return inRange(Number(pair[1]), Number(pair[2]));
  }

  return null;
}

function destinationParam(destination: Destination): string {
  if (destination.latitude !== null && destination.longitude !== null) {
    return `${destination.latitude},${destination.longitude}`;
  }
  return destination.name;
}

/** Google Maps directions, transit mode, origin left as the user's location. */
export function googleMapsTransitUrl(destination: Destination): string {
  const params = new URLSearchParams({
    api: "1",
    destination: destinationParam(destination),
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Apple Maps directions; dirflg=r is transit. */
export function appleMapsTransitUrl(destination: Destination): string {
  const params = new URLSearchParams({
    daddr: destinationParam(destination),
    dirflg: "r",
  });
  return `https://maps.apple.com/?${params.toString()}`;
}
