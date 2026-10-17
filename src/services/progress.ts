/** Validates progression, migrates legacy local data, and builds the server's exact payload. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from '../../constants/i18n';
import type { ExperienceType } from '../experiences/experience';

export interface ProgressScore {
  id: number;
  name: string;
  gameType: ExperienceType;
  points: number;
}

export interface CollectedItem {
  location_id: number;
  game_id: number;
  item_id: number;
  quantity: 1;
  name: string;
  collectedAt: string;
}

export interface VisitedPlace {
  id: number;
  name: string;
  description?: string;
  creatorName?: string;
  lat?: number | null;
  lng?: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface CollectedMemory {
  id: number | string;
  name?: string;
  creatorName?: string;
  collectedAt?: string;
  [key: string]: unknown;
}

export interface Progress {
  scores: ProgressScore[];
  visitedPlaces: VisitedPlace[];
  collectedItems: CollectedItem[];
  collectedMemories: CollectedMemory[];
}

export interface ProgressPayload {
  scores: { location_id: number; game_type: ExperienceType; score: number }[];
  visited_location_ids: number[];
  collected_items: {
    location_id: number;
    game_id: number;
    item_id: number;
    quantity: 1;
  }[];
}

const LEGACY_OWNER_KEY = '@progress_legacy_owner';
let migrations: Promise<void> = Promise.resolve();

export const progressKey = (userId: string | number | null) =>
  userId == null ? '@progress:guest' : `@progress:user:${userId}`;

export function progressId(value: unknown): number {
  const id =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) {
    throw new Error('Invalid progress identifier');
  }
  return id;
}

export function emptyProgress(): Progress {
  return { scores: [], visitedPlaces: [], collectedItems: [], collectedMemories: [] };
}

export function progressPayload(progress: Progress): ProgressPayload {
  // Keep display names, timestamps, coordinates, and legacy memories out of the API payload.
  return {
    scores: progress.scores.map(item => {
      if (
        !['aiming', 'treasure', 'discovery', 'images'].includes(item.gameType) ||
        !Number.isSafeInteger(item.points) ||
        item.points < 0
      ) {
        throw new Error('Invalid progress score');
      }
      return {
        location_id: progressId(item.id),
        game_type: item.gameType,
        score: item.points,
      };
    }),
    visited_location_ids: [...new Set(progress.visitedPlaces.map(place => progressId(place.id)))],
    collected_items: progress.collectedItems.map(item => {
      if (item.quantity !== 1) throw new Error('Invalid collected quantity');
      return {
        location_id: progressId(item.location_id),
        game_id: progressId(item.game_id),
        item_id: progressId(item.item_id),
        quantity: item.quantity,
      };
    }),
  };
}

function readProgress(stored: string): Progress {
  const parsed: Progress = JSON.parse(stored);
  if (
    !parsed ||
    !Array.isArray(parsed.scores) ||
    !Array.isArray(parsed.visitedPlaces) ||
    !Array.isArray(parsed.collectedItems) ||
    !Array.isArray(parsed.collectedMemories)
  ) {
    throw new Error('Invalid saved progress');
  }
  progressPayload(parsed);
  return parsed;
}

export async function loadProgress(userId: string | number | null): Promise<Progress> {
  let result = emptyProgress();
  // Serialize first-load migrations so only one signed-in account can claim legacy history.
  const task = migrations.then(async () => {
    const key = progressKey(userId);
    const saved = await AsyncStorage.getItem(key);
    if (saved) {
      result = readProgress(saved);
      return;
    }
    if (userId == null || await AsyncStorage.getItem(LEGACY_OWNER_KEY) !== null) {
      return;
    }
    const [scoresJson, visitsJson, memoriesJson] = await Promise.all([
      AsyncStorage.getItem('@experience_scores'),
      AsyncStorage.getItem('@visited_places'),
      AsyncStorage.getItem('@collected_memories'),
    ]);
    const scores = scoresJson ? JSON.parse(scoresJson) : [];
    const visitedPlaces = visitsJson ? JSON.parse(visitsJson) : [];
    const collectedMemories = memoriesJson ? JSON.parse(memoriesJson) : [];
    if (!Array.isArray(scores) || !Array.isArray(visitedPlaces) || !Array.isArray(collectedMemories)) {
      throw new Error('Invalid legacy progress');
    }
    result = {
      scores: scores.map(item => ({
        ...item,
        id: progressId(item.id),
        gameType: 'aiming',
      })),
      visitedPlaces: visitedPlaces.map(item => ({ ...item, id: progressId(item.id) })),
      collectedItems: [],
      collectedMemories,
    };
    progressPayload(result);
    await AsyncStorage.multiSet([
      [key, JSON.stringify(result)],
      [LEGACY_OWNER_KEY, String(userId)],
    ]);
  });
  // Keep later accounts loadable while still propagating this caller's failure.
  migrations = task.then(() => undefined, () => undefined);
  await task;
  return result;
}

export async function postProgress(token: string, payload: ProgressPayload): Promise<void> {
  if (!token) throw new Error(translate('progressAuthenticationRequired'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://echoes.sophiehorner.art/api/progress', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || translate('serverError', { status: response.status }));
    }
  } finally {
    clearTimeout(timeout);
  }
}
