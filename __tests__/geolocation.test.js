import * as Location from 'expo-location';
import { NativeModules, PermissionsAndroid } from 'react-native';
import * as ios from '../src/services/geolocation.ios';
import * as android from '../src/services/geolocation.js';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4, Highest: 5 },
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { EchoesLocation: { getCurrentPosition: jest.fn() } },
  PermissionsAndroid: {
    requestMultiple: jest.fn(),
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'fine',
      ACCESS_COARSE_LOCATION: 'coarse',
    },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  },
}));

const position = {
  coords: { latitude: 44.0223, longitude: 1.3532, accuracy: 10 },
  timestamp: 1000,
};
let onPosition;
let onError;
let subscription;

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  subscription = { remove: jest.fn() };
  Location.getLastKnownPositionAsync.mockResolvedValue(null);
  Location.watchPositionAsync.mockImplementation(async (_options, callback, errorHandler) => {
    onPosition = callback;
    onError = errorHandler;
    return subscription;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

async function startWatch(options = {}) {
  const request = ios.getCurrentPositionAsync({ maximumAge: 0, ...options });
  await Promise.resolve();
  return { request };
}

test.each(['granted', 'denied'])('preserves iOS permission status %s and retry information', async status => {
  const permission = { status, granted: status === 'granted', canAskAgain: false };
  Location.requestForegroundPermissionsAsync.mockResolvedValue(permission);
  await expect(ios.requestForegroundPermissionsAsync()).resolves.toBe(permission);
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled();
});

test('reuses an iOS fix only through the requested maximum age', async () => {
  Location.getLastKnownPositionAsync.mockResolvedValue(position);
  await expect(ios.getCurrentPositionAsync({ maximumAge: 5000 })).resolves.toBe(position);
  expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 5000 });
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('uses the same default maximum age as Android', async () => {
  Location.getLastKnownPositionAsync.mockResolvedValue(position);
  await expect(ios.getCurrentPositionAsync()).resolves.toBe(position);
  expect(Location.getLastKnownPositionAsync).toHaveBeenCalledWith({ maxAge: 10000 });
});

test('requests a live fix when the cache is missing and releases the watcher', async () => {
  const request = ios.getCurrentPositionAsync();
  await Promise.resolve();
  await Promise.resolve();
  onPosition(position);
  await expect(request).resolves.toBe(position);
  expect(Location.watchPositionAsync).toHaveBeenCalledWith(
    { accuracy: Location.Accuracy.High }, expect.any(Function), expect.any(Function),
  );
  expect(subscription.remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('maximumAge zero bypasses the cache and high accuracy requests the best GPS fix', async () => {
  const { request } = await startWatch({ enableHighAccuracy: true });
  expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
  expect(Location.watchPositionAsync).toHaveBeenCalledWith(
    { accuracy: Location.Accuracy.Highest }, expect.any(Function), expect.any(Function),
  );
  onPosition(position);
  await expect(request).resolves.toBe(position);
});

test('rejects on timeout and releases the native watcher', async () => {
  const { request } = await startWatch({ timeout: 500 });
  const result = request.catch(error => error);
  jest.advanceTimersByTime(499);
  expect(subscription.remove).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await expect(result).resolves.toMatchObject({ code: 'TIMEOUT' });
  expect(subscription.remove).toHaveBeenCalledTimes(1);
  onPosition(position);
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});

test('the default timeout is 20000 ms', async () => {
  const { request } = await startWatch();
  const result = request.catch(error => error);
  jest.advanceTimersByTime(19999);
  expect(subscription.remove).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await expect(result).resolves.toMatchObject({ code: 'TIMEOUT' });
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});

test('does not start native updates if the cache lookup resolves after timeout', async () => {
  let completeCache;
  Location.getLastKnownPositionAsync.mockImplementation(() => new Promise(resolve => {
    completeCache = resolve;
  }));
  const request = ios.getCurrentPositionAsync({ timeout: 500 });
  const result = request.catch(error => error);
  jest.advanceTimersByTime(500);
  await expect(result).resolves.toMatchObject({ code: 'TIMEOUT' });
  completeCache(null);
  await Promise.resolve();
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});

test.each(['position', 'timeout'])('cleans up when %s arrives before native setup completes', async event => {
  let completeSetup;
  Location.watchPositionAsync.mockImplementation((_options, callback) => {
    onPosition = callback;
    return new Promise(resolve => { completeSetup = resolve; });
  });
  const request = ios.getCurrentPositionAsync({ maximumAge: 0, timeout: 500 });
  if (event === 'position') {
    onPosition(position);
    await expect(request).resolves.toBe(position);
  } else {
    const result = request.catch(error => error);
    jest.advanceTimersByTime(500);
    await expect(result).resolves.toMatchObject({ code: 'TIMEOUT' });
  }
  completeSetup(subscription);
  await Promise.resolve();
  expect(subscription.remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('propagates cache errors instead of treating them as a missing fix', async () => {
  const error = new Error('Permission denied');
  Location.getLastKnownPositionAsync.mockRejectedValue(error);
  await expect(ios.getCurrentPositionAsync()).rejects.toBe(error);
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('propagates native setup errors and clears the timeout', async () => {
  const error = new Error('Location services disabled');
  Location.watchPositionAsync.mockRejectedValue(error);
  await expect(ios.getCurrentPositionAsync({ maximumAge: 0 })).rejects.toBe(error);
  expect(jest.getTimerCount()).toBe(0);
});

test('reports native update errors and releases the watcher', async () => {
  const { request } = await startWatch();
  const result = request.catch(error => error);
  onError('Location unavailable');
  const error = await result;
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe('Location unavailable');
  expect(subscription.remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test.each([
  { timeout: -1 }, { timeout: Infinity }, { timeout: NaN },
  { maximumAge: -1 }, { maximumAge: Infinity }, { maximumAge: NaN },
])('rejects invalid iOS options %j explicitly', async options => {
  await expect(ios.getCurrentPositionAsync(options)).rejects.toThrow(RangeError);
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  expect(Location.getLastKnownPositionAsync).not.toHaveBeenCalled();
});

test('keeps Android approximate-location permissions working', async () => {
  PermissionsAndroid.requestMultiple.mockResolvedValue({ fine: 'denied', coarse: 'granted' });
  await expect(android.requestForegroundPermissionsAsync()).resolves.toEqual({
    status: 'granted', granted: true, canAskAgain: true,
  });
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test('preserves Android permanently denied permissions', async () => {
  PermissionsAndroid.requestMultiple.mockResolvedValue({
    fine: 'never_ask_again', coarse: 'never_ask_again',
  });
  await expect(android.requestForegroundPermissionsAsync()).resolves.toEqual({
    status: 'denied', granted: false, canAskAgain: false,
  });
});

test('preserves Android position options and the existing native module', async () => {
  NativeModules.EchoesLocation.getCurrentPosition.mockResolvedValue(position);
  await expect(android.getCurrentPositionAsync()).resolves.toBe(position);
  expect(NativeModules.EchoesLocation.getCurrentPosition).toHaveBeenCalledWith({
    enableHighAccuracy: false, timeout: 20000, maximumAge: 10000,
  });
  await android.getCurrentPositionAsync({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  expect(NativeModules.EchoesLocation.getCurrentPosition).toHaveBeenLastCalledWith({
    enableHighAccuracy: true, timeout: 8000, maximumAge: 0,
  });
  expect(Location.watchPositionAsync).not.toHaveBeenCalled();
});
