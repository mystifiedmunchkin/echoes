import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  normalizeInteractive,
  normalizeInteractiveGames,
  useRadar,
} from '../src/hooks/useRadar';
import { getCurrentPositionAsync } from '../src/services/geolocation';
import { FileSystem } from 'react-native-file-access';

jest.mock('react-native', () => ({ Linking: { openSettings: jest.fn() } }));
jest.mock('react-native-file-access', () => ({
  Dirs: { DocumentDir: 'cache' },
  FileSystem: {
    exists: jest.fn().mockResolvedValue(false),
    isDir: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(),
    fetch: jest.fn().mockResolvedValue({ status: 200 }),
    unlink: jest.fn().mockResolvedValue(),
  },
}));
jest.mock('../src/services/auth', () => ({
  getAuthToken: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/services/geolocation', () => ({
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));
jest.mock('../constants/i18n', () => ({
  translate: (key, variables) => key === 'nearbyIdentifierInvalid'
    ? `${key}:games[${variables.index}].${variables.field}`
    : key,
}));

let radar;
let renderer;
const originalFetch = global.fetch;
const origin = { latitude: 0, longitude: 0 };

function Probe() {
  radar = useRadar(5000);
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  FileSystem.exists.mockResolvedValue(false);
  FileSystem.fetch.mockResolvedValue({ status: 200 });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: 1,
        location_id: 70,
        name: 'Equator',
        latitude: 0,
        longitude: 0,
        title: 'Equator interactive',
        description: 'A game',
        type: 'discovery',
        assets: [],
        objects: [{ id: 1, properties: { text: 'Hello' } }],
      },
    ],
  });
  getCurrentPositionAsync.mockResolvedValue({ coords: origin });
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
});

afterEach(() => {
  act(() => renderer.unmount());
  jest.useRealTimers();
  global.fetch = originalFetch;
});

test('refreshes GPS and downloads the nearby records with a 2500 m request cap', async () => {
  let result;
  await act(async () => {
    result = await radar.loadNearbyMemories();
  });
  expect(getCurrentPositionAsync).toHaveBeenCalledWith({ timeout: 20000 });
  expect(global.fetch.mock.calls[0][0]).toMatch(/\?latitude=0&longitude=0$/);
  expect(radar.radius).toBe(2500);
  expect(result.location).toEqual(origin);
  expect(result.memories).toHaveLength(1);
  expect(result.memories[0]).toMatchObject({ id: 0, location_id: 70, lat: 0, lng: 0 });
  expect(FileSystem.fetch).not.toHaveBeenCalled();
});

test('accepts lat and lng coordinate aliases from the nearby memories endpoint', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [{
      id: 11,
      location_id: 70,
      lat: '0,001',
      lng: '0,002',
      title: 'Alias coordinates',
      type: 'discovery',
      assets: [],
      objects: [{ id: 1, properties: { text: 'Hello' } }],
    }],
  });

  let result;
  await act(async () => { result = await radar.loadNearbyMemories(); });

  expect(result.memories[0]).toMatchObject({
    id: 0,
    location_id: 70,
    lat: 0.001,
    lng: 0.002,
    latitude: 0.001,
    longitude: 0.002,
  });
});

test('assigns game indexes within each location before exposing map and AR records', async () => {
  const memory = {
    id: 1,
    location_id: 70,
    title: 'First record',
    latitude: 0,
    longitude: 0,
    type: 'discovery',
    assets: [],
    objects: [{ id: 1, properties: { text: 'Hello' } }],
  };
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [
      memory,
      { ...memory, title: 'Repeated record' },
      { ...memory, id: '1', title: 'String ID alias' },
      { ...memory, id: 3, title: 'Another ID' },
      { ...memory, id: 2, title: 'Different place at the same coordinates' },
    ],
  });
  let result;
  await act(async () => { result = await radar.loadNearbyMemories(); });
  expect(result.memories.map(item => item.id)).toEqual([0, 1, 2, 3, 4]);
  expect(radar.memories.map(item => item.id)).toEqual([0, 1, 2, 3, 4]);
  expect(result.memories[0].name).toBe('First record');
});

