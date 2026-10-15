import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { normalizeInteractive, normalizeInteractiveGames, useRadar } from '../src/hooks/useRadar';
import { getCurrentPositionAsync } from '../src/services/geolocation';
import { FileSystem } from 'react-native-file-access';

jest.mock('react-native', () => ({ Linking: { openSettings: jest.fn() } }));
jest.mock('react-native-file-access', () => ({
  Dirs: { DocumentDir: 'cache' },
  FileSystem: {
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(),
    fetch: jest.fn().mockResolvedValue({ status: 200 }),
  },
}));
jest.mock('../src/services/auth', () => ({ getAuthToken: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/services/geolocation', () => ({
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));
jest.mock('../constants/i18n', () => ({ translate: (key) => key }));

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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{
      id: 1, name: 'Equator', latitude: 0, longitude: 0,
      image_url: 'https://example.test/photo.jpg',
    }],
  });
  getCurrentPositionAsync.mockResolvedValue({ coords: origin });
  act(() => { renderer = TestRenderer.create(<Probe />); });
});

afterEach(() => {
  act(() => renderer.unmount());
  jest.useRealTimers();
  global.fetch = originalFetch;
});

test('refreshes GPS and downloads the nearby records with a 2500 m request cap', async () => {
  let result;
  await act(async () => { result = await radar.loadNearbyMemories(); });
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
    json: async () => [{
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
          games: [{
            type: 'discovery',
            assets: [
              { media_id: 21, name: 'Statue', description: '3D model' },
              { media_id: 22, name: 'Ambiance', description: 'Audio' },
            ],
            objects: [{
              properties: { name: 'statue', asset: 'Statue', active: true },
              actions: { onClick: { type: 'playAudio', asset: 'Ambiance' } },
            }],
          }],
        },
        created_at: '2026-10-15T14:00:00.000000Z',
        updated_at: '2026-10-15T14:00:00.000000Z',
      },
    }],
  });

  const normalized = normalizeInteractiveGames(JSON.stringify([{
    type: 'quiz',
    objects: [{ properties: '{"answer":42}', actions: ['{"type":"win"}'] }],
  }]));
  expect(normalized[0].objects[0]).toMatchObject({
    properties: { answer: 42 },
    actions: [{ type: 'win' }],
  });
  expect(normalizeInteractive({
    id: 7,
    logic: { games: [{ type: 'discovery', objects: [] }] },
  }).logic.games[0].type).toBe('discovery');

  await act(async () => { await radar.loadNearbyMemories(); });
  expect(radar.memories[0]).toMatchObject({
    model_url: 'scene.glb',
    location_group_id: 3,
    interactive: {
      id: 7,
      location_group_id: 3,
      logic: {
        games: [{
          type: 'discovery',
          objects: [{
            properties: { name: 'statue', asset: 'Statue', active: true },
            actions: { onClick: { type: 'playAudio', asset: 'Ambiance' } },
          }],
        }],
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
  FileSystem.fetch.mockImplementationOnce(() => new Promise((resolve) => { releaseDownload = resolve; }));
  let download;
  let finished = false;
  await act(async () => {
    download = radar.cacheMemoryAssets({ id: 1, image_url: 'https://example.test/photo.jpg' });
    download.then(() => { finished = true; });
  });
  expect(finished).toBe(false);
  let cached;
  await act(async () => {
    releaseDownload({ status: 200 });
    cached = await download;
  });
  expect(cached.image_url).toBe('file://cache/memory-assets/1-image-0.jpg');
});
