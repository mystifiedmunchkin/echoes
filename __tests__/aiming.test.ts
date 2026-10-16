import { colliderShape } from '../src/experiences/aiming';
import { cacheExperience, readExperience } from '../src/experiences/experience';

const projectile = {
  id: 1,
  properties: {
    asset: 10,
    collider: { type: 'sphere', size: [0.2, 0.2, 0.2] },
    physics: { type: 'Dynamic', mass: 0.5, restitution: 0.4 },
  },
};
const target = {
  id: 2,
  properties: {
    asset: 20,
    position: [0, 0.5, 0],
    collider: { type: 'basket', size: [1, 1, 1], thickness: 0.05 },
  },
};
const game = {
  id: 100,
  type: 'aiming',
  assets: [
    { id: 10, name: 'Ball', type: 'GLB', url: 'https://example.test/ball.glb' },
    { id: 20, name: 'Hoop', type: 'OBJ', url: 'https://example.test/hoop.obj' },
  ],
  objects: [projectile, target],
  settings: {
    plane: { minWidth: 2, minLength: 3 },
    projectile: { objectId: 1 },
    targets: [2],
  },
};
const readGame = (value: unknown) =>
  readExperience({ logic: { games: [value] } });

test('reads and defaults a server-configured aiming game without mutating it', () => {
  const parsed = readGame(game)!.games[0];
  expect(parsed.settings).toEqual({
    plane: { minWidth: 2, minLength: 3, stableMs: 1000 },
    projectile: {
      objectId: 1,
      speed: 5,
      spawnDistance: 0.3,
      lifetimeMs: 10000,
      maxActive: 12,
    },
    targets: [2],
  });
  expect(parsed.objects[0].properties.physics).toMatchObject({ mass: 0.5 });
  expect(game.settings.projectile).toEqual({ objectId: 1 });
});

test.each(['GLB', 'OBJ'])('accepts a %s projectile', type => {
  expect(
    readGame({
      ...game,
      assets: [{ ...game.assets[0], type }, game.assets[1]],
    }),
  ).not.toBeNull();
});

test.each(['GLB', 'GLTF', 'OBJ'])('accepts a %s target', type => {
  expect(
    readGame({
      ...game,
      assets: [game.assets[0], { ...game.assets[1], type }],
    }),
  ).not.toBeNull();
});

test.each([
  { type: 'capsule', size: [0.2, 0.6, 0.2] },
  { type: 'bounding', size: [0.2, 0.4, 0.6] },
  { type: 'diamond', size: [0.2, 0.4, 0.6] },
  { type: 'sphere', size: [0.2, 0.2, 0.2] },
  { type: 'basket', size: [0.2, 0.4, 0.6], thickness: 0.01 },
])('accepts $type for both projectile and target', collider => {
  const parsed = readGame({
    ...game,
    objects: [
      { ...projectile, properties: { ...projectile.properties, collider } },
      { ...target, properties: { ...target.properties, collider } },
    ],
  })!;
  expect(
    parsed.games[0].objects.map(object => object.properties.collider),
  ).toEqual([collider, collider]);
});

test.each(['aiming-floor', 'aiming-shot:reserved'])(
  'rejects non-integer server ID %s',
  id => {
    expect(() =>
      readGame({
        ...game,
        objects: [...game.objects, { id, properties: { text: 'extra' } }],
      }),
    ).toThrow('objects[2].id');
  },
);

test.each([
  { ...game, settings: null },
  {
    ...game,
    settings: { ...game.settings, plane: { minWidth: 0, minLength: 1 } },
  },
  {
    ...game,
    settings: { ...game.settings, plane: { minWidth: 1, minLength: NaN } },
  },
  {
    ...game,
    settings: {
      ...game.settings,
      plane: { minWidth: 1, minLength: 1, stableMs: 0 },
    },
  },
  { ...game, settings: { ...game.settings, targets: [] } },
  { ...game, settings: { ...game.settings, targets: [2, 2] } },
  { ...game, settings: { ...game.settings, targets: [1] } },
  { ...game, settings: { ...game.settings, targets: [999] } },
  ...['speed', 'spawnDistance', 'lifetimeMs', 'maxActive'].map(key => ({
    ...game,
    settings: { ...game.settings, projectile: { objectId: 1, [key]: -1 } },
  })),
  {
    ...game,
    settings: {
      ...game.settings,
      projectile: { objectId: 1, maxActive: 1.5 },
    },
  },
  {
    ...game,
    settings: {
      ...game.settings,
      projectile: { objectId: 1, lifetimeMs: 2147483648 },
    },
  },
  {
    ...game,
    objects: [{ ...projectile, properties: { asset: 10 } }, target],
  },
  {
    ...game,
    objects: [
      {
        ...projectile,
        properties: { ...projectile.properties, active: false },
      },
      target,
    ],
  },
  {
    ...game,
    objects: [
      {
        ...projectile,
        properties: { ...projectile.properties, physics: { type: 'Static' } },
      },
      target,
    ],
  },
  {
    ...game,
    objects: [
      projectile,
      {
        ...target,
        properties: {
          ...target.properties,
          animation: { rotateY: 360, duration: 1000 },
        },
      },
    ],
  },
])('rejects invalid aiming settings explicitly (%#)', invalid => {
  expect(() => readGame(invalid)).toThrow('Invalid experience:');
});

