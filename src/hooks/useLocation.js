/**
 * Legacy foreground location watcher.
 * It is not mounted by the active application path; useRadar owns live location setup.
 */
import { useState, useEffect } from 'react';
import * as Location from '../services/geolocation';
import { translate } from '../../constants/i18n';

const MONTAUBAN_DEFAULT = {
  latitude: 44.0223,
  longitude: 1.3532,
};

export const useLocation = () => {
  const [location, setLocation] = useState({ coords: MONTAUBAN_DEFAULT });

  useEffect(() => {
    let isMounted = true;
    let timer;

    async function startWatchingPosition() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const updatePosition = async () => {
          const newLocation = await Location.getCurrentPositionAsync({ timeout: 10000 })
            .catch(() => null);
          if (isMounted && newLocation) setLocation(newLocation);
        };

        await updatePosition();
        timer = setInterval(updatePosition, 2000);
      } catch (e) {
        console.warn(translate('gpsTestUnavailable'), e);
      }
    }

    startWatchingPosition();

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  return location;
};