import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProgress } from '../src/hooks/useProgress';
import { progressKey } from '../src/services/progress';

jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map();
  return {
    storage,
    getItem: jest.fn(async key => storage.get(key) ?? null),
    setItem: jest.fn(async (key, value) => { storage.set(key, value); }),
    multiSet: jest.fn(async entries => { entries.forEach(([key, value]) => storage.set(key, value)); }),
  };
});
jest.mock('../constants/i18n', () => ({
  translate: key => key,
  useI18n: () => ({ t: key => key }),
}));
jest.mock('../src/services/auth', () => ({
  getAuthToken: async () => mockAuth.token,
  getStoredUser: async () => mockAuth.user,
}));

let mockAuth;
let progress;
let renderer;
let errorLog;
const originalFetch = global.fetch;
function Probe({ user = mockAuth.user, token = mockAuth.token }) {
  progress = useProgress(user, token);
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.storage.clear();
  mockAuth = { user: { id: 1 }, token: 'token-1' };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => renderer.unmount());
  errorLog.mockRestore();
  global.fetch = originalFetch;
});
const mount = async () => {
  await act(async () => { renderer = TestRenderer.create(<Probe />); });
};

test('queues last-moment score, visit and collection writes before sending the final snapshot', async () => {
  await mount();
  await act(async () => {
    progress.addScore({ location_id: 12, name: 'Basket', gameType: 'aiming' });
    progress.addScore({ location_id: 12, name: 'Basket', gameType: 'aiming' });
    progress.markPlaceVisited({ id: 100, location_id: 12 });
    progress.collectObject({ location_id: 12, game_id: 100, item_id: 3, name: 'Key' });
    progress.collectObject({ location_id: 12, game_id: 100, item_id: 3, name: 'Key' });
    progress.finishGame();
  });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(payload).toEqual({
    scores: [{ location_id: 12, game_type: 'aiming', score: 2 }],
    visited_location_ids: [12],
    collected_items: [{ location_id: 12, game_id: 100, item_id: 3, quantity: 1 }],
  });
  expect(JSON.parse(AsyncStorage.storage.get(progressKey(1))).collectedItems).toHaveLength(1);
});

test('separates score types and disambiguates repeated object IDs between locations and games', async () => {
  await mount();
  await act(async () => {
    progress.addScore({ location_id: 12, gameType: 'aiming' });
    progress.addScore({ location_id: 12, gameType: 'treasure', points: 5 });
    progress.collectObject({ location_id: 12, game_id: 1, item_id: 3 });
    progress.collectObject({ location_id: 12, game_id: 2, item_id: 3 });
    progress.collectObject({ location_id: 15, game_id: 1, item_id: 3 });
  });

  expect(progress.scores.map(item => item.points)).toEqual([1, 5]);
  expect(progress.collectedItems).toHaveLength(3);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('persists and uploads radial impact points rather than the number of impacts', async () => {
  await mount();
  await act(async () => {
    progress.addScore({ location_id: 12, gameType: 'aiming', points: 10 });
    progress.addScore({ location_id: 12, gameType: 'aiming', points: 6 });
    progress.finishGame();
  });
  expect(progress.scores[0].points).toBe(16);
  expect(JSON.parse(AsyncStorage.storage.get(progressKey(1))).scores[0].points).toBe(16);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).scores).toEqual([
    { location_id: 12, game_type: 'aiming', score: 16 },
  ]);
});

test('keeps data after an upload failure and retries the absolute totals at the next game end', async () => {
  await mount();
  global.fetch.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    progress.addScore({ location_id: 12, gameType: 'aiming' });
    progress.finishGame();
  });
  expect(Alert.alert).toHaveBeenCalledWith('progressError', 'Offline');
  expect(progress.scores[0].points).toBe(1);
  await act(async () => { progress.finishGame(); });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(global.fetch.mock.calls[1][1].body).toBe(global.fetch.mock.calls[0][1].body);
});

test('serializes uploads without delaying play and preserves their snapshot order', async () => {
  await mount();
  let release;
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await act(async () => {
    progress.addScore({ location_id: 12, gameType: 'aiming' });
    progress.finishGame();
    progress.addScore({ location_id: 12, gameType: 'aiming' });
    progress.finishGame();
  });
  expect(progress.scores[0].points).toBe(2);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async () => { release({ ok: true, status: 204 }); });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(global.fetch.mock.calls.map(([, options]) => JSON.parse(options.body).scores[0].score)).toEqual([1, 2]);
});

test('loads a separate progression for each account and restores the original one', async () => {
  await mount();
  await act(async () => { progress.collectObject({ location_id: 12, game_id: 1, item_id: 3 }); });
  mockAuth = { user: { id: 2 }, token: 'token-2' };
  await act(async () => { renderer.update(<Probe />); });
  expect(progress.collectedItems).toEqual([]);
  await act(async () => { progress.finishGame(); });
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-2');
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).collected_items).toEqual([]);
  mockAuth = { user: { id: 1 }, token: 'token-1' };
  await act(async () => { renderer.update(<Probe />); });
  expect(progress.collectedItems).toHaveLength(1);
});

