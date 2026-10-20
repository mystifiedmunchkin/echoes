import {
  colliderShape,
  bowlingPoints,
  distanceAdjustedPoints,
  colliderSize,
  isBottomContact,
  launchSpeed,
  hasFallen,
  impactPoints,
  readCollider,
} from '../src/experiences/aiming';
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
      lifetimeMs: null,
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

test('reads impact rules and preserves explicit false values', () => {
  expect(readGame({
    ...game,
    settings: { ...game.settings, reward: 20, freeze: false, multiplier: 10, fall: false },
  })!.games[0].settings).toMatchObject({
    reward: 20, freeze: false, multiplier: 10, fall: false,
  });
});

test.each([
  [0, 100, 1],
  [0.5, 100, 50],
  [1, 100, 100],
  [2, 100, 100],
])('scales bowling points by distance below one metre', (distance, multiplier, expected) => {
  expect(bowlingPoints(distance, multiplier)).toBe(expected);
});

test('applies the same distance rule to every aiming score', () => {
  expect(distanceAdjustedPoints(0.5, 7)).toBe(4);
  expect(distanceAdjustedPoints(1, 7)).toBe(7);
});

test.each(['basket', 'dartboard', 'bowling'] as const)(
  'reads %s subtype defaults without mutating the definition',
  subtype => {
    const source = {
      ...game,
      subtype,
      objects: [projectile, {
        ...target,
        properties: {
          ...target.properties,
          collider: subtype === 'basket'
            ? target.properties.collider
            : { type: 'bounding', size: [1, 1, 0.1] },
          ...(subtype === 'bowling' ? { physics: { type: 'Dynamic' } } : {}),
        },
      }],
    };
    const parsed = readGame(source)!.games[0];
    expect(parsed.subtype).toBe(subtype);
    expect(parsed.settings).toMatchObject({
      freeze: subtype === 'dartboard',
      fall: subtype === 'bowling',
    });
    expect(parsed.settings?.multiplier).toBe(subtype === 'dartboard' ? 10 : undefined);
    expect(source.settings).toBe(game.settings);
    expect(source.settings).not.toHaveProperty('freeze');
  },
);

test('accepts an open bounding basket and a customized dartboard maximum and reward', () => {
  const objects = [projectile, {
    ...target,
    properties: {
      ...target.properties,
      collider: { type: 'bounding', size: [1, 1, 0.2] },
    },
  }];
  expect(readGame({ ...game, subtype: 'basket', objects })!.games[0].settings)
    .toMatchObject({ freeze: false, fall: false });
  expect(readGame({
    ...game, subtype: 'dartboard', objects,
    settings: { ...game.settings, multiplier: 25, reward: 20, freeze: true, fall: false },
  })!.games[0].settings).toMatchObject({ multiplier: 25, reward: 20, freeze: true, fall: false });
});

test.each([
  ['basket', { freeze: true }],
  ['basket', { fall: true }],
  ['dartboard', { freeze: false }],
  ['dartboard', { fall: true }],
  ['bowling', { freeze: true }],
  ['bowling', { fall: false }],
])('rejects settings contradicting subtype %s: %j', (subtype, rules) => {
  expect(() => readGame({
    ...game, subtype, settings: { ...game.settings, ...rules },
  })).toThrow(`conflicts with subtype ${subtype}`);
});

test.each([
  { ...game, subtype: 'unknown' },
  { ...game, subtype: 'basket', settings: undefined },
  { ...game, subtype: 'dartboard' },
  { ...game, subtype: 'bowling' },
  {
    ...game, subtype: 'basket',
    objects: [projectile, {
      ...target, properties: { ...target.properties, collider: projectile.properties.collider },
    }],
  },
  {
    ...game, subtype: 'bowling',
    objects: [projectile, {
      ...target, properties: {
        ...target.properties,
        collider: { type: 'bounding', size: [1, 1, 1] },
      },
    }],
  },
])('rejects incomplete or incompatible aiming subtypes (%#)', invalid => {
  expect(() => readGame(invalid)).toThrow('Invalid experience:');
});

