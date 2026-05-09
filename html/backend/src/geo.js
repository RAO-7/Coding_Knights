const EARTH_RADIUS_KM = 6371;
const KM_PER_KNOT = 1.852;

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function movePoint(lat, lng, headingDeg, distKm) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const angDist = distKm / EARTH_RADIUS_KM;
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const bearing = toRad(headingDeg);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
    Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(p1, p2, p3, p4) {
  const ccw = (A, B, C) =>
    (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

function pathIntersectsPolygon(path, polygon) {
  for (let i = 0; i < path.length - 1; i++) {
    const seg = [
      [path[i].lng, path[i].lat],
      [path[i + 1].lng, path[i + 1].lat],
    ];
    for (let j = 0; j < polygon.length - 1; j++) {
      if (segmentsIntersect(seg[0], seg[1], polygon[j], polygon[j + 1])) return true;
    }
    if (segmentsIntersect(seg[0], seg[1], polygon[polygon.length - 1], polygon[0])) return true;
  }
  for (const pt of path) {
    if (pointInPolygon(pt.lat, pt.lng, polygon)) return true;
  }
  return false;
}

function fuelBurnPerKm(inAdverseWeather = false) {
  const base = 0.01;
  return inAdverseWeather ? base * 1.3 : base;
}

function estimatedRangeKm(fuelPct, inAdverseWeather = false) {
  return fuelPct / fuelBurnPerKm(inAdverseWeather);
}

module.exports = {
  haversineKm, bearingDeg, movePoint,
  pointInPolygon, pathIntersectsPolygon, segmentsIntersect,
  fuelBurnPerKm, estimatedRangeKm, KM_PER_KNOT,
};