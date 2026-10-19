/** Pure aiming rules: collider validation, compound shapes, launch speed, and impact scoring. */
import type { ExperienceObject, Vector3 } from './experience';

export type AimingSubtype = 'basket' | 'dartboard' | 'bowling';

export type ColliderType =
  | 'capsule'
  | 'bounding'
  | 'diamond'
  | 'sphere'
  | 'basket';

export type AimingCollider =
  | {
      type: 'diamond';
      base: number;
      middle: number;
      height: number;
      thickness?: never;
    }
  | {
      type: Exclude<ColliderType, 'diamond'>;
      size: Vector3;
      thickness?: number;
    };

export function colliderSize(collider: AimingCollider): Vector3 {
  if (collider.type !== 'diamond') return collider.size;
  const width = Math.max(collider.base, collider.middle * 2);
  return [width, collider.height, width];
}

export interface AimingSettings {
  reward?: number;
  freeze?: boolean;
  multiplier?: number;
  fall?: boolean;
  plane: { minWidth: number; minLength: number; stableMs: number };
  projectile: {
    objectId: number;
    speed: number;
    spawnDistance: number;
    lifetimeMs: number | null;
    maxActive: number;
  };
  targets: number[];
}

type Part = { type: 'Box' | 'Sphere'; params: number[]; position: number[] };
export type ColliderShape = {
  type: 'Box' | 'Sphere' | 'Compound';
  params: number[];
  children?: Part[];
};
export interface ColliderShapeOptions {
  targetBottom?: boolean;
}

export interface BodyTransform {
  position: Vector3;
  rotation: Vector3;
}

export function distanceAdjustedPoints(
  distanceMeters: number,
  points: number,
  referenceDistanceMeters = 1,
  minimumScore = 1,
): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters >= referenceDistanceMeters) {
    return points;
  }
  return Math.max(
    minimumScore,
    Math.round(points * Math.max(0, distanceMeters) / referenceDistanceMeters),
  );
}

export const bowlingPoints = distanceAdjustedPoints;

export function hasImpactRules(settings: AimingSettings): boolean {
  return ['reward', 'freeze', 'multiplier', 'fall'].some(
    key => settings[key as keyof AimingSettings] !== undefined,
  );
}

function rotate(vector: Vector3, rotation: Vector3): Vector3 {
  let [x, y, z] = vector;
  const [rx, ry, rz] = rotation.map(angle => (angle * Math.PI) / 180);
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  return [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz), z];
}

export function hasFallen(
  rotation: Vector3,
  initialRotation: Vector3,
  parentRotation: Vector3,
): boolean {
  const initialUp = rotate(rotate([0, 1, 0], initialRotation), parentRotation);
  const up = rotate([0, 1, 0], rotation);
  // Compare world-space up vectors: a tilt of at least 60 degrees counts as a fall.
  return up.reduce((dot, value, i) => dot + value * initialUp[i], 0) <= 0.5 + 1e-10;
}

export function impactPoints(
  collider: AimingCollider,
  point: Vector3,
  normal: Vector3,
  transform: BodyTransform,
  multiplier: number,
): number {
  const local = inverseRotate(
    [point[0] - transform.position[0], point[1] - transform.position[1], point[2] - transform.position[2]],
    transform.rotation,
  );
  const localNormal = inverseRotate(normal, transform.rotation);
  // Project onto the struck face: depth must not penalize a centered hit.
  const axis = localNormal.reduce(
    (best, value, i) => Math.abs(value) > Math.abs(localNormal[best]) ? i : best,
    0,
  );
  const size = colliderSize(collider);
  const radius = Math.min(1, Math.hypot(
    ...local.map((value, i) => i === axis ? 0 : value / (size[i] / 2)),
  ));
  return 1 + Math.round((multiplier - 1) * (1 - radius));
}