test('normalizes interactive games, object properties, and JSON actions', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: 2,
        location_id: 3,
        name: 'Interactive memory',
        latitude: 0,
        longitude: 0,
        model_3D: 'scene.glb',
        location_group_id: 3,
        interactive: {
          id: 7,
          location_group_id: 3,
          logic: {
            games: [
              {
                type: 'discovery',
                assets: [
                  { media_id: 21, name: 'Statue', description: '3D model' },
                  { media_id: 22, name: 'Ambiance', description: 'Audio' },
                ],
                objects: [
                  {
                    properties: {
                      name: 'statue',
                      asset: 'Statue',
                      active: true,
                    },
                    actions: {
                      onClick: { type: 'playAudio', asset: 'Ambiance' },
                    },
                  },
                ],
              },
            ],
          },
          created_at: '2026-10-15T14:00:00.000000Z',
          updated_at: '2026-10-15T14:00:00.000000Z',
        },
      },
    ],
  });

  const normalized = normalizeInteractiveGames(
    JSON.stringify([
      {
        type: 'quiz',
        subtype: 'custom-quiz',
        objects: [{ properties: '{"answer":42}', actions: ['{"type":"win"}'] }],
      },
    ]),
  );
  expect(normalized[0].objects[0]).toMatchObject({
    properties: { answer: 42 },
    actions: [{ type: 'win' }],
  });
  expect(normalized[0].subtype).toBe('custom-quiz');
  expect(
    normalizeInteractive({
      id: 7,
      logic: { games: [{ type: 'discovery', objects: [] }] },
    }).logic.games[0].type,
  ).toBe('discovery');

  await act(async () => {
    await radar.loadNearbyMemories();
  });
  expect(radar.memories[0]).toMatchObject({
    model_url: 'scene.glb',
    location_group_id: 3,
    interactive: {
      id: 7,
      location_group_id: 3,
      logic: {
        games: [
          {
            type: 'discovery',
            objects: [
              {
                properties: { name: 'statue', asset: 'Statue', active: true },
                actions: { onClick: { type: 'playAudio', asset: 'Ambiance' } },
              },
            ],
          },
        ],
      },
    },
  });
});

test('normalizes a direct game response into one interactive game and ignores legacy records', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: 0,
        location_id: 70,
        latitude: 44,
        longitude: 1,
        title: 'Direct game',
        description: 'Server metadata',
        type: 'discovery',
        settings: { difficulty: 'easy' },
        assets: [],
        objects: [{ id: 1, properties: { text: 'Hello' } }],
      },
      { id: 0, location_id: 70, latitude: 44, longitude: 1, name: 'Legacy memory' },
    ],
  });
  await act(async () => {
    await radar.loadNearbyMemories();
  });
  expect(radar.memories).toHaveLength(1);
  expect(radar.memories[0]).toMatchObject({
    id: 0,
    location_id: 70,
    title: 'Direct game',
    description: 'Server metadata',
    interactive: {
      logic: {
        title: 'Direct game',
        description: 'Server metadata',
        games: [
          {
            id: 0,
            type: 'discovery',
            settings: { difficulty: 'easy' },
          },
        ],
      },
    },
  });
});

test('propagates HTTP errors instead of preparing an empty successful AR session', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 503 });
  await act(async () => {
    await expect(radar.loadNearbyMemories()).rejects.toThrow('serverError');
  });
  expect(radar.apiError).toBe('serverError');
  expect(FileSystem.fetch).not.toHaveBeenCalled();
});

