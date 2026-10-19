import {
  MAP_RADIUS_METERS,
  DISCOVERY_RADIUS_METERS,
  canViewMemoryContent,
  createARSession,
  getMemoryDistance,
  isGalaxyADevice,
} from '../src/utils/memoryAccess';
import { createRadiusPolygon, getDistanceInMeters } from '../src/utils/geo';

const origin = { latitude: 0, longitude: 0 };
const memoryAt = (meters, id = meters) => ({
  id, lat: 0, lng: (meters / 6371000) * (180 / Math.PI),
});

describe('memory discovery limits', () => {
  test('uses a 2.5 km map radius and a 50 m discovery radius', () => {
    expect(MAP_RADIUS_METERS).toBe(2500);
    expect(DISCOVERY_RADIUS_METERS).toBe(50);
  });

  test.each([0, 49.999, 50])('allows Galaxy A viewer access at %s m', (meters) => {
    expect(canViewMemoryContent(origin, memoryAt(meters), true)).toBe(true);
  });

  test.each([50.001, 100, 2500])('restricts all devices to previews at %s m', (meters) => {
    expect(canViewMemoryContent(origin, memoryAt(meters), true)).toBe(false);
    expect(canViewMemoryContent(origin, memoryAt(meters), false)).toBe(false);
  });

  test('reserves nearby content for AR on other devices', () => {
    expect(canViewMemoryContent(origin, memoryAt(1), false)).toBe(false);
  });

  test.each([
    [null, memoryAt(0)],
    [origin, { lat: null, lng: 0 }],
    [origin, { lat: '', lng: 0 }],
    [origin, { lat: 'invalid', lng: 0 }],
    [origin, { lat: 91, lng: 0 }],
    [origin, { lat: 0, lng: 181 }],
  ])('does not unlock content without valid coordinates', (location, memory) => {
    expect(getMemoryDistance(location, memory)).toBe(Infinity);
    expect(canViewMemoryContent(location, memory, true)).toBe(false);
  });

  test('accepts numeric strings and alternate coordinate fields, including zero', () => {
    expect(getMemoryDistance(origin, { latitude: '0', longitude: '0' })).toBe(0);
  });

  test('captures only nearby memories, sorted, with scaled and separated AR positions', () => {
    const session = createARSession([
      memoryAt(50), memoryAt(50.001), memoryAt(2500),
      memoryAt(10), memoryAt(10, 'duplicate-location'),
      { id: 'no-coordinates' },
    ], origin);
    expect(session.map(({ memory }) => memory.id)).toEqual([10, 'duplicate-location', 50]);
    expect(session.every(({ distanceMeters }) => distanceMeters <= 50)).toBe(true);
    expect(session[2].relativePosition[0]).toBeCloseTo(2.5);
    expect(session[0].relativePosition).not.toEqual(session[1].relativePosition);
    expect(createARSession([memoryAt(0)], origin)[0].relativePosition).not.toEqual([0, 0, 0]);
    expect(createARSession([memoryAt(0)], null)).toEqual([]);
  });

  test.each([50, 2500])('draws the geographic circle at %s m', (radius) => {
    const polygon = createRadiusPolygon(48.86, 2.35, radius);
    expect(polygon.geometry.coordinates[0]).toHaveLength(65);
    polygon.geometry.coordinates[0].forEach(([lng, lat]) => {
      expect(getDistanceInMeters(48.86, 2.35, lat, lng)).toBeCloseTo(radius, 5);
    });
  });
});

describe('Galaxy A fallback', () => {
  test.each([
    ['Samsung', 'Galaxy A52', 'a52'],
    ['samsung', 'SM-A525F', 'a52'],
    ['samsung', 'unknown', 'SM-A536B'],
  ])('recognizes %s %s (%s)', (manufacturer, model, deviceId) => {
    expect(isGalaxyADevice(manufacturer, model, deviceId)).toBe(true);
  });

  test.each([
    ['samsung', 'SM-S928B', 'SM-S928B'],
    ['samsung', 'Galaxy M52', 'SM-M526B'],
    ['samsung', 'Galaxy S24', 'SM-S921B'],
    ['Google', 'Pixel 8', 'husky'],
    ['Apple', 'iPhone 15', 'iPhone15,4'],
  ])('does not disable AR on %s %s', (manufacturer, model, deviceId) => {
    expect(isGalaxyADevice(manufacturer, model, deviceId)).toBe(false);
  });
});