export function isBodyTransform(value: unknown): value is BodyTransform {
  const source = record(value);
  return [source.position, source.rotation].every(
    vector =>
      Array.isArray(vector) &&
      vector.length === 3 &&
      vector.every(Number.isFinite),
  );
}

export function launchSpeed(speed: number, heldMs: number): number {
  // Charging increases speed linearly up to twice the base speed after two seconds.
  return speed * (1 + Math.min(2000, Math.max(0, heldMs)) / 2000);
}

export function basketThickness(collider: AimingCollider): number {
  return collider.type === 'basket'
    ? collider.thickness!
    : Math.min(0.05, ...colliderSize(collider).map(size => size / 4));
}

function inverseRotate(vector: Vector3, rotation: Vector3): Vector3 {
  // Undo the forward Euler rotations in reverse order to recover local coordinates.
  let [x, y, z] = vector;
  const [rx, ry, rz] = rotation.map(angle => (-angle * Math.PI) / 180);
  [x, y] = [
    x * Math.cos(rz) - y * Math.sin(rz),
    x * Math.sin(rz) + y * Math.cos(rz),
  ];
  [x, z] = [
    x * Math.cos(ry) + z * Math.sin(ry),
    -x * Math.sin(ry) + z * Math.cos(ry),
  ];
  [y, z] = [
    y * Math.cos(rx) - z * Math.sin(rx),
    y * Math.sin(rx) + z * Math.cos(rx),
  ];
  return [x, y, z];
}

