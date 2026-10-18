import * as Location from 'expo-location';

export function requestForegroundPermissionsAsync() {
  return Location.requestForegroundPermissionsAsync();
}

export function getCurrentPositionAsync(options = {}) {
  const timeout = options.timeout ?? 20000;
  const maximumAge = options.maximumAge ?? 10000;
  if (!Number.isFinite(timeout) || timeout < 0
    || !Number.isFinite(maximumAge) || maximumAge < 0) {
    return Promise.reject(new RangeError('Location timeout and maximumAge must be finite non-negative numbers.'));
  }

  return new Promise((resolve, reject) => {
    let subscription;
    let settled = false;
    const finish = (error, position) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      if (error) reject(error);
      else resolve(position);
    };
    const timer = setTimeout(() => {
      finish(Object.assign(new Error('Unable to obtain a location before the timeout.'), { code: 'TIMEOUT' }));
    }, timeout);

    const start = async () => {
      if (maximumAge > 0) {
        const cached = await Location.getLastKnownPositionAsync({ maxAge: maximumAge });
        if (settled) return;
        if (cached) {
          finish(null, cached);
          return;
        }
      }

      // Discovery uses a 50 m radius; Balanced's 100 m target is too coarse.
      subscription = await Location.watchPositionAsync(
        { accuracy: options.enableHighAccuracy ? Location.Accuracy.Highest : Location.Accuracy.High },
        position => finish(null, position),
        reason => finish(new Error(reason)),
      );
      // A fix or timeout can arrive before the native subscription promise resolves.
      if (settled) subscription.remove();
    };
    start().catch(error => finish(error));
  });
}