test.each([
  { reward: -1 }, { reward: 999 }, { reward: '20' }, { reward: 1.5 },
  { multiplier: 0 }, { multiplier: -1 }, { multiplier: 1.5 },
  { multiplier: Infinity }, { multiplier: Number.MAX_SAFE_INTEGER + 1 },
  { multiplier: null }, { freeze: 1 }, { fall: 'true' }, { fall: true },
])('rejects invalid impact rules %j', rules => {
  expect(() => readGame({
    ...game, settings: { ...game.settings, ...rules },
  })).toThrow('Invalid experience:');
});

test('requires dynamic targets for fall, but allows combined freeze and fall', () => {
  expect(readGame({
    ...game,
    objects: [projectile, {
      ...target,
      properties: { ...target.properties, physics: { type: 'Dynamic' } },
    }],
    settings: { ...game.settings, fall: true, freeze: true },
  })!.games[0].settings).toMatchObject({ fall: true, freeze: true });
});

test.each([
  [[0, 0, 0.1], 10],
  [[0.5, 0, 0.1], 6],
  [[1, 0, 0.1], 1],
  [[2, 2, 0.1], 1],
])('scores a radial hit at %j as %s points', (point, expected) => {
  expect(impactPoints(
    { type: 'bounding', size: [2, 2, 0.2] },
    point as [number, number, number], [0, 0, 1],
    { position: [0, 0, 0], rotation: [0, 0, 0] }, 10,
  )).toBe(expected);
});

test('scores in the rotated body frame and projects basket hits onto the bottom', () => {
  expect(impactPoints(
    { type: 'bounding', size: [2, 2, 0.2] },
    [3.1, 4, 5], [1, 0, 0],
    { position: [3, 4, 5], rotation: [0, 90, 0] }, 10,
  )).toBe(10);
  expect(impactPoints(
    { type: 'basket', size: [2, 2, 2], thickness: 0.1 },
    [0, -0.9, 0], [0, 1, 0],
    { position: [0, 0, 0], rotation: [0, 0, 0] }, 10,
  )).toBe(10);
});

