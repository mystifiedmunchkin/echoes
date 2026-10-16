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
    objectId: string;
    speed: number;
    spawnDistance: number;
    lifetimeMs: number;
    maxActive: number;
  };
  targets: string[];
}

type Part = { type: 'Box' | 'Sphere'; params: number[]; position: number[] };
export type ColliderShape = {
  type: 'Box' | 'Sphere' | 'Compound';
  params: number[];
  children?: Part[];
};

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
  requireValue(
    objects.every(
      object =>
        object.id !== 'aiming-floor' && !object.id.startsWith('aiming-shot:'),
    ),
    `${path}: aiming-floor and aiming-shot: IDs are reserved`,
  );
  const objectId = projectile.objectId;
  requireValue(
    typeof objectId === 'string' &&
      objects.some(object => object.id === objectId),
    `${path}.projectile.objectId`,
  );
  const targets = source.targets;
  requireValue(
    Array.isArray(targets) &&
      targets.length > 0 &&
      targets.every(
        id =>
          typeof id === 'string' &&
          id !== objectId &&
          objects.some(object => object.id === id),
      ) &&
      new Set(targets).size === targets.length,
    `${path}.targets`,
  );
  for (const id of [objectId, ...targets]) {
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
      id !== objectId ||
        object.properties.physics?.type === undefined ||
        object.properties.physics.type === 'Dynamic',
      `${path}.projectile: physics must be Dynamic`,
    );
  }
  const stableMs = positive(plane.stableMs ?? 1000, `${path}.plane.stableMs`);
  const lifetimeMs = positive(
    projectile.lifetimeMs ?? 10000,
    `${path}.projectile.lifetimeMs`,
  );
  const maxActive = positive(
    projectile.maxActive ?? 12,
    `${path}.projectile.maxActive`,
  );
  requireValue(Number.isInteger(maxActive), `${path}.projectile.maxActive`);
  requireValue(
    stableMs <= 2147483647 && lifetimeMs <= 2147483647,
    `${path}: timer exceeds native limit`,
  );
  return {
    plane: {
      minWidth: positive(plane.minWidth, `${path}.plane.minWidth`),
      minLength: positive(plane.minLength, `${path}.plane.minLength`),
      stableMs,
    },
    projectile: {
      objectId,
      speed: positive(projectile.speed ?? 5, `${path}.projectile.speed`),
      spawnDistance: positive(
        projectile.spawnDistance ?? 0.3,
        `${path}.projectile.spawnDistance`,
      ),
      lifetimeMs,
      maxActive,
    },
    targets,
  };
}

export function colliderShape(collider: AimingCollider): ColliderShape {
  const [w, h, l] = collider.size;
  if (collider.type === 'bounding') return { type: 'Box', params: [w, h, l] };
  if (collider.type === 'sphere') return { type: 'Sphere', params: [w / 2] };
  const children: Part[] = [];
  const box = (params: number[], position: number[]) =>
    children.push({ type: 'Box', params, position });
  if (collider.type === 'basket') {
    const t = collider.thickness!;
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