test.each([
  { type: 'unknown', size: [1, 1, 1] },
  { type: 'sphere', size: [1, 2, 1] },
  { type: 'sphere', size: [1, 1] },
  { type: 'sphere', size: [1, 0, 1] },
  { type: 'capsule', size: [1, 0.5, 1] },
  { type: 'capsule', size: [1, 2, 2] },
  { type: 'bounding', size: [1, Infinity, 1] },
  { type: 'basket', size: [1, 1, 1], thickness: 0.5 },
  { type: 'basket', size: [1, 1, 1] },
  { type: 'diamond', size: [1, 1, 1], thickness: 0.1 },
])('rejects malformed colliders (%#)', collider => {
  expect(() =>
    readGame({
      ...game,
      objects: [
        { ...projectile, properties: { ...projectile.properties, collider } },
        target,
      ],
    }),
  ).toThrow('Invalid experience:');
});

test('generates explicit bounds, sphere and an open basket with no top collider', () => {
  expect(colliderShape({ type: 'bounding', size: [1, 2, 3] })).toEqual({
    type: 'Box',
    params: [1, 2, 3],
  });
  expect(colliderShape({ type: 'sphere', size: [0.2, 0.2, 0.2] })).toEqual({
    type: 'Sphere',
    params: [0.1],
  });
  const basket = colliderShape({
    type: 'basket',
    size: [2, 1, 2],
    thickness: 0.1,
  });
  expect(basket.type).toBe('Compound');
  expect(basket.children).toHaveLength(5);
  expect(basket.children![0]).toEqual({
    type: 'Box',
    params: [2, 0.1, 2],
    position: [0, -0.45, 0],
  });
  // An axial projectile can pass through the opening without hitting a hidden lid.
  expect(
    basket.children!.every(
      part =>
        Math.abs(part.position[0]) >= part.params[0] / 2 ||
        Math.abs(part.position[2]) >= part.params[2] / 2 ||
        part.position[1] < 0,
    ),
  ).toBe(true);
});

test.each(['capsule', 'diamond'] as const)(
  'builds finite positive compound parts for %s',
  type => {
    const shape = colliderShape({ type, size: [0.2, 0.6, 0.2] });
    expect(shape.type).toBe('Compound');
    expect(shape.children!.length).toBeGreaterThan(2);
    for (const part of shape.children!) {
      expect(part.params.every(n => Number.isFinite(n) && n > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }
    for (const [axis, dimension] of [0.2, 0.6, 0.2].entries()) {
      const minimum = Math.min(
        ...shape.children!.map(
          part =>
            part.position[axis] -
            (part.type === 'Sphere' ? part.params[0] : part.params[axis] / 2),
        ),
      );
      const maximum = Math.max(
        ...shape.children!.map(
          part =>
            part.position[axis] +
            (part.type === 'Sphere' ? part.params[0] : part.params[axis] / 2),
        ),
      );
      expect(minimum).toBeCloseTo(-dimension / 2);
      expect(maximum).toBeCloseTo(dimension / 2);
    }
  },
);

test('caches aiming OBJ and GLB assets with existing preparation', async () => {
  const cache = jest.fn(async (url: string) => `local:${url}`);
  const result = await cacheExperience({ logic: { games: [game] } }, cache);
  expect(result!.games[0].assets.map(asset => asset.url)).toEqual(
    game.assets.map(asset => `local:${asset.url}`),
  );
  expect(cache).toHaveBeenCalledTimes(2);
  expect(result!.games[0].settings?.targets).toEqual([2]);
});
