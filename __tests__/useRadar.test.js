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
jest.mock('../constants/i18n', () => ({ translate: key => key }));

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
  expect(global.fetch.mock.calls[0][0]).toMatch(/\?lat=0&lng=0&radius=2500$/);
  expect(radar.radius).toBe(2500);
  expect(result.location).toEqual(origin);
  expect(result.memories).toHaveLength(1);
  expect(result.memories[0]).toMatchObject({ id: 1, lat: 0, lng: 0 });
  expect(FileSystem.fetch).not.toHaveBeenCalled();
});

test('normalizes interactive games, object properties, and JSON actions', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => [
      {
        id: 2,
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
        objects: [{ properties: '{"answer":42}', actions: ['{"type":"win"}'] }],
      },
    ]),
  );
  expect(normalized[0].objects[0]).toMatchObject({
    properties: { answer: 42 },
    actions: [{ type: 'win' }],
  });
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
        id: 10,
        latitude: 44,
        longitude: 1,
        title: 'Direct game',
        description: 'Server metadata',
        type: 'discovery',
        settings: { difficulty: 'easy' },
        assets: [],
        objects: [{ id: 1, properties: { text: 'Hello' } }],
      },
      { id: 11, latitude: 44, longitude: 1, name: 'Legacy memory' },
    ],
  });
  await act(async () => {
    await radar.loadNearbyMemories();
  });
  expect(radar.memories).toHaveLength(1);
  expect(radar.memories[0]).toMatchObject({
    title: 'Direct game',
    description: 'Server metadata',
    interactive: {
      logic: {
        title: 'Direct game',
        description: 'Server metadata',
        games: [
          {
            id: 10,
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
  expect(cached.image_url).toBe('file://cache/memory-assets/1-image-0.jpg');
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
      path: expect.stringContaining('20-experience-GLB-'),
    }),
  );
  expect(FileSystem.fetch).toHaveBeenCalledWith(
    'https://echoes.sophiehorner.art/api/private-files/4/image/poster.jpg',
    expect.objectContaining({
      path: expect.stringContaining('20-experience-image-'),
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
    'cache/memory-assets/30-image-0.jpg',
  );
});
