import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyProgress, loadProgress, postProgress, progressKey, progressPayload,
} from '../src/services/progress';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  multiSet: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../constants/i18n', () => ({
  translate: (key: string) => key,
}));

const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  globalThis.fetch = fetchMock;
});
afterAll(() => { globalThis.fetch = originalFetch; });

test('builds the exact API payload without UI metadata', () => {
  expect(progressPayload({
    scores: [{ id: 12, name: 'Basket', gameType: 'aiming', points: 125 }],
    visitedPlaces: [
      { id: 12, name: '', firstSeenAt: '', lastSeenAt: '' },
      { id: 15, name: '', firstSeenAt: '', lastSeenAt: '' },
    ],
    collectedItems: [{
      location_id: 12, game_id: 100, item_id: 3, quantity: 1,
      name: 'Key', collectedAt: 'now',
    }],
    collectedMemories: [],
  })).toEqual({
    scores: [{ location_id: 12, game_type: 'aiming', score: 125 }],
    visited_location_ids: [12, 15],
    collected_items: [{ location_id: 12, game_id: 100, item_id: 3, quantity: 1 }],
  });
});

test('POSTs authenticated JSON and accepts an empty 204 response', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
  const payload = progressPayload(emptyProgress());
  await postProgress('test-token', payload);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://echoes.sophiehorner.art/api/progress',
    expect.objectContaining({
      method: 'POST',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify(payload),
      signal: expect.any(AbortSignal),
    }),
  );
});

test('does not send unauthenticated progress', async () => {
  await expect(postProgress('', progressPayload(emptyProgress()))).rejects.toThrow(
    'progressAuthenticationRequired',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([401, 422, 500])('propagates HTTP %s failures', async status => {
  fetchMock.mockResolvedValueOnce({
    ok: false, status, json: async () => ({ message: 'Rejected progress' }),
  });
  await expect(postProgress('test-token', progressPayload(emptyProgress()))).rejects.toThrow(
    'Rejected progress',
  );
});

test('reports a non-JSON error response', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false, status: 502, json: async () => { throw new Error('Not JSON'); },
  });
  await expect(postProgress('test-token', progressPayload(emptyProgress()))).rejects.toThrow('serverError');
});

test('propagates network failures', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  await expect(postProgress('test-token', progressPayload(emptyProgress()))).rejects.toThrow('Offline');
});

test('aborts stalled uploads after 15 seconds', async () => {
  jest.useFakeTimers();
  try {
    fetchMock.mockImplementationOnce((_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      }));
    const upload = postProgress('test-token', progressPayload(emptyProgress()));
    jest.advanceTimersByTime(15000);
    await expect(upload).rejects.toThrow('Aborted');
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('migrates historical scores and visits once, but never treats old memories as objects', async () => {
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => {
    if (key === '@experience_scores') return JSON.stringify([{ id: '12', name: 'Basket', points: 7 }]);
    if (key === '@visited_places') return JSON.stringify([{ id: '15', name: 'Park' }]);
    if (key === '@collected_memories') return JSON.stringify([{ id: 15, name: 'Park' }]);
    return null;
  });
  const result = await loadProgress(1);
  expect(result.collectedMemories).toEqual([{ id: 15, name: 'Park' }]);
  expect(progressPayload(result)).toEqual({
    scores: [{ location_id: 12, game_type: 'aiming', score: 7 }],
    visited_location_ids: [15], collected_items: [],
  });
  expect(AsyncStorage.multiSet).toHaveBeenCalledWith([
    [progressKey(1), JSON.stringify(result)],
    ['@progress_legacy_owner', '1'],
  ]);
});

test('does not import legacy data into another account or a guest session', async () => {
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key =>
    key === '@progress_legacy_owner' ? '1' : null);
  expect(await loadProgress(2)).toEqual(emptyProgress());
  expect(await loadProgress(null)).toEqual(emptyProgress());
  expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
});

test('attributes legacy history to only one account when two loads overlap', async () => {
  const storage = new Map([
    ['@experience_scores', JSON.stringify([{ id: 12, name: 'Basket', points: 7 }])],
  ]);
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => storage.get(key) ?? null);
  jest.mocked(AsyncStorage.multiSet).mockImplementationOnce(async entries => {
    entries.forEach(([key, value]) => storage.set(key, value));
  });
  const [first, second] = await Promise.all([loadProgress(1), loadProgress(2)]);
  expect(first.scores[0].points).toBe(7);
  expect(second.scores).toEqual([]);
  expect(storage.get('@progress_legacy_owner')).toBe('1');
  expect(AsyncStorage.multiSet).toHaveBeenCalledTimes(1);
});

test('rejects corrupt saved progress rather than overwriting it with an empty state', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{"scores":null}');
  await expect(loadProgress(1)).rejects.toThrow('Invalid saved progress');
  expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
});
