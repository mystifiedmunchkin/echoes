package com.sophiehorner.echoes;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.util.List;

public class EchoesLocationModule extends ReactContextBaseJavaModule {
  private static final String MODULE_NAME = "EchoesLocation";

  private final LocationManager locationManager;
  private final Handler handler = new Handler(Looper.getMainLooper());

  public EchoesLocationModule(ReactApplicationContext reactContext) {
    super(reactContext);
    locationManager = (LocationManager) reactContext.getSystemService(Context.LOCATION_SERVICE);
  }

  @NonNull
  @Override
  public String getName() {
    return MODULE_NAME;
  }

  @ReactMethod
  public void getCurrentPosition(@Nullable ReadableMap options, Promise promise) {
    if (!hasLocationPermission()) {
      promise.reject("PERMISSION_DENIED", "Location permission has not been granted.");
      return;
    }

    final boolean highAccuracy = getBoolean(options, "enableHighAccuracy", false);
    final long timeout = getLong(options, "timeout", 20000L);
    final long maximumAge = getLong(options, "maximumAge", 10000L);
    final String provider = getProvider(highAccuracy);

    if (provider == null) {
      promise.reject("POSITION_UNAVAILABLE", "No Android location provider is enabled.");
      return;
    }

    Location cachedLocation = getLastKnownLocation(provider);
    if (cachedLocation != null
        && System.currentTimeMillis() - cachedLocation.getTime() <= maximumAge) {
      promise.resolve(toPosition(cachedLocation));
      return;
    }

    final LocationListener listener = new LocationListener() {
      @Override
      public void onLocationChanged(@NonNull Location location) {
        cleanup();
        promise.resolve(toPosition(location));
      }

      @Override
      public void onProviderDisabled(@NonNull String disabledProvider) {
        if (provider.equals(disabledProvider)) {
          cleanup();
          promise.reject("POSITION_UNAVAILABLE", "The Android location provider was disabled.");
        }
      }

      @Override
      public void onProviderEnabled(@NonNull String enabledProvider) {
      }

      @Override
      public void onStatusChanged(String changedProvider, int status, Bundle extras) {
      }

      private void cleanup() {
        handler.removeCallbacksAndMessages(this);
        locationManager.removeUpdates(this);
      }
    };

    Runnable timeoutRunnable = () -> {
      locationManager.removeUpdates(listener);
      promise.reject("TIMEOUT", "Unable to obtain a location before the timeout.");
    };

    try {
      locationManager.requestLocationUpdates(provider, 1000L, 1.0f, listener, Looper.getMainLooper());
      handler.postAtTime(timeoutRunnable, listener, System.currentTimeMillis() + timeout);
    } catch (SecurityException error) {
      promise.reject("PERMISSION_DENIED", "Location permission is not available.", error);
    } catch (RuntimeException error) {
      promise.reject("POSITION_UNAVAILABLE", "Unable to start Android location updates.", error);
    }
  }

  private boolean hasLocationPermission() {
    ReactApplicationContext context = getReactApplicationContext();
    return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        == PackageManager.PERMISSION_GRANTED
        || context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        == PackageManager.PERMISSION_GRANTED;
  }

  @Nullable
  private String getProvider(boolean highAccuracy) {
    List<String> providers = locationManager.getProviders(true);
    boolean hasFinePermission = getReactApplicationContext().checkSelfPermission(
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED;
    if (hasFinePermission && providers.contains(LocationManager.GPS_PROVIDER)) {
      return LocationManager.GPS_PROVIDER;
    }

    return providers.contains(LocationManager.NETWORK_PROVIDER)
        ? LocationManager.NETWORK_PROVIDER
        : null;
  }

  @Nullable
  private Location getLastKnownLocation(String provider) {
    try {
      return locationManager.getLastKnownLocation(provider);
    } catch (SecurityException error) {
      return null;
    }
  }

  private WritableMap toPosition(Location location) {
    WritableMap coordinates = Arguments.createMap();
    coordinates.putDouble("latitude", location.getLatitude());
    coordinates.putDouble("longitude", location.getLongitude());
    coordinates.putDouble("accuracy", location.hasAccuracy() ? location.getAccuracy() : 0);
    coordinates.putDouble("altitude", location.hasAltitude() ? location.getAltitude() : 0);
    coordinates.putDouble("heading", location.hasBearing() ? location.getBearing() : 0);
    coordinates.putDouble("speed", location.hasSpeed() ? location.getSpeed() : 0);

    WritableMap position = Arguments.createMap();
    position.putMap("coords", coordinates);
    position.putDouble("timestamp", location.getTime());
    return position;
  }

  private static boolean getBoolean(@Nullable ReadableMap options, String key, boolean fallback) {
    return options != null && options.hasKey(key) && !options.isNull(key)
        ? options.getBoolean(key) : fallback;
  }

  private static long getLong(@Nullable ReadableMap options, String key, long fallback) {
    return options != null && options.hasKey(key) && !options.isNull(key)
        ? (long) options.getDouble(key) : fallback;
  }
}
