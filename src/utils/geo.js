/** Geographic distance and map-radius formatting helpers. */
export function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatRadiusText(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

export function createRadiusPolygon(latitude, longitude, radiusMeters, steps = 64) {
  const earthRadiusMeters = 6371000;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const coordinates = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const pointLatitude = Math.asin(
      Math.sin(latitudeRadians) * Math.cos(angularDistance)
      + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLongitude = longitudeRadians + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
      Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(pointLatitude),
    );
    coordinates.push([
      (pointLongitude * 180) / Math.PI,
      (pointLatitude * 180) / Math.PI,
    ]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

/**
 * @returns {[number, number, number]}
 */
export function getRelativeARPosition(
  bearingDeg,
  distanceMeters,
  maxRadiusMeters = 5000,
  worldRadiusMeters = 2.5,
) {
  const bearingRadians = (bearingDeg * Math.PI) / 180;
  const distanceScale = Math.min(
    Math.max(distanceMeters, 0) / maxRadiusMeters,
    1,
  ) * worldRadiusMeters;

  return [
    Math.sin(bearingRadians) * distanceScale,
    0,
    -Math.cos(bearingRadians) * distanceScale,
  ];
}

export function spreadARPositions(entries, minimumDistance = 0.18) {
  const placed = [];

  return entries.map((entry, index) => {
    const base = entry.relativePosition || [0, 0, 0];
    let candidate = [...base];
    let attempt = 0;

    while (placed.some((position) => {
      const dx = candidate[0] - position[0];
      const dz = candidate[2] - position[2];
      return Math.hypot(dx, dz) < minimumDistance;
    })) {
      const angle = ((index + attempt) * 137.5 * Math.PI) / 180;
      const distance = minimumDistance * (1 + Math.floor(attempt / 8) * 0.5);
      candidate = [
        base[0] + Math.cos(angle) * distance,
        base[1],
        base[2] + Math.sin(angle) * distance,
      ];
      attempt += 1;
    }

    placed.push(candidate);
    return { ...entry, relativePosition: candidate };
  });
}

export function calculateBearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}