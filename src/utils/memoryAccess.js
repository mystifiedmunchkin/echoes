import {
  calculateBearing,
  getDistanceInMeters,
  getRelativeARPosition,
  spreadARPositions,
} from './geo';

// The map search area is wider than the radius that unlocks discovery.
export const MAP_RADIUS_METERS = 2500;
export const DISCOVERY_RADIUS_METERS = 50;

export function isGalaxyADevice(manufacturer, model, deviceId) {
  return manufacturer.toLowerCase() === 'samsung'
    && (/^Galaxy A\d/i.test(model) || /^SM-A\d/i.test(model) || /^SM-A\d/i.test(deviceId));
}

export function getMemoryDistance(location, memory) {
  // Unknown or invalid coordinates fail closed rather than unlocking nearby content.
  const coordinates = [
    location?.latitude, location?.longitude,
    memory?.lat ?? memory?.latitude, memory?.lng ?? memory?.longitude,
  ];
  if (coordinates.some((value) => value == null || value === '' || !Number.isFinite(Number(value)))) {
    return Infinity;
  }
  const [latitude, longitude, memoryLatitude, memoryLongitude] = coordinates.map(Number);
  if (Math.abs(latitude) > 90 || Math.abs(memoryLatitude) > 90
    || Math.abs(longitude) > 180 || Math.abs(memoryLongitude) > 180) return Infinity;
  return getDistanceInMeters(latitude, longitude, memoryLatitude, memoryLongitude);
}

export function canViewMemoryContent(location, memory, isGalaxyA) {
  // Nearby Galaxy A devices use the viewer fallback; other devices discover content in AR.
  return isGalaxyA && getMemoryDistance(location, memory) <= DISCOVERY_RADIUS_METERS;
}

export function createARSession(memories, location) {
  // Freeze proximity and marker coordinates at preparation time, nearest memories first.
  return spreadARPositions(memories
    .map((memory) => ({ memory, distanceMeters: getMemoryDistance(location, memory) }))
    .filter(({ distanceMeters }) => distanceMeters <= DISCOVERY_RADIUS_METERS)
    .map((entry) => {
      const bearingDeg = calculateBearing(
        location.latitude, location.longitude,
        entry.memory.lat ?? entry.memory.latitude,
        entry.memory.lng ?? entry.memory.longitude,
      );
      return {
        ...entry,
        bearingDeg,
        relativePosition: getRelativeARPosition(bearingDeg, entry.distanceMeters, DISCOVERY_RADIUS_METERS),
      };
    })
    .sort((left, right) => left.distanceMeters - right.distanceMeters));
}