test('propagates GPS failures without requesting records', async () => {
  getCurrentPositionAsync.mockRejectedValue(new Error('GPS unavailable'));
  await act(async () => {
    await expect(radar.loadNearbyMemories()).rejects.toThrow('GPS unavailable');
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('awaits a media download and returns a local URI', async () => {
  let releaseDownload;
  FileSystem.fetch.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        releaseDownload = resolve;
      }),
  );
  let download;
  let finished = false;
  await act(async () => {
    download = radar.cacheMemoryAssets({
      id: 1,
      image_url: 'https://example.test/photo.jpg',
    });
    download.then(() => {
      finished = true;
    });
  });
  expect(finished).toBe(false);
  let cached;
  await act(async () => {
    releaseDownload({ status: 200 });
    cached = await download;
  });
  expect(cached.image_url).toBe('file://cache/memory-assets/memory-1-image-0.jpg');
});

test('prepares the cache folder once before parallel first-launch downloads', async () => {
  let releaseDirectory;
  let downloads;
  FileSystem.mkdir.mockImplementationOnce(() => new Promise(resolve => {
    releaseDirectory = resolve;
  }));
  await act(async () => {
    downloads = Promise.all([
      radar.cacheMemoryAssets({
        id: 1,
        image_url: 'https://example.test/photo.jpg',
        video_url: 'https://example.test/clip.mp4',
      }),
      radar.cacheMemoryAssets({
        id: 2,
        model_url: 'https://example.test/model.glb',
      }),
    ]);
  });
  expect(FileSystem.mkdir).toHaveBeenCalledTimes(1);
  expect(FileSystem.fetch).not.toHaveBeenCalled();
  let cached;
  await act(async () => {
    releaseDirectory();
    cached = await downloads;
  });
  expect(FileSystem.fetch).toHaveBeenCalledTimes(3);
  expect(cached[0].image_url).toBe('file://cache/memory-assets/memory-1-image-0.jpg');
  expect(cached[1].model_url).toBe('file://cache/memory-assets/memory-2-model-0.glb');
});

test('prepares private image targets and scene assets before returning the experience', async () => {
  const memory = {
    id: 20,
    user_id: 4,
    type: 'images',
    interactive: {
      logic: {
        games: [
          {
            id: 30,
            type: 'images',
            assets: [{ id: 31, type: 'GLB', url: 'butterfly.glb' }],
            target: { id: 32, imageUrl: 'poster.jpg', physicalWidth: 0.6 },
            objects: [{ id: 33, properties: { asset: 31 } }],
          },
        ],
      },
    },
  };
  let cached;
  await act(async () => {
    cached = await radar.cacheMemoryAssets(memory);
  });
  expect(FileSystem.fetch).toHaveBeenCalledWith(
    'https://echoes.sophiehorner.art/api/private-files/4/model_3D/butterfly.glb',
    expect.objectContaining({
      path: expect.stringContaining('memory-20-experience-GLB-'),
    }),
  );
  expect(FileSystem.fetch).toHaveBeenCalledWith(
    'https://echoes.sophiehorner.art/api/private-files/4/image/poster.jpg',
    expect.objectContaining({
      path: expect.stringContaining('memory-20-experience-image-'),
    }),
  );
  expect(cached.interactive.logic.games[0]).toMatchObject({
    type: 'images',
    target: {
      imageUrl: expect.stringMatching(/^file:\/\//),
      physicalWidth: 0.6,
    },
    assets: [{ url: expect.stringMatching(/^file:\/\//) }],
  });
});

test('preserves root type and object logic returned directly by the API', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: 5,
        location_id: 70,
        latitude: 0,
        longitude: 0,
        type: 'treasure',
        logic: {
          games: [
            {
              id: 40,
              type: 'treasure',
              assets: [],
              objects: [{ id: 41, properties: { text: 'Clue' } }],
            },
          ],
        },
      },
    ],
  });
  await act(async () => {
    await radar.loadNearbyMemories();
  });
  let cached;
  await act(async () => {
    cached = await radar.cacheMemoryAssets(radar.memories[0]);
  });
  expect(cached.type).toBe('treasure');
  expect(cached.interactive.logic.games[0].type).toBe('treasure');
});

