// Great-circle distance and initial bearing, with the same formulas and Earth radius as Turf.

const EARTH_RADIUS_M = 6371008.8;
const METERS_PER_MILE = 1609.344;
const rad = (d) => (d * Math.PI) / 180;

/** distanceMeters is the haversine distance between two [lon, lat] points. */
export function distanceMeters([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(rad(lat1)) * Math.cos(rad(lat2));
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * EARTH_RADIUS_M;
}

export const distanceMiles = (a, b) => distanceMeters(a, b) / METERS_PER_MILE;

/** bearingDegrees is the initial bearing from a to b, from -180 to 180 degrees. */
export function bearingDegrees([lon1, lat1], [lon2, lat2]) {
  const l1 = rad(lat1);
  const l2 = rad(lat2);
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}