test('detects the exact 60 degree fall threshold without treating yaw as a fall', () => {
  expect(hasFallen([59.999, 0, 0], [0, 0, 0], [0, 0, 0])).toBe(false);
  expect(hasFallen([60, 0, 0], [0, 0, 0], [0, 0, 0])).toBe(true);
  expect(hasFallen([0, 150, 0], [0, 0, 0], [0, 90, 0])).toBe(false);
  expect(hasFallen([0, 0, 80], [0, 0, 20], [0, 0, 0])).toBe(true);
  expect(hasFallen([0, 90, -30], [30, 0, 0], [0, 90, 0])).toBe(false);
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
  { type: 'diamond', base: 0.2, middle: 0.15, height: 0.6 },
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
  { type: 'diamond', size: [1, 1, 1] },
  { type: 'diamond', base: 0.2, height: 0.6 },
  { type: 'diamond', middle: 0.15, height: 0.6 },
  { type: 'diamond', base: 0.2, middle: 0.15 },
  ...['base', 'middle', 'height'].flatMap(key =>
    [0, -1, NaN, Infinity, null, '0.2'].map(value => ({
      type: 'diamond', base: 0.2, middle: 0.15, height: 0.6, [key]: value,
    })),
  ),
  { type: 'diamond', base: 0.2, middle: 0.300001, height: 0.6 },
  { type: 'diamond', base: 0.2, middle: 0.15, height: 0.6, size: [1, 1, 1] },
  { type: 'diamond', base: 0.2, middle: 0.15, height: 0.6, thickness: 0.1 },
  { type: 'bounding', size: [1, 1, 1], base: 0.2 },
  { type: 'sphere', size: [1, 1, 1], middle: 0.15 },
  { type: 'capsule', size: [1, 2, 1], height: 0.6 },
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
  const boundingTarget = colliderShape(
    { type: 'bounding', size: [1, 2, 3] },
    { targetBottom: true },
  );
  expect(boundingTarget.type).toBe('Compound');
  expect(boundingTarget.children).toHaveLength(5);
  expect(boundingTarget.children![0]).toEqual({
    type: 'Box',
    params: [1, 0.05, 3],
    position: [0, -0.975, 0],
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

test.each(['basket', 'bounding'] as const)(
  'separates the %s container bottom and walls without changing its geometry',
  type => {
    const collider = type === 'basket'
      ? { type, size: [1, 1, 1] as [number, number, number], thickness: 0.05 }
      : { type, size: [1, 1, 1] as [number, number, number] };
    const options = { targetBottom: true };
    const complete = colliderShape(collider, options);
    const bottom = colliderShape(collider, { ...options, containerPart: 'bottom' });
    const walls = colliderShape(collider, { ...options, containerPart: 'walls' });
    expect(bottom.children).toHaveLength(1);
    expect(walls.children).toHaveLength(4);
    expect([...bottom.children!, ...walls.children!]).toEqual(complete.children);
  },
);

test('scores only the interior top face of the bottom, not walls, rims or underside', () => {
  const collider = {
    type: 'basket' as const,
    size: [1, 1, 1] as [number, number, number],
    thickness: 0.05,
  };
  const transform = {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
  };
  expect(isBottomContact(collider, [0, -0.45, 0], [0, 1, 0], transform)).toBe(
    true,
  );
  expect(
    isBottomContact(collider, [0, -0.455, 0], [0.1, -0.9, 0.1], transform),
  ).toBe(true);
  expect(isBottomContact(collider, [0.45, 0, 0], [1, 0, 0], transform)).toBe(
    false,
  );
  expect(isBottomContact(collider, [0.475, 0.5, 0], [0, 1, 0], transform)).toBe(
    false,
  );
  expect(isBottomContact(collider, [0, -0.5, 0], [0, -1, 0], transform)).toBe(
    false,
  );
  expect(isBottomContact(collider, [0, -0.45, 0], [0, 0, 0], transform)).toBe(
    false,
  );
  expect(isBottomContact(collider, [NaN, -0.45, 0], [0, 1, 0], transform)).toBe(
    false,
  );
});

test('classifies bottom contacts in the current translated and rotated target frame', () => {
  const collider = {
    type: 'bounding' as const,
    size: [1, 1, 1] as [number, number, number],
  };
  expect(
    isBottomContact(collider, [2, 3, 3.55], [0, 0, 1], {
      position: [2, 3, 4],
      rotation: [90, 0, 0],
    }),
  ).toBe(true);
  expect(
    isBottomContact(collider, [2, 3, 3.55], [0, 1, 0], {
      position: [2, 3, 4],
      rotation: [90, 0, 0],
    }),
  ).toBe(false);
  expect(
    isBottomContact(collider, [1.55, 3, 4], [1, 0, 0], {
      position: [2, 3, 4],
      rotation: [90, 90, 0],
    }),
  ).toBe(true);
});

test.each([
  [-100, 6],
  [0, 6],
  [500, 7.5],
  [1000, 9],
  [2000, 12],
  [10000, 12],
])(
  'scales launch speed linearly and caps charge at two seconds (%s ms)',
  (heldMs, speed) => {
    expect(launchSpeed(6, heldMs)).toBe(speed);
  },
);

test.each([
  { type: 'capsule', size: [0.2, 0.6, 0.2] },
  { type: 'diamond', base: 0.2, middle: 0.15, height: 0.6 },
])(
  'builds finite positive compound parts for $type',
  definition => {
    const collider = readCollider(definition, 'collider');
    const shape = colliderShape(collider);
    expect(shape.type).toBe('Compound');
    expect(shape.children!.length).toBeGreaterThanOrEqual(2);
    for (const part of shape.children!) {
      expect(part.params.every(n => Number.isFinite(n) && n > 0)).toBe(true);
      expect(part.position.every(Number.isFinite)).toBe(true);
    }
    for (const [axis, dimension] of colliderSize(collider).entries()) {
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

test('reduces a capsule with no straight section to a sphere', () => {
  expect(colliderShape({ type: 'capsule', size: [0.2, 0.2, 0.2] })).toEqual({
    type: 'Sphere',
    params: [0.1],
  });
});

test('centers capsule end caps at half the straight section length', () => {
  const shape = colliderShape({ type: 'capsule', size: [0.2, 0.6, 0.2] });
  const spheres = shape.children!.filter(part => part.type === 'Sphere');
  expect(spheres[0].position[1]).toBeCloseTo(-0.2);
  expect(spheres[spheres.length - 1].position[1]).toBeCloseTo(0.2);
  for (const sphere of spheres) {
    expect(sphere.params).toEqual([0.1]);
    expect(sphere.position[0]).toBe(0);
    expect(sphere.position[2]).toBe(0);
  }
  for (let i = 1; i < spheres.length; i++) {
    expect(spheres[i].position[1] - spheres[i - 1].position[1]).toBeLessThanOrEqual(
      0.2,
    );
  }
});

test('builds a diamond with flat square ends and one centered middle sphere', () => {
  const collider = readCollider({ type: 'diamond', base: 0.2, middle: 0.15, height: 0.6 }, 'collider');
  const expected = {
    type: 'Compound', params: [], children: [
      { type: 'Box', params: [0.2, 0.6, 0.2], position: [0, 0, 0] },
      { type: 'Sphere', params: [0.15], position: [0, 0, 0] },
    ],
  };
  expect(colliderShape(collider)).toEqual(expected);
  expect(colliderShape(collider, { targetBottom: true })).toEqual(expected);
  expect(colliderSize(collider)).toEqual([0.3, 0.6, 0.3]);
  expect(colliderSize(readCollider({ type: 'diamond', base: 0.4, middle: 0.15, height: 0.6 }, 'collider')))
    .toEqual([0.4, 0.6, 0.4]);
});

test('allows a middle sphere exactly tangent to the flat end planes, but not protruding beyond them', () => {
  expect(readCollider({ type: 'diamond', base: 0.2, middle: 0.3, height: 0.6 }, 'collider'))
    .toEqual({ type: 'diamond', base: 0.2, middle: 0.3, height: 0.6 });
  expect(() => readCollider({ type: 'diamond', base: 0.2, middle: 0.300001, height: 0.6 }, 'collider'))
    .toThrow('collider.middle');
});

test('uses diamond bounds for fallback physics shapes and radial scoring', () => {
  const collider = { type: 'diamond', base: 0.2, middle: 0.15, height: 0.6 };
  const parsed = readGame({
    ...game,
    objects: [{
      ...projectile,
      properties: { ...projectile.properties, collider },
    }, target],
  })!;
  expect(parsed.games[0].objects[0].properties.physics!.shape)
    .toEqual({ type: 'Box', params: [0.3, 0.6, 0.3] });
  expect(impactPoints(
    parsed.games[0].objects[0].properties.collider!,
    [0.15, 0, 0], [0, 0, 1],
    { position: [0, 0, 0], rotation: [0, 0, 0] }, 10,
  )).toBe(1);
});

test('caches aiming OBJ and GLB assets with existing preparation', async () => {
  const cache = jest.fn(async (url: string) => `local:${url}`);
  const result = await cacheExperience({ logic: { games: [game] } }, cache);
  expect(result!.games[0].assets.map(asset => asset.url)).toEqual(
    game.assets.map(asset => `local:${asset.url}`),
  );
  expect(cache).toHaveBeenCalledTimes(2);
  expect(result!.games[0].settings?.targets).toEqual([2]);
});