export function isBottomContact(
  collider: AimingCollider,
  point: Vector3,
  normal: Vector3,
  transform: BodyTransform,
): boolean {
  if (
    ![...point, ...normal, ...transform.position, ...transform.rotation].every(
      Number.isFinite,
    )
  )
    return false;
  const localNormal = inverseRotate(normal, transform.rotation);
  const [width, height, length] = colliderSize(collider);
  const thickness = basketThickness(collider);
  // Bullet contact points may penetrate slightly into the top face.
  const tolerance = Math.min(0.01, thickness / 4);
  const bottomY = -height / 2 + thickness;
  const isBottomPoint = (localPoint: Vector3) =>
    Math.abs(localPoint[1] - bottomY) <= tolerance &&
    Math.abs(localPoint[0]) < width / 2 - thickness &&
    Math.abs(localPoint[2]) < length / 2 - thickness;
  // Only the interior top face of the bottom scores, not the walls, rim, or underside.
  return (
    Math.abs(localNormal[1]) > 0 &&
    Math.abs(localNormal[1]) >
      Math.max(Math.abs(localNormal[0]), Math.abs(localNormal[2])) &&
    (
      isBottomPoint(inverseRotate([
        point[0] - transform.position[0],
        point[1] - transform.position[1],
        point[2] - transform.position[2],
      ], transform.rotation)) ||
      isBottomPoint(inverseRotate(point, transform.rotation))
    )
  );
}

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Invalid experience: ${path}`);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positive(value: unknown, path: string): number {
  requireValue(
    typeof value === 'number' && Number.isFinite(value) && value > 0,
    path,
  );
  return value;
}

export function readCollider(value: unknown, path: string): AimingCollider {
  const source = record(value);
  const type = source.type;
  requireValue(
    type === 'capsule' ||
      type === 'bounding' ||
      type === 'diamond' ||
      type === 'sphere' ||
      type === 'basket',
    `${path}.type`,
  );
  if (type === 'diamond') {
    const base = positive(source.base, `${path}.base`);
    const middle = positive(source.middle, `${path}.middle`);
    const height = positive(source.height, `${path}.height`);
    requireValue(middle <= height / 2, `${path}.middle: sphere must fit within height`);
    requireValue(source.size === undefined, `${path}.size: use base, middle and height for diamond`);
    requireValue(source.thickness === undefined, `${path}.thickness: only supported for basket`);
    return { type, base, middle, height };
  }
  for (const key of ['base', 'middle', 'height'] as const)
    requireValue(source[key] === undefined, `${path}.${key}: only supported for diamond`);
  const size = source.size;
  requireValue(Array.isArray(size) && size.length === 3, `${path}.size`);
  const dimensions: Vector3 = [
    positive(size[0], `${path}.size[0]`),
    positive(size[1], `${path}.size[1]`),
    positive(size[2], `${path}.size[2]`),
  ];
  const [width, height, length] = dimensions;
  if (type === 'sphere')
    requireValue(
      width === height && width === length,
      `${path}.size: sphere needs equal dimensions`,
    );
  if (type === 'capsule')
    requireValue(
      width === length && height >= width,
      `${path}.size: capsule needs x=z and y>=x`,
    );
  if (type === 'basket') {
    const thickness = positive(source.thickness, `${path}.thickness`);
    requireValue(
      thickness * 2 < Math.min(width, length) && thickness < height,
      `${path}.thickness: basket must remain open`,
    );
    return { type, size: dimensions, thickness };
  }
  requireValue(
    source.thickness === undefined,
    `${path}.thickness: only supported for basket`,
  );
  return { type, size: dimensions };
}

export function readAiming(
  value: unknown,
  objects: ExperienceObject[],
  path: string,
  subtype?: AimingSubtype,
): AimingSettings {
  const source = record(value);
  const plane = record(source.plane);
  const projectile = record(source.projectile);
  const objectId = projectile.objectId;
  requireValue(
    Number.isSafeInteger(objectId) &&
      objects.some(object => object.id === objectId),
    `${path}.projectile.objectId`,
  );
  const projectileId = objectId as number;
  const targets = source.targets;
  requireValue(
    Array.isArray(targets) &&
      targets.length > 0 &&
      targets.every(
        id =>
          Number.isSafeInteger(id) &&
          id !== objectId &&
          objects.some(object => object.id === id),
      ) &&
      new Set(targets).size === targets.length,
    `${path}.targets`,
  );
  const targetIds = targets as number[];
  for (const id of [projectileId, ...targetIds]) {
    const object = objects.find(item => item.id === id)!;
    requireValue(
      object.properties.collider !== undefined,
      `${path}: ${id} requires a collider`,
    );
    requireValue(
      object.properties.active !== false,
      `${path}: ${id} must be active`,
    );
    requireValue(
      object.properties.animation === undefined,
      `${path}: ${id} cannot use a rotation animation with its collider`,
    );
    requireValue(
      id !== projectileId ||
        object.properties.physics?.type === undefined ||
        object.properties.physics.type === 'Dynamic',
      `${path}.projectile: physics must be Dynamic`,
    );
  }
  const stableMs = positive(plane.stableMs ?? 1000, `${path}.plane.stableMs`);
  const lifetimeMs =
    projectile.lifetimeMs === undefined || projectile.lifetimeMs === null
      ? null
      : positive(projectile.lifetimeMs, `${path}.projectile.lifetimeMs`);
  const maxActive = positive(
    projectile.maxActive ?? 12,
    `${path}.projectile.maxActive`,
  );
  requireValue(Number.isInteger(maxActive), `${path}.projectile.maxActive`);
  requireValue(
    stableMs <= 2147483647 && (lifetimeMs === null || lifetimeMs <= 2147483647),
    `${path}: timer exceeds native limit`,
  );
  const rules: Pick<AimingSettings, 'reward' | 'freeze' | 'multiplier' | 'fall'> = {};
  for (const key of ['freeze', 'fall'] as const) {
    if (source[key] === undefined) continue;
    requireValue(typeof source[key] === 'boolean', `${path}.${key}`);
    rules[key] = source[key];
  }
  if (subtype) {
    const required = { freeze: subtype === 'dartboard', fall: subtype === 'bowling' };
    for (const key of ['freeze', 'fall'] as const) {
      requireValue(
        rules[key] === undefined || rules[key] === required[key],
        `${path}.${key}: conflicts with subtype ${subtype}`,
      );
      rules[key] = required[key];
    }
    for (const id of targetIds) {
      const collider = objects.find(object => object.id === id)!.properties.collider!;
      requireValue(
        subtype === 'basket'
          ? collider.type === 'basket' || collider.type === 'bounding'
          : collider.type !== 'basket',
        `${path}.targets: ${id} collider incompatible with subtype ${subtype}`,
      );
    }
  }
  if (source.reward !== undefined) {
    requireValue(
      typeof source.reward === 'number' && Number.isSafeInteger(source.reward) && source.reward >= 0,
      `${path}.reward`,
    );
    rules.reward = source.reward;
  }
  if (source.multiplier !== undefined) {
    requireValue(
      typeof source.multiplier === 'number' && Number.isSafeInteger(source.multiplier) && source.multiplier > 0,
      `${path}.multiplier`,
    );
    rules.multiplier = source.multiplier;
  }
  if (subtype === 'dartboard' && rules.multiplier === undefined)
    rules.multiplier = 10;
  if (rules.fall) {
    requireValue(targetIds.every(id =>
      objects.find(object => object.id === id)!.properties.physics?.type === 'Dynamic',
    ), `${path}.fall: targets must be Dynamic`);
  }
  return {
    ...rules,
    plane: {
      minWidth: positive(plane.minWidth, `${path}.plane.minWidth`),
      minLength: positive(plane.minLength, `${path}.plane.minLength`),
      stableMs,
    },
    projectile: {
      objectId: projectileId,
      speed: positive(projectile.speed ?? 5, `${path}.projectile.speed`),
      spawnDistance: positive(
        projectile.spawnDistance ?? 0.3,
        `${path}.projectile.spawnDistance`,
      ),
      lifetimeMs,
      maxActive,
    },
    targets: targetIds,
  };
}

export function colliderShape(
  collider: AimingCollider,
  options: ColliderShapeOptions = {},
): ColliderShape {
  const [w, h, l] = colliderSize(collider);
  if (collider.type === 'bounding' && !options.targetBottom)
    return { type: 'Box', params: [w, h, l] };
  if (collider.type === 'sphere') return { type: 'Sphere', params: [w / 2] };
  const children: Part[] = [];
  const box = (params: number[], position: number[]) =>
    children.push({ type: 'Box', params, position });
  if (collider.type === 'bounding' || collider.type === 'basket') {
    // Five boxes form an open container; no hidden top face may block incoming shots.
    const t = basketThickness(collider);
    box([w, t, l], [0, -(h - t) / 2, 0]);
    box([t, h - t, l], [-(w - t) / 2, t / 2, 0]);
    box([t, h - t, l], [(w - t) / 2, t / 2, 0]);
    box([w - 2 * t, h - t, t], [0, t / 2, -(l - t) / 2]);
    box([w - 2 * t, h - t, t], [0, t / 2, (l - t) / 2]);
  } else if (collider.type === 'capsule') {
    if (h === w) return { type: 'Sphere', params: [w / 2] };
    // Overlapping spheres approximate a rounded capsule without a native capsule shape.
    const span = h - w;
    const steps = Math.max(1, Math.min(16, Math.ceil(span / (w / 4))));
    for (let i = 0; i <= steps; i++)
      children.push({
        type: 'Sphere',
        params: [w / 2],
        position: [0, -span / 2 + (span * i) / steps, 0],
      });
    box([w / Math.SQRT2, span, w / Math.SQRT2], [0, 0, 0]);
  } else if (collider.type === 'diamond') {
    box([collider.base, collider.height, collider.base], [0, 0, 0]);
    children.push({
      type: 'Sphere',
      params: [collider.middle],
      position: [0, 0, 0],
    });
  }
  return { type: 'Compound', params: [], children };
}
