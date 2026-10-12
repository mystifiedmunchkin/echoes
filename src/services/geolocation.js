import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { EchoesLocation } = NativeModules;

export async function requestForegroundPermissionsAsync() {
  if (Platform.OS === 'android') {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const result = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const coarseGranted = results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]
      === PermissionsAndroid.RESULTS.GRANTED;
    return {
      status: result === PermissionsAndroid.RESULTS.GRANTED || coarseGranted ? 'granted' : 'denied',
      granted: result === PermissionsAndroid.RESULTS.GRANTED || coarseGranted,
      canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        && results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]
          !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
    };
  }

  throw new Error('iOS geolocation is not implemented by the Android-only native module.');
}

export function getCurrentPositionAsync(options = {}) {
  if (Platform.OS !== 'android') {
    return Promise.reject(new Error('Geolocation is only implemented on Android.'));
  }
  if (!EchoesLocation) {
    return Promise.reject(new Error('EchoesLocation native module is not available.'));
  }

  return EchoesLocation.getCurrentPosition({
    enableHighAccuracy: options.enableHighAccuracy ?? false,
    timeout: options.timeout ?? 20000,
    maximumAge: options.maximumAge ?? 10000,
  });
}