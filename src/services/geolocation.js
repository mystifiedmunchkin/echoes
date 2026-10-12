import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

export async function requestForegroundPermissionsAsync() {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return {
      status: result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
      granted: result === PermissionsAndroid.RESULTS.GRANTED,
      canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  }

  return new Promise((resolve) => {
    Geolocation.requestAuthorization((status) => {
      resolve({
        status,
        granted: status === 'granted',
        canAskAgain: status !== 'blocked' && status !== 'restricted',
      });
    });
  });
}

export function getCurrentPositionAsync(options = {}) {
  return new Promise((resolve, reject) => {
    // Note: 'enableHighAccuracy: false' is often more reliable on non-GMS devices
    // as 'true' often forces a FusedLocationProvider (GMS) call which will fail.
    Geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        // Fallback or specific error handling
        console.warn("Geolocation error:", error);
        reject(error);
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        timeout: options.timeout ?? 20000,
        maximumAge: options.maximumAge ?? 10000,
      }
    );
  });
}