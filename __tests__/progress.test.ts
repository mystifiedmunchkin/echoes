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
    scores: [{ location_id: 12, name: 'Basket', gameType: 'aiming', points: 125 }],
    visitedPlaces: [
      { id: 100, location_id: 12, name: '', firstSeenAt: '', lastSeenAt: '' },
      { id: 101, location_id: 12, name: '', firstSeenAt: '', lastSeenAt: '' },
      { id: 102, location_id: 15, name: '', firstSeenAt: '', lastSeenAt: '' },
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

test('includes server validation fields in the reported synchronization error', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 422,
    json: async () => ({
      message: 'Validation failed',
      errors: {
        'collected_items.0.location_id': ['The selected location is invalid.'],
        'collected_items.0.game_id': ['The selected game is invalid.'],
      },
    }),
  });
  await expect(
    postProgress('test-token', progressPayload(emptyProgress())),
  ).rejects.toThrow(
    'Validation failed (collected_items.0.location_id: The selected location is invalid.; collected_items.0.game_id: The selected game is invalid.)',
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

test('does not import or overwrite ambiguous progression from any previous storage format', async () => {
  const storage = new Map([
    ['@progress:user:1', JSON.stringify({ scores: [{ id: 101, points: 7 }] })],
    ['@progress:guest', JSON.stringify({ scores: [{ id: 102, points: 8 }] })],
    ['@experience_scores', JSON.stringify([{ id: 12, name: 'Basket', points: 7 }])],
    ['@visited_places', JSON.stringify([{ id: 15, name: 'Park' }])],
    ['@collected_memories', JSON.stringify([{ id: 15, name: 'Park' }])],
  ]);
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => storage.get(key) ?? null);
  const [first, second, guest] = await Promise.all([loadProgress(1), loadProgress(2), loadProgress(null)]);
  expect([first, second, guest]).toEqual([emptyProgress(), emptyProgress(), emptyProgress()]);
  expect(AsyncStorage.getItem).toHaveBeenNthCalledWith(1, '@progress:v2:user:1');
  expect(AsyncStorage.getItem).toHaveBeenNthCalledWith(2, '@progress:v2:user:2');
  expect(AsyncStorage.getItem).toHaveBeenNthCalledWith(3, '@progress:v2:guest');
  expect(AsyncStorage.getItem).toHaveBeenCalledTimes(3);
  expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
  expect(storage.size).toBe(5);
});

test('loads saved corrected progression from its own namespace', async () => {
  const saved = {
    ...emptyProgress(),
    scores: [{ location_id: 7, name: 'Garden', gameType: 'aiming', points: 5 }],
    visitedPlaces: [
      { id: 101, location_id: 7, name: 'Fountain', firstSeenAt: '', lastSeenAt: '' },
    ],
  };
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(saved));
  expect(await loadProgress(1)).toEqual(saved);
  expect(AsyncStorage.getItem).toHaveBeenCalledWith(progressKey(1));
});

test('rejects corrupt saved progress rather than overwriting it with an empty state', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('{"scores":null}');
  await expect(loadProgress(1)).rejects.toThrow('Invalid saved progress');
  expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
});