test('does not send a queued snapshot with another account token', async () => {
  await mount();
  mockAuth = { user: { id: 2 }, token: 'token-2' };
  await act(async () => { progress.finishGame(); });
  expect(global.fetch).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledWith('progressError', 'progressAuthenticationRequired');
});

test('does not upload guest progression', async () => {
  mockAuth = { user: null, token: null };
  await mount();
  await act(async () => {
    progress.addScore({ location_id: 12, gameType: 'aiming' });
    progress.finishGame();
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('retains progress when the same account refreshes its token', async () => {
  await mount();
  await act(async () => { progress.addScore({ location_id: 12, gameType: 'aiming' }); });
  mockAuth = { user: { id: 1 }, token: 'refreshed-token' };
  await act(async () => { renderer.update(<Probe />); });
  expect(progress.scores[0].points).toBe(1);
  await act(async () => { progress.finishGame(); });
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer refreshed-token');
});

test('merges operations received while persisted account progress is loading', async () => {
  let release;
  AsyncStorage.getItem.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  await mount();
  await act(async () => {
    progress.addScore({ location_id: 12, gameType: 'aiming' });
    progress.finishGame();
  });
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => {
    release(JSON.stringify({
      scores: [{ location_id: 12, gameType: 'aiming', points: 4 }],
      visitedPlaces: [], collectedItems: [], collectedMemories: [],
    }));
  });
  expect(progress.scores[0].points).toBe(5);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).scores[0].score).toBe(5);
});

test('does not upload when local persistence fails and reports the failure', async () => {
  await mount();
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  await act(async () => { progress.finishGame(); });
  expect(Alert.alert).toHaveBeenCalledWith('progressError', 'Disk full');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('keeps legacy memory inventory account-scoped and outside the object payload', async () => {
  await mount();
  await act(async () => {
    progress.handleCollectMemory({ id: 12, name: 'Old-style memory' });
    progress.handleCollectMemory({ id: 12, name: 'Old-style memory' });
    progress.finishGame();
  });
  expect(progress.collectedMemories).toHaveLength(1);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).collected_items).toEqual([]);
  mockAuth = { user: { id: 2 }, token: 'token-2' };
  await act(async () => { renderer.update(<Probe />); });
  expect(progress.collectedMemories).toEqual([]);
});

test('keeps game history distinct but uploads one visited location for games sharing a place', async () => {
  await mount();
  await act(async () => {
    progress.markPlaceVisited({ id: 101, location_id: 7, name: 'Fountain' });
    progress.markPlaceVisited({ id: 102, location_id: 7, name: 'Garden' });
    progress.markPlaceVisited({ id: 101, location_id: 7, name: 'Fountain updated' });
    progress.collectObject({ location_id: 7, game_id: 101, item_id: 1 });
    progress.collectObject({ location_id: 7, game_id: 102, item_id: 1 });
    progress.addScore({ location_id: 7, gameType: 'aiming', points: 2 });
    progress.addScore({ location_id: 7, gameType: 'aiming', points: 3 });
    progress.finishGame();
  });
  expect(progress.visitedPlaces).toMatchObject([
    { id: 101, location_id: 7, name: 'Fountain updated' },
    { id: 102, location_id: 7, name: 'Garden' },
  ]);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
    scores: [{ location_id: 7, game_type: 'aiming', score: 5 }],
    visited_location_ids: [7],
    collected_items: [
      { location_id: 7, game_id: 101, item_id: 1, quantity: 1 },
      { location_id: 7, game_id: 102, item_id: 1, quantity: 1 },
    ],
  });
});

test('reports missing location IDs without interpreting game IDs as places', async () => {
  await mount();
  await act(async () => {
    progress.markPlaceVisited({ id: 101 });
    progress.addScore({ id: 101, gameType: 'aiming' });
  });
  expect(progress.visitedPlaces).toEqual([]);
  expect(progress.scores).toEqual([]);
  expect(Alert.alert).toHaveBeenCalledWith('progressError', 'Invalid progress identifier');
});

test('keeps old account progression untouched and uploads only the corrected namespace', async () => {
  const oldKey = '@progress:user:1';
  const oldValue = JSON.stringify({
    scores: [{ id: 101, gameType: 'aiming', points: 99 }],
    visitedPlaces: [{ id: 101 }],
    collectedItems: [{ location_id: 101, game_id: 101, item_id: 1, quantity: 1 }],
    collectedMemories: [],
  });
  AsyncStorage.storage.set(oldKey, oldValue);
  await mount();
  await act(async () => {
    progress.addScore({ location_id: 7, gameType: 'aiming', points: 2 });
    progress.finishGame();
  });
  expect(AsyncStorage.storage.get(oldKey)).toBe(oldValue);
  expect(progressKey(1)).not.toBe(oldKey);
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
    scores: [{ location_id: 7, game_type: 'aiming', score: 2 }],
    visited_location_ids: [], collected_items: [],
  });
});
