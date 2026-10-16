import type { ExperienceObject, Vector3 } from './experience';

export type ColliderType =
  | 'capsule'
  | 'bounding'
  | 'diamond'
  | 'sphere'
  | 'basket';

export interface AimingCollider {
  type: ColliderType;
  size: Vector3;
  thickness?: number;
}

export interface AimingSettings {
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
  return speed * (1 + Math.min(2000, Math.max(0, heldMs)) / 2000);
}

export function basketThickness(collider: AimingCollider): number {
  return collider.type === 'basket'
    ? collider.thickness!
    : Math.min(0.05, ...collider.size.map(size => size / 4));
}

function inverseRotate(vector: Vector3, rotation: Vector3): Vector3 {
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
  const localPoint = inverseRotate(
    [
      point[0] - transform.position[0],
      point[1] - transform.position[1],
      point[2] - transform.position[2],
    ],
    transform.rotation,
  );
  const localNormal = inverseRotate(normal, transform.rotation);
  const [width, height, length] = collider.size;
  const thickness = basketThickness(collider);
  // Bullet contact points may penetrate slightly into the top face.
  const tolerance = Math.min(0.01, thickness / 4);
  return (
    Math.abs(localNormal[1]) > 0 &&
    Math.abs(localNormal[1]) >
      Math.max(Math.abs(localNormal[0]), Math.abs(localNormal[2])) &&
    Math.abs(localPoint[1] - (-height / 2 + thickness)) <= tolerance &&
    Math.abs(localPoint[0]) < width / 2 - thickness &&
    Math.abs(localPoint[2]) < length / 2 - thickness
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
  return {
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
  const [w, h, l] = collider.size;
  if (collider.type === 'bounding' && !options.targetBottom)
    return { type: 'Box', params: [w, h, l] };
  if (collider.type === 'sphere') return { type: 'Sphere', params: [w / 2] };
  const children: Part[] = [];
  const box = (params: number[], position: number[]) =>
    children.push({ type: 'Box', params, position });
  if (collider.type === 'bounding' || collider.type === 'basket') {
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
  } else {
    // A stepped octahedron: each horizontal layer approximates a diamond cross-section.
    const layers = 8;
    const strips = 5;
    for (let y = 0; y < layers; y++) {
      const vertical =
        (1 - Math.abs(((y + 0.5) / layers) * 2 - 1)) / (1 - 1 / layers);
      for (let z = 0; z < strips; z++) {
        const depth = 1 - Math.abs(((z + 0.5) / strips) * 2 - 1);
        box(
          [w * vertical * depth, h / layers, (l * vertical) / strips],
          [
            0,
            -h / 2 + ((y + 0.5) * h) / layers,
            l * vertical * ((z + 0.5) / strips - 0.5),
          ],
        );
      }
    }
  }
  return { type: 'Compound', params: [], children };
}
