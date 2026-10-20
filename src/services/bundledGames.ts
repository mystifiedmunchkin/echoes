import { Image } from 'react-native';
import entries from '../../assets/demos';
import { readExperience } from '../experiences/experience';
import type { Experience } from '../experiences/experience';

export interface BundledGameEntry {
  definition: unknown;
  assets: Partial<Record<string, number>>;
  localId?: number;
}

export interface BundledGame {
  id: number;
  location_id: number;
  name: string;
  description: string;
  creatorName: string;
  lat: 0;
  lng: 0;
  isBundled: true;
  localOnly: boolean;
  is_collectible: false;
  interactive: { logic: Experience };
}

function objectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path}: JSON object required`);
  }
  return value as Record<string, unknown>;
}

export function loadBundledGames(
  catalog: readonly BundledGameEntry[] = entries,
): BundledGame[] {
  const keys = new Set<string>();
  const gameKeys = new Set<string>();
  return catalog.map(({ definition, assets, localId }, index) => {
    const path = `Bundled game ${index}`;
    const source = objectRecord(definition, path);
    const localOnly = localId !== undefined;
    if (localOnly && (!Number.isSafeInteger(localId) || localId <= 0)) {
      throw new Error(`${path}.localId: positive stable local identifier required`);
    }
    if (!localOnly) {
      for (const field of ['id', 'location_id'] as const) {
        if (typeof source[field] !== 'number' || !Number.isSafeInteger(source[field]) || source[field] <= 0) {
          throw new Error(`${path}.${field}: positive server identifier required`);
        }
      }
    }
    let playableDefinition: unknown = source;
    if (localOnly) {
      const interactive = objectRecord(source.interactive ?? source, `${path}.interactive`);
      const logic = objectRecord(interactive.logic, `${path}.logic`);
      if (!Array.isArray(logic.games)) throw new Error(`${path}.logic.games: array required`);
      playableDefinition = {
        ...source,
        interactive: {
          ...interactive,
          logic: {
            ...logic,
            games: logic.games.map((game, gameIndex) => {
              const raw = objectRecord(game, `${path}.logic.games[${gameIndex}]`);
              return { ...raw, id: raw.id ?? gameIndex };
            }),
          },
        },
      };
    }
    if (typeof source.name !== 'string' || !source.name.trim()) {
      throw new Error(`${path}.name: name required`);
    }
    if ((source.lat != null && source.lat !== 0) || (source.lng != null && source.lng !== 0)) {
      throw new Error(`${path}: demo coordinates must remain 0,0`);
    }
    const experience = readExperience(playableDefinition);
    if (!experience) throw new Error(`${path}: complete game definition required`);
    const id = localOnly ? experience.games[0].id : source.id as number;
    const locationId = localId !== undefined ? -localId : source.location_id as number;
    const key = localOnly ? String(locationId) : `${locationId}:${id}`;
    if (keys.has(key)) throw new Error(`${path}: duplicate entry ${key}`);
    keys.add(key);
    if (!experience.games.some(game => game.id === id)) {
      throw new Error(`${path}.id: must identify a game in logic.games`);
    }
    const resolve = (url: string): string => {
      const keyName = url.startsWith('bundle:') ? url.slice('bundle:'.length) : '';
      const moduleId = Object.prototype.hasOwnProperty.call(assets, keyName) && assets[keyName];
      if (typeof moduleId !== 'number') {
        throw new Error(`${path}: unregistered bundled asset ${url}`);
      }
      const resolved = Image.resolveAssetSource(moduleId);
      if (!resolved?.uri) throw new Error(`${path}: cannot resolve bundled asset ${url}`);
      return resolved.uri;
    };
    return {
      id, location_id: locationId,
      name: source.name,
      description: typeof source.description === 'string' ? source.description : '',
      creatorName: typeof source.creatorName === 'string' ? source.creatorName : '',
      lat: 0, lng: 0, isBundled: true, localOnly, is_collectible: false,
      interactive: {
        logic: {
          ...experience,
          games: experience.games.map(game => {
            const gameKey = `${locationId}:${game.id}`;
            if (gameKeys.has(gameKey)) throw new Error(`${path}: duplicate game ${gameKey}`);
            gameKeys.add(gameKey);
            return {
              ...game,
              assets: game.assets.map(asset => {
                if (asset.type === 'GLTF' || asset.type === 'OBJ') {
                  throw new Error(`${path}: use self-contained GLB models for bundled games`);
                }
                return { ...asset, url: resolve(asset.url) };
              }),
              target: game.target
                ? { ...game.target, imageUrl: resolve(game.target.imageUrl) }
                : undefined,
            };
          }),
        },
      },
    };
  });
}