test('removes a partial file after a rejected download so a retry cannot reuse it', async () => {
  let partialFileExists = false;
  FileSystem.exists.mockImplementation(
    async path => path.endsWith('.jpg') && partialFileExists,
  );
  FileSystem.fetch.mockImplementationOnce(async () => {
    partialFileExists = true;
    throw new Error('Network interrupted');
  });
  await act(async () => {
    await expect(
      radar.cacheMemoryAssets({
        id: 30,
        image_url: 'https://example.test/poster.jpg',
      }),
    ).rejects.toThrow('Network interrupted');
  });
  expect(FileSystem.unlink).toHaveBeenCalledWith(
    'cache/memory-assets/memory-30-image-0.jpg',
  );
});

const nearbyGame = (id, location_id) => ({
  id, location_id, latitude: 0, longitude: 0,
  title: `Game ${id}`, type: 'discovery',
  assets: [{ id: 0, type: 'GLB', url: `https://example.test/${id}.glb` }],
  objects: [{ id: 1, properties: { asset: 0, collectible: true } }],
});

test('keeps distinct games at the same location and scopes repeated asset/object IDs to each game', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [nearbyGame(101, 7), nearbyGame(102, 7)],
  });
  let result;
  let cached;
  await act(async () => {
    result = await radar.loadNearbyMemories();
    cached = await Promise.all(result.memories.map(radar.cacheMemoryAssets));
  });
  expect(result.memories.map(({ id, location_id }) => ({ id, location_id }))).toEqual([
    { id: 0, location_id: 7 }, { id: 1, location_id: 7 },
  ]);
  expect(cached.map(item => item.interactive.logic.games[0])).toEqual([
    expect.objectContaining({
      id: 0,
      assets: [expect.objectContaining({ id: 0, url: expect.stringContaining('0-experience-') })],
      objects: [expect.objectContaining({ id: 1, properties: expect.objectContaining({ asset: 0 }) })],
    }),
    expect.objectContaining({
      id: 1,
      assets: [expect.objectContaining({ id: 0, url: expect.stringContaining('1-experience-') })],
      objects: [expect.objectContaining({ id: 1, properties: expect.objectContaining({ asset: 0 }) })],
    }),
  ]);
});

test.each([undefined, null, '', false, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects missing or invalid location_id %s without substituting the game ID',
  async locationId => {
    global.fetch.mockResolvedValue({
      ok: true, json: async () => [nearbyGame(101, locationId)],
    });
    await act(async () => {
      await expect(radar.loadNearbyMemories()).rejects.toThrow('nearbyIdentifierInvalid:games[0].location_id');
    });
    expect(radar.apiError).toBe('nearbyIdentifierInvalid:games[0].location_id');
    expect(radar.memories).toEqual([]);
  },
);

test('uses the location-scoped array index when the server game ID is missing', async () => {
  global.fetch.mockResolvedValue({
    ok: true, json: async () => [nearbyGame(undefined, 7)],
  });
  await act(async () => { await radar.loadNearbyMemories(); });
  expect(radar.memories[0].id).toBe(0);
});

test('uses the same location-scoped index regardless of the server game ID', async () => {
  global.fetch.mockResolvedValue({
    ok: true, json: async () => [nearbyGame('101', '0')],
  });
  await act(async () => { await radar.loadNearbyMemories(); });
  expect(radar.memories[0]).toMatchObject({
    id: 0, location_id: 0,
    interactive: { logic: { games: [expect.objectContaining({ id: 0, location_id: 0 })] } },
  });
});

test('assigns the next index for another game in the same location', async () => {
  global.fetch.mockResolvedValue({
    ok: true, json: async () => [nearbyGame(101, 73), nearbyGame(0, 73)],
  });
  await act(async () => {
    await radar.loadNearbyMemories();
  });
  expect(radar.memories.map(item => item.id)).toEqual([0, 1]);
});

test('restarts the game index for each location', async () => {
  global.fetch.mockResolvedValue({
    ok: true, json: async () => [nearbyGame(101, 7), nearbyGame(101, 8)],
  });
  await act(async () => {
    await radar.loadNearbyMemories();
  });
  expect(radar.memories.map(({ id, location_id }) => ({ id, location_id }))).toEqual([
    { id: 0, location_id: 7 }, { id: 0, location_id: 8 },
  ]);
});
