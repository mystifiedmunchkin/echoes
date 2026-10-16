import { readAiming, readCollider } from './aiming';
import type { AimingCollider, AimingSettings } from './aiming';

export type ExperienceType = 'aiming' | 'treasure' | 'discovery' | 'images';
export type Vector3 = [number, number, number];
export type AssetType = 'GLB' | 'GLTF' | 'OBJ' | 'image' | 'video' | 'audio';

export interface ExperienceAsset {
  id: string;
  type: AssetType;
  url: string;
}

export interface PhysicsBody {
  type: 'Dynamic' | 'Static' | 'Kinematic';
  mass?: number;
  restitution?: number;
  friction?: number;
  useGravity?: boolean;
  velocity?: Vector3;
  shape: { type: 'Box' | 'Sphere'; params: number[] };
}

export interface ExperienceObject {
  id: string;
  properties: {
    asset?: string;
    text?: string;
    active?: boolean;
    position?: Vector3;
    rotation?: Vector3;
    scale?: Vector3;
    physics?: PhysicsBody;
    collider?: AimingCollider;
    animation?: { rotateY: number; duration: number; loop?: boolean };
    [key: string]: unknown;
  };
  actions?: unknown;
}

export interface ImageTarget {
  id: string;
  imageUrl: string;
  physicalWidth: number;
  orientation: 'Up' | 'Down' | 'Left' | 'Right';
}

export interface ExperienceGame {
  id: string;
  type: ExperienceType;
  assets: ExperienceAsset[];
  objects: ExperienceObject[];
  target?: ImageTarget;
  aiming?: AimingSettings;
  [key: string]: unknown;
}

export interface Experience {
  games: ExperienceGame[];
  gravity: Vector3;
}

export interface ExperienceEvent {
  type: ExperienceType;
  gameId: string;
  objectId?: string;
  name:
    | 'press'
    | 'collision'
    | 'targetFound'
    | 'targetUpdated'
    | 'targetRemoved'
    | 'planeReady'
    | 'shot'
    | 'shotBlocked';
  data?: unknown;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function requireValue(condition: unknown, path: string): asserts condition {
  if (!condition) throw new Error(`Invalid experience: ${path}`);
}

function vector(value: unknown, path: string): Vector3 {
  requireValue(
    Array.isArray(value) &&
      value.length === 3 &&
      value.every(part => typeof part === 'number' && Number.isFinite(part)),
    path,
  );
  return [value[0], value[1], value[2]];
}

function nonEmptyString(value: unknown, path: string): string {
  requireValue(typeof value === 'string' && value.trim().length > 0, path);
  return value;
}

function unique(ids: string[], path: string) {
  requireValue(new Set(ids).size === ids.length, `${path}: duplicate id`);
}

function physicsBody(
  value: unknown,
  path: string,
  collider?: AimingCollider,
): PhysicsBody {
  const source = record(value);
  const { type } = source;
  requireValue(
    type === 'Dynamic' || type === 'Static' || type === 'Kinematic',
    `${path}.type`,
  );
  const shape = record(
    source.shape ??
      (collider ? { type: 'Box', params: collider.size } : undefined),
  );
  requireValue(
    shape.type === 'Box' || shape.type === 'Sphere',
    `${path}.shape.type`,
  );
  const params = shape.params;
  requireValue(
    Array.isArray(params) &&
      params.length === (shape.type === 'Box' ? 3 : 1) &&
      params.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0),
    `${path}.shape.params`,
  );
  const result: PhysicsBody = { type, shape: { type: shape.type, params } };
  for (const key of ['mass', 'restitution', 'friction'] as const) {
    const n = source[key];
    if (n === undefined) continue;
    requireValue(
      typeof n === 'number' &&
        Number.isFinite(n) &&
        n >= 0 &&
        (key === 'mass' ? type !== 'Dynamic' || n > 0 : n <= 1),
      `${path}.${key}`,
    );
    result[key] = n;
  }
  if (source.useGravity !== undefined) {
    requireValue(typeof source.useGravity === 'boolean', `${path}.useGravity`);
    result.useGravity = source.useGravity;
  }
  if (source.velocity !== undefined)
    result.velocity = vector(source.velocity, `${path}.velocity`);
  return result;
}

export function hasExperience(memory: unknown): boolean {
  const source = record(memory);
  const definition =
    source.interactive == null ? source : record(source.interactive);
  const games = record(definition.logic).games;
  return Array.isArray(games) && games.length > 0;
}

