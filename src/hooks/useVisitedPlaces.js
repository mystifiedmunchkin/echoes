/**
 * Legacy local-only history hook using the pre-account storage key.
 * The active application uses useProgress for per-user history and server synchronization.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from '../../constants/i18n';

const STORAGE_KEY = '@visited_places';

const toPlace = (memory, seenAt) => ({
  id: memory.id,
  name: memory.name || '',
  description: memory.description || '',
  creatorName: memory.creatorName || '',
  lat: memory.lat ?? memory.latitude ?? null,
  lng: memory.lng ?? memory.longitude ?? null,
  firstSeenAt: seenAt,
  lastSeenAt: seenAt,
});

export function useVisitedPlaces() {
  const [visitedPlaces, setVisitedPlaces] = useState([]);
  const isLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const storedPlaces = JSON.parse(stored);
          // Merge so visits recorded before loading completed are not lost.
          setVisitedPlaces((current) => [
            ...current,
            ...storedPlaces.filter((place) => !current.some((item) => String(item.id) === String(place.id))),
          ]);
        }
      } catch (e) {
        console.error(translate('visitedPlacesLoadError'), e);
      } finally {
        isLoaded.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!isLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(visitedPlaces)).catch((e) => {
      console.error(translate('visitedPlacesSaveError'), e);
    });
  }, [visitedPlaces]);

  const markPlaceVisited = useCallback((memory) => {
    if (memory?.id == null) return;
    const seenAt = new Date().toISOString();
    setVisitedPlaces((current) => {
      const existing = current.find((place) => String(place.id) === String(memory.id));
      if (!existing) return [toPlace(memory, seenAt), ...current];
      const updated = { ...toPlace(memory, existing.firstSeenAt), lastSeenAt: seenAt };
      return [updated, ...current.filter((place) => place !== existing)];
    });
  }, []);

  return { visitedPlaces, markPlaceVisited };
}
