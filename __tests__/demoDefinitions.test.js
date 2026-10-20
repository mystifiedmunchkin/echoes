import fs from 'fs';
import path from 'path';
import { readExperience } from '../src/experiences/experience';
import { loadBundledGames } from '../src/services/bundledGames';
import demo1 from '../assets/demos/demo1.json';
import demo2 from '../assets/demos/demo2.json';
import demo3 from '../assets/demos/demo3.json';

jest.mock('react-native', () => ({
  Image: { resolveAssetSource: id => ({ uri: `asset:/demo-${id}.glb` }) },
}));

test.each([
  ['demo1', demo1, 'bowling', false, true, [2, 3, 4]],
  ['demo2', demo2, 'basket', false, false, [2]],
  ['demo3', demo3, 'dartboard', true, false, [2]],
])('%s is ready for server IDs and uses the expected game rules', (_name, draft, subtype, freeze, fall, targets) => {
  expect(draft.id).toBeNull();
  expect(draft.location_id).toBeNull();
  expect(draft.interactive.logic.games[0].id).toBeNull();
  expect([draft.lat, draft.lng]).toEqual([0, 0]);
  expect(() => loadBundledGames([{ definition: draft, assets: {} }]))
    .toThrow('positive server identifier required');

  const definition = JSON.parse(JSON.stringify(draft));
  definition.id = 101;
  definition.location_id = 900;
  definition.interactive.logic.games[0].id = 101;
  const assets = Object.fromEntries(definition.interactive.logic.games[0].assets.map((asset, index) => {
    expect(asset.url).toMatch(/^bundle:demo[123]_.+\.glb$/);
    const filename = asset.url.slice('bundle:'.length);
    expect(fs.existsSync(path.join(__dirname, '..', 'assets', 'models', filename))).toBe(true);
    return [filename, index + 1];
  }));
  const [memory] = loadBundledGames([{ definition, assets }]);
  const game = readExperience(memory).games[0];
  expect(game.subtype).toBe(subtype);
  expect(game.settings).toMatchObject({ freeze, fall, targets, projectile: { objectId: 1 } });
  expect(game.objects.find(object => object.id === 1).properties.physics.type).toBe('Dynamic');
  expect(game.objects.find(object => object.id === 2).properties.physics.type)
    .toBe(fall ? 'Dynamic' : 'Static');
  expect(game.assets).toHaveLength(2);
});

test('demo1 has three identical dynamic skittles in one evenly spaced row', () => {
  const game = demo1.interactive.logic.games[0];
  const pins = game.settings.targets.map(id => game.objects.find(object => object.id === id));
  expect(pins.map(pin => pin.properties.position)).toEqual([
    [-0.15, 0.18, -2], [0, 0.18, -2], [0.15, 0.18, -2],
  ]);
  const propertiesWithoutPosition = pins.map(({ properties: { position, ...properties } }) => properties);
  expect(propertiesWithoutPosition[0]).toMatchObject({ asset: 2, physics: { type: 'Dynamic' } });
  expect(propertiesWithoutPosition[1]).toEqual(propertiesWithoutPosition[0]);
  expect(propertiesWithoutPosition[2]).toEqual(propertiesWithoutPosition[0]);
});
