import { Image } from 'react-native';
import { loadBundledGames } from '../src/services/bundledGames';
import type { BundledGameEntry } from '../src/services/bundledGames';
import { readExperience } from '../src/experiences/experience';

jest.mock('../assets/models/demo1_ball.glb', () => 1);
jest.mock('../assets/models/demo1_skittle.glb', () => 2);
jest.mock('../assets/models/demo2_unicorn.glb', () => 3);
jest.mock('../assets/models/demo2_basket.glb', () => 4);
jest.mock('../assets/models/demo3_dart.glb', () => 5);
jest.mock('../assets/models/demo3_dartboard.glb', () => 6);

jest.mock('react-native', () => ({
  Image: { resolveAssetSource: jest.fn((id: number) => ({ uri: `asset:/demo-${id}.glb` })) },
}));

const definition = () => ({
  id: 101, location_id: 900, name: 'Demo basket', lat: 0, lng: 0,
  interactive: { logic: { games: [{
    id: 101, type: 'aiming', subtype: 'basket',
    assets: [
      { id: 1, type: 'GLB', url: 'bundle:ball.glb' },
      { id: 2, type: 'GLB', url: 'bundle:basket.glb' },
    ],
    objects: [
      { id: 1, properties: { asset: 1, collider: { type: 'sphere', size: [0.1, 0.1, 0.1] } } },
      { id: 2, properties: {
        asset: 2, position: [0, 0.5, -2],
        collider: { type: 'basket', size: [1, 1, 1], thickness: 0.05 },
      } },
    ],
    settings: {
      plane: { minWidth: 1, minLength: 1 },
      projectile: { objectId: 1 }, targets: [2], multiplier: 5,
    },
  }] } },
});
const entry = (): BundledGameEntry => ({
  definition: definition(), assets: { 'ball.glb': 1, 'basket.glb': 2 },
});

beforeEach(() => jest.clearAllMocks());

test('registers three complete demos with local-only identities and bundled assets', () => {
  const games = loadBundledGames();
  expect(games.map(game => game.location_id)).toEqual([-1, -2, -3]);
  expect(games.map(game => game.interactive.logic.games[0].subtype))
    .toEqual(['bowling', 'basket', 'dartboard']);
  expect(games.every(game => game.localOnly && game.isBundled)).toBe(true);
  expect(games.every(game => game.interactive.logic.games[0].assets.length === 2)).toBe(true);
});

test('local registration does not replace null placeholders in the source JSON', () => {
  const input = { ...entry(), localId: 7, definition: { ...definition(), id: null, location_id: null } };
  const before = JSON.stringify(input.definition);
  const [game] = loadBundledGames([input]);
  expect(game).toMatchObject({ location_id: -7, localOnly: true, id: 101 });
  expect(JSON.stringify(input.definition)).toBe(before);
});

test.each([0, -1, 1.5, NaN])('rejects an invalid stable local ID (%s)', localId => {
  expect(() => loadBundledGames([{ ...entry(), localId }])).toThrow('positive stable local identifier');
});

test('rejects reused local storage IDs even when game definitions differ', () => {
  expect(() => loadBundledGames([
    { ...entry(), localId: 1 },
    { ...entry(), localId: 1, definition: { ...definition(), id: 102 } },
  ])).toThrow('duplicate entry');
});

test('resolves bundled assets into a complete playable game without changing server identity', () => {
  const input = entry();
  const json = JSON.stringify(input.definition);
  const [game] = loadBundledGames([input]);
  expect(game).toMatchObject({
    id: 101, location_id: 900, lat: 0, lng: 0,
    isBundled: true, is_collectible: false,
  });
  expect(game.interactive.logic.games[0].assets.map(asset => asset.url))
    .toEqual(['asset:/demo-1.glb', 'asset:/demo-2.glb']);
  expect(readExperience(game)?.games[0].settings?.multiplier).toBe(5);
  expect(JSON.stringify(input.definition)).toBe(json);
});

test.each([null, {}, { ...definition(), id: 0 }, { ...definition(), location_id: 0 },
  { ...definition(), lat: 48 }, { ...definition(), lng: 2 },
  { ...definition(), name: '' }, { ...definition(), id: 102 }])(
  'rejects incomplete definitions, invented identifiers and geographic coordinates (%j)',
  invalid => {
    expect(() => loadBundledGames([{ ...entry(), definition: invalid }])).toThrow();
  },
);

test('requires every resource to be explicitly bundled rather than downloaded', () => {
  const input = definition();
  input.interactive.logic.games[0].assets[0].url = 'https://example.com/ball.glb';
  expect(() => loadBundledGames([{ ...entry(), definition: input }]))
    .toThrow('unregistered bundled asset');
  expect(() => loadBundledGames([{ ...entry(), assets: {} }]))
    .toThrow('unregistered bundled asset');
});

test('rejects duplicate games and unresolved native assets', () => {
  expect(() => loadBundledGames([entry(), entry()])).toThrow('duplicate entry');
  jest.mocked(Image.resolveAssetSource).mockReturnValueOnce({ uri: '', width: 0, height: 0, scale: 1 });
  expect(() => loadBundledGames([entry()])).toThrow('cannot resolve bundled asset');
});

test('resolves an image-tracking target as well as its game assets', () => {
  const [game] = loadBundledGames([{
    definition: {
      id: 102, location_id: 900, name: 'Poster',
      logic: { games: [{
        id: 102, type: 'images', assets: [], objects: [],
        target: { id: 3, imageUrl: 'bundle:poster.png', physicalWidth: 0.5 },
      }] },
    },
    assets: { 'poster.png': 3 },
  }]);
  expect(game.interactive.logic.games[0].target?.imageUrl).toBe('asset:/demo-3.glb');
});
