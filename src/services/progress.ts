/** Validates location-scoped progression and builds the server's exact payload. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from '../../constants/i18n';
import type { ExperienceType } from '../experiences/experience';

export interface ProgressScore {
  location_id: number;
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
  // Keep one history entry per game; API visits are deduplicated by location_id.
  id: number;
  location_id: number;
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

// Older keys remain untouched: their IDs may refer to games rather than locations.
export const progressKey = (userId: string | number | null) =>
  userId == null ? '@progress:v2:guest' : `@progress:v2:user:${userId}`;

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
        location_id: progressId(item.location_id),
        game_type: item.gameType,
        score: item.points,
      };
    }),
    visited_location_ids: [...new Set(progress.visitedPlaces.map(place => progressId(place.location_id)))],
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

function validationMessage(payload: unknown, status: number): string {
  if (!payload || typeof payload !== 'object') {
    return translate('serverError', { status });
  }
  const response = payload as {
    message?: unknown;
    errors?: Record<string, unknown>;
  };
  const message =
    typeof response.message === 'string' && response.message.trim()
      ? response.message.trim()
      : translate('serverError', { status });
  if (!response.errors || typeof response.errors !== 'object') return message;

  const details = Object.entries(response.errors)
    .flatMap(([field, value]) => {
      const messages = Array.isArray(value) ? value : [value];
      return messages
        .filter(item => typeof item === 'string' && item.trim())
        .map(item => `${field}: ${item}`);
    });
  return details.length ? `${message} (${details.join('; ')})` : message;
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
  parsed.visitedPlaces.forEach(place => progressId(place.id));
  progressPayload(parsed);
  return parsed;
}

export async function loadProgress(userId: string | number | null): Promise<Progress> {
  const saved = await AsyncStorage.getItem(progressKey(userId));
  return saved ? readProgress(saved) : emptyProgress();
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
      throw new Error(validationMessage(body, response.status));
    }
  } finally {
    clearTimeout(timeout);
  }
}
