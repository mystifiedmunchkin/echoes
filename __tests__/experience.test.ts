import {
  cacheExperience,
  hasExperience,
  readExperience,
} from '../src/experiences/experience';

const game = {
  id: 1,
  assets: [{ id: 10, type: 'GLB', url: 'https://example.test/model.glb' }],
  objects: [
    {
      id: 100,
      properties: {
        asset: 10,
        position: [0, 0, 0],
        physics: {
          type: 'Dynamic',
          mass: 1,
          shape: { type: 'Sphere', params: [0.1] },
        },
      },
      actions: { onClick: { type: 'custom' } },
    },
  ],
};
const target = {
  id: 200,
  imageUrl: 'https://example.test/poster.jpg',
  physicalWidth: 0.5,
};
const memory = (type = 'discovery') => ({
  interactive: {
    logic: {
      games: [{ ...game, type, ...(type === 'images' ? { target } : {}) }],
    },
  },
});

test.each(['aiming', 'treasure', 'discovery', 'images'])(
  'reads the %s template from an object JSON',
  type => {
    const result = readExperience(memory(type));
    expect(result?.games[0].type).toBe(type);
    expect(result?.gravity).toEqual([0, -9.81, 0]);
    expect(result?.games[0].objects[0].actions).toEqual(
      game.objects[0].actions,
    );
  },
);

test('requires type inside each game and preserves custom settings', () => {
  expect(
    readExperience({
      type: 'treasure',
      logic: { games: [{ ...game, type: 'treasure' }] },
    })?.games[0].type,
  ).toBe('treasure');
  const result = readExperience({
    interactive: {
      logic: {
        gravity: [0, 0, 0],
        games: [{ ...game, type: 'discovery', settings: { custom: true } }],
      },
    },
  });
  expect(result?.games[0]).toMatchObject({
    type: 'discovery',
    settings: { custom: true },
  });
  expect(result?.gravity).toEqual([0, 0, 0]);
});

test('rejects a root or definition type when a game type is missing', () => {
  expect(() =>
    readExperience({ type: 'treasure', logic: { games: [game] } }),
  ).toThrow('logic.games[0].type');
  expect(() =>
    readExperience({
      interactive: { type: 'treasure', logic: { games: [game] } },
    }),
  ).toThrow('logic.games[0].type');
});

test('keeps ordinary memories outside the experience runtime', () => {
  expect(readExperience({ id: 1 })).toBeNull();
  expect(hasExperience({ id: 1 })).toBe(false);
  expect(readExperience({ interactive: { logic: { games: [] } } })).toBeNull();
});

test.each([true, false])('accepts the explicit collectible boolean %s', collectible => {
  const definition = memory();
  const parsed = readExperience({
    interactive: {
      logic: {
        games: definition.interactive.logic.games.map(item => ({
          ...item,
          objects: item.objects.map(object => ({
            ...object, properties: { ...object.properties, collectible },
          })),
        })),
      },
    },
  });
  expect(parsed?.games[0].objects[0].properties.collectible).toBe(collectible);
});

test.each(['true', 1, null])('rejects non-boolean collectible %s', collectible => {
  const definition = memory();
  expect(() => readExperience({
    interactive: {
      logic: {
        games: definition.interactive.logic.games.map(item => ({
          ...item,
          objects: item.objects.map(object => ({
            ...object, properties: { ...object.properties, collectible },
          })),
        })),
      },
    },
  })).toThrow('properties.collectible');
});

test('requires a server game ID for collectible objects instead of using an array index', () => {
  const definition = memory();
  const withoutId = { ...definition.interactive.logic.games[0], id: undefined };
  expect(() => readExperience({
    logic: {
      games: [{
        ...withoutId,
        objects: [{ id: 1, properties: { text: 'Key', collectible: true } }],
      }],
    },
  })).toThrow('id required for collectible objects');
});

test.each([
  { ...game, type: 'quiz' },
  { ...game, type: 'images', target: { ...target, physicalWidth: 0 } },
  { ...game, type: 'images', target: { ...target, orientation: 'invalid' } },
  { ...game, objects: [{ id: 101, properties: { asset: 999 } }] },
  {
    ...game,
    objects: [{ id: 101, properties: { text: 'bad', position: [0, NaN, 0] } }],
  },
  {
    ...game,
    objects: [
      { id: 101, properties: { text: 'bad', physics: { type: 'Dynamic' } } },
    ],
  },
  { ...game, objects: [game.objects[0], game.objects[0]] },
])('rejects unsupported or malformed runtime data explicitly', invalidGame => {
  expect(() =>
    readExperience({
      type: 'discovery',
      interactive: { logic: { games: [invalidGame] } },
    }),
  ).toThrow('Invalid experience:');
});

test('prepares every game asset and image target without mutating the API object', async () => {
  const source = memory('images');
  const cache = jest.fn(async (url: string) => `local:${url}`);
  const result = await cacheExperience(source, cache);
  expect(cache).toHaveBeenCalledWith(
    game.assets[0].url,
    'GLB',
    expect.any(Number),
  );
  expect(cache).toHaveBeenCalledWith(
    target.imageUrl,
    'image',
    expect.any(Number),
  );
  expect(result?.games[0].assets[0].url).toBe(`local:${game.assets[0].url}`);
  expect(result?.games[0].target?.imageUrl).toBe(`local:${target.imageUrl}`);
  expect(source.interactive.logic.games[0].assets[0].url).toBe(
    game.assets[0].url,
  );
});

test('propagates target download failure rather than returning a prepared experience', async () => {
  await expect(
    cacheExperience(memory('images'), async () => {
      throw new Error('Target download failed');
    }),
  ).rejects.toThrow('Target download failed');
});
