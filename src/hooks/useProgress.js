import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useI18n } from '../../constants/i18n';
import { getAuthToken, getStoredUser } from '../services/auth';
import {
  emptyProgress, loadProgress, postProgress, progressId, progressKey, progressPayload,
} from '../services/progress';

/** Owns per-user local progression and queues authenticated uploads when a game ends. */
export function useProgress(user, token) {
  const { t } = useI18n();
  const userId = user?.id ?? null;
  const [view, setView] = useState(null);
  // Isolate queued work and rendered data when switching between accounts or guest mode.
  const session = useMemo(() => ({
    userId, data: emptyProgress(), queue: Promise.resolve(),
    mounted: false, ready: null, uploads: Promise.resolve(),
  }), [userId]);
  const reportError = useCallback((error) => {
    console.error('Progress operation failed', error);
    Alert.alert(t('progressError'), error instanceof Error ? error.message : String(error));
  }, [t]);
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;

  useEffect(() => {
    session.mounted = true;
    session.ready = loadProgress(session.userId);
    session.ready.then(data => {
      session.data = data;
      if (session.mounted) setView({ session, data });
    }).catch(error => reportErrorRef.current(error));
    return () => { session.mounted = false; };
  }, [session]);

  const enqueue = useCallback((operation) => {
    // Serialize mutations behind hydration so rapid scores/collections cannot overwrite each other.
    session.queue = session.queue.then(async () => {
      await session.ready;
      await operation(session);
    }).catch(reportError);
  }, [session, reportError]);

  const update = useCallback((reduce, afterSave) => {
    enqueue(async current => {
      const next = reduce(current.data);
      if (next === current.data) return;
      current.data = next;
      if (current.mounted) setView({ session: current, data: current.data });
      await AsyncStorage.setItem(progressKey(current.userId), JSON.stringify(current.data));
      if (current.mounted) afterSave?.();
    });
  }, [enqueue]);

  const addScore = useCallback(({ location_id, name, gameType, points = 1 }) => {
    update(data => {
      const locationId = progressId(location_id);
      const index = data.scores.findIndex(item => item.location_id === locationId && item.gameType === gameType);
      const scores = index < 0
        ? [...data.scores, { location_id: locationId, name, gameType, points }]
        : data.scores.map((item, i) => i === index
          ? { ...item, name: name || item.name, points: item.points + points }
          : item);
      progressPayload({ ...data, scores });
      return { ...data, scores };
    });
  }, [update]);

  const markPlaceVisited = useCallback(memory => {
    update(data => {
      const id = progressId(memory.id);
      const existing = data.visitedPlaces.find(place => place.id === id);
      const now = new Date().toISOString();
      const place = {
        id, location_id: progressId(memory.location_id),
        name: memory.name || '', description: memory.description || '',
        creatorName: memory.creatorName || '',
        lat: memory.lat ?? memory.latitude ?? null,
        lng: memory.lng ?? memory.longitude ?? null,
        firstSeenAt: existing?.firstSeenAt || now, lastSeenAt: now,
      };
      return { ...data, visitedPlaces: [place, ...data.visitedPlaces.filter(item => item.id !== id)] };
    });
  }, [update]);

  const collectObject = useCallback(item => {
    update(data => {
      const entry = {
        location_id: progressId(item.location_id),
        game_id: progressId(item.game_id),
        item_id: progressId(item.item_id),
        quantity: 1,
        name: item.name,
        collectedAt: new Date().toISOString(),
      };
      if (data.collectedItems.some(current =>
        current.location_id === entry.location_id &&
        current.game_id === entry.game_id && current.item_id === entry.item_id)) return data;
      return { ...data, collectedItems: [...data.collectedItems, entry] };
    }, () => Alert.alert(t('collection'), t('memoryAdded', { name: item.name })));
  }, [update, t]);

  const finishGame = useCallback(() => {
    if (session.userId == null) return;
    const authToken = token;
    enqueue(async current => {
      await AsyncStorage.setItem(progressKey(current.userId), JSON.stringify(current.data));
      const payload = progressPayload(current.data);
      // Snapshot the saved payload, then serialize uploads separately from local UI mutations.
      current.uploads = current.uploads.then(async () => {
        const [storedToken, storedUser] = await Promise.all([getAuthToken(), getStoredUser()]);
        // A queued upload must still belong to the authenticated account when it starts.
        if (storedToken !== authToken || String(storedUser?.id) !== String(current.userId)) {
          throw new Error(t('progressAuthenticationRequired'));
        }
        await postProgress(authToken, payload);
      }).catch(reportError);
    });
  }, [enqueue, session, token, t, reportError]);

  const clearCollectedItems = useCallback(() => {
    update(data => ({ ...data, collectedItems: [], collectedMemories: [] }));
  }, [update]);

  const handleCollectMemory = useCallback(memory => {
    update(data => {
      if (data.collectedMemories.some(item => String(item.id) === String(memory.id))) return data;
      return {
        ...data,
        collectedMemories: [
          ...data.collectedMemories,
          { ...memory, collectedAt: new Date().toISOString() },
        ],
      };
    }, () => Alert.alert(t('collection'), t('memoryAdded', { name: memory.name })));
  }, [update, t]);

  // Never display the previous account's data while the new session is loading.
  const data = view?.session === session ? view.data : emptyProgress();
  return {
    ...data, addScore, markPlaceVisited, collectObject,
    clearCollectedItems, handleCollectMemory, finishGame,
  };
}