export function readExperience(memory: unknown): Experience | null {
  const source = record(memory);
  const definition =
    source.interactive == null ? source : record(source.interactive);
  if (definition.logic == null) return null;
  const logic = record(definition.logic);
  requireValue(Array.isArray(logic.games), 'logic.games must be an array');
  if (!logic.games.length) return null;
  const games = logic.games.map((raw, index): ExperienceGame => {
    const game = record(raw);
    const path = `logic.games[${index}]`;
    const type = game.type ?? definition.type ?? source.type;
    requireValue(
      type === 'aiming' ||
        type === 'treasure' ||
        type === 'discovery' ||
        type === 'images',
      `${path}.type (aiming, treasure, discovery, images)`,
    );
    requireValue(Array.isArray(game.assets), `${path}.assets`);
    const assets = game.assets.map((rawAsset, assetIndex): ExperienceAsset => {
      const asset = record(rawAsset);
      const assetPath = `${path}.assets[${assetIndex}]`;
      const assetType = asset.type;
      requireValue(
        assetType === 'GLB' ||
          assetType === 'GLTF' ||
          assetType === 'OBJ' ||
          assetType === 'image' ||
          assetType === 'video' ||
          assetType === 'audio',
        `${assetPath}.type`,
      );
      return {
        id: nonEmptyString(asset.id, `${assetPath}.id`),
        type: assetType,
        url: nonEmptyString(asset.url, `${assetPath}.url`),
      };
    });
    unique(
      assets.map(asset => asset.id),
      `${path}.assets`,
    );
    requireValue(Array.isArray(game.objects), `${path}.objects`);
    const objects = game.objects.map(
      (rawObject, objectIndex): ExperienceObject => {
        const object = record(rawObject);
        const objectPath = `${path}.objects[${objectIndex}]`;
        const properties = { ...record(object.properties) };
        if (properties.asset !== undefined) {
          requireValue(
            typeof properties.asset === 'string' &&
              assets.some(asset => asset.id === properties.asset),
            `${objectPath}.properties.asset`,
          );
        }
        if (properties.text !== undefined) {
          requireValue(
            typeof properties.text === 'string',
            `${objectPath}.properties.text`,
          );
        }
        requireValue(
          properties.asset !== undefined || properties.text !== undefined,
          `${objectPath}: asset or text required`,
        );
        if (properties.active !== undefined) {
          requireValue(
            typeof properties.active === 'boolean',
            `${objectPath}.properties.active`,
          );
        }
        const parsed: ExperienceObject['properties'] = {
          ...properties,
          asset: properties.asset,
          text: properties.text,
          active: properties.active,
        };
        for (const key of ['position', 'rotation', 'scale'] as const) {
          if (properties[key] !== undefined)
            parsed[key] = vector(properties[key], `${objectPath}.${key}`);
        }
        if (parsed.scale)
          requireValue(
            parsed.scale.every(n => n > 0),
            `${objectPath}.scale`,
          );
        if (type === 'aiming' && properties.collider !== undefined)
          parsed.collider = readCollider(
            properties.collider,
            `${objectPath}.collider`,
          );
        if (properties.physics !== undefined)
          parsed.physics = physicsBody(
            properties.physics,
            `${objectPath}.physics`,
            parsed.collider,
          );
        if (properties.animation !== undefined) {
          const animation = record(properties.animation);
          requireValue(
            typeof animation.rotateY === 'number' &&
              Number.isFinite(animation.rotateY) &&
              typeof animation.duration === 'number' &&
              Number.isFinite(animation.duration) &&
              animation.duration > 0 &&
              (animation.loop === undefined ||
                typeof animation.loop === 'boolean'),
            `${objectPath}.animation`,
          );
          parsed.animation = {
            rotateY: animation.rotateY,
            duration: animation.duration,
            loop: animation.loop,
          };
        }
        return {
          ...object,
          id: nonEmptyString(object.id, `${objectPath}.id`),
          properties: parsed,
        };
      },
    );
    unique(
      objects.map(object => object.id),
      `${path}.objects`,
    );
    const result: ExperienceGame = {
      ...game,
      id:
        game.id === undefined
          ? String(index)
          : nonEmptyString(game.id, `${path}.id`),
      type,
      assets,
      objects,
      target: undefined,
      aiming: undefined,
    };
    if (type === 'aiming' && game.aiming !== undefined) {
      result.aiming = readAiming(game.aiming, objects, `${path}.aiming`);
      for (const id of [
        result.aiming.projectile.objectId,
        ...result.aiming.targets,
      ]) {
        const object = objects.find(item => item.id === id)!;
        const asset = assets.find(item => item.id === object.properties.asset);
        requireValue(
          id === result.aiming.projectile.objectId
            ? asset?.type === 'GLB' || asset?.type === 'OBJ'
            : asset?.type === 'OBJ',
          `${path}.aiming: ${id} requires ${
            id === result.aiming.projectile.objectId ? 'GLB or OBJ' : 'OBJ'
          }`,
        );
      }
    }
    if (type === 'images') {
      const target = record(game.target);
      const orientation = target.orientation ?? 'Up';
      requireValue(
        orientation === 'Up' ||
          orientation === 'Down' ||
          orientation === 'Left' ||
          orientation === 'Right',
        `${path}.target.orientation`,
      );
      requireValue(
        typeof target.physicalWidth === 'number' &&
          Number.isFinite(target.physicalWidth) &&
          target.physicalWidth > 0,
        `${path}.target.physicalWidth`,
      );
      result.target = {
        id: nonEmptyString(target.id, `${path}.target.id`),
        imageUrl: nonEmptyString(target.imageUrl, `${path}.target.imageUrl`),
        physicalWidth: target.physicalWidth,
        orientation,
      };
    }
    return result;
  });
  unique(
    games.map(game => game.id),
    'logic.games',
  );
  return {
    games,
    gravity:
      logic.gravity === undefined
        ? [0, -9.81, 0]
        : vector(logic.gravity, 'logic.gravity'),
  };
}

export async function cacheExperience(
  memory: unknown,
  cache: (url: string, kind: string, index: number) => Promise<string>,
): Promise<Experience | null> {
  const experience = readExperience(memory);
  if (!experience) return null;
  let resourceIndex = 0;
  const games = await Promise.all(
    experience.games.map(async game => ({
      ...game,
      assets: await Promise.all(
        game.assets.map(async asset => ({
          ...asset,
          url: await cache(asset.url, asset.type, resourceIndex++),
        })),
      ),
      target: game.target
        ? {
            ...game.target,
            imageUrl: await cache(
              game.target.imageUrl,
              'image',
              resourceIndex++,
            ),
          }
        : undefined,
    })),
  );
  return { ...experience, games };
}
