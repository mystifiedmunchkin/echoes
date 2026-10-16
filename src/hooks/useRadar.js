/**
 * Acquires one foreground GPS fix, fetches map memories, and caches referenced 3D assets.
 * It supplies map/radar data only; AR rendering uses local plane coordinates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Linking } from 'react-native';
import { Dirs, FileSystem } from 'react-native-file-access';
import { getAuthToken } from '../services/auth';
import * as Location from '../services/geolocation';
import { translate } from '../../constants/i18n';
import { MAP_RADIUS_METERS } from '../utils/memoryAccess';
import { cacheExperience } from '../experiences/experience';

const PRIVATE_FILES_BASE_URL = 'https://echoes.sophiehorner.art/api/private-files';

const formatCreatorName = (...candidates) => {
  for (const user of candidates) {
    if (!user) continue;

    const rawName = typeof user === 'string'
      ? user
      : user.name || user.username || user.handle || '';
    const normalizedName = String(rawName).trim().replace(/^@+/, '');

    if (normalizedName && !normalizedName.includes('@')) return `@${normalizedName}`;
  }

  return '';
};

const extractMediaUrl = (value, depth = 0) => {
  if (typeof value === 'string') {
    const candidate = value.trim();
    const isMediaReference = depth === 0
      || /^(https?:\/\/|file:\/\/|content:\/\/|\/|storage\/|uploads\/)/i.test(candidate)
      || /\.(jpe?g|png|webp|gif|mp4|mov|m4v|mp3|wav|glb)(\?|$)/i.test(candidate);
    return isMediaReference ? candidate : '';
  }
  if (Array.isArray(value)) return value.map((item) => extractMediaUrl(item, depth + 1)).find(Boolean) || '';
  if (!value || typeof value !== 'object' || depth > 5) return '';

  const urlFields = [
    'url', 'uri', 'path', 'file_url', 'original_url', 'media_url', 'src',
    'link', 'download_url', 'full_url', 'file', 'filename', 'file_name', 'value', 'data',
  ];
  return urlFields.map((field) => extractMediaUrl(value[field], depth + 1)).find(Boolean)
    || Object.values(value).map((item) => extractMediaUrl(item, depth + 1)).find(Boolean)
    || '';
};

const extractMediaUrls = (value, depth = 0) => {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractMediaUrls(item, depth + 1));
  }
  if (typeof value === 'string') {
    const url = extractMediaUrl(value, depth);
    return url ? [url] : [];
  }
  if (typeof value !== 'object') return [];

  return Object.values(value).flatMap((item) => extractMediaUrls(item, depth + 1));
};

const parseJsonValue = (value, fallback) => {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parseJsonCollection = (value, fallback) => {
  const parsed = parseJsonValue(value, fallback);
  return parsed == null ? fallback : parsed;
};

export const normalizeInteractiveGames = (value) => {
  const parsed = parseJsonCollection(value, []);
  const games = Array.isArray(parsed) ? parsed : parsed?.games;
  if (!Array.isArray(games)) return [];

  return games.map((game, gameIndex) => {
    const source = parseJsonCollection(game, {});
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return { index: gameIndex, value: source };
    }

    const objects = parseJsonCollection(source.objects, []);
    const normalizedObjects = Array.isArray(objects)
      ? objects.map((object, objectIndex) => {
        const normalizedObject = parseJsonCollection(object, {});
        if (!normalizedObject || typeof normalizedObject !== 'object' || Array.isArray(normalizedObject)) {
          return { index: objectIndex, value: normalizedObject };
        }
        const actions = parseJsonCollection(normalizedObject.actions, []);
        return {
          ...normalizedObject,
          index: objectIndex,
          properties: parseJsonCollection(normalizedObject.properties, {}),
          actions: Array.isArray(actions)
            ? actions.map((action) => parseJsonCollection(action, {}))
            : actions,
        };
      })
      : objects;

    return {
      ...source,
      index: gameIndex,
      type: source.type || source.game_type || null,
      assets: parseJsonCollection(source.assets, []),
      objects: normalizedObjects,
    };
  });
};

export const normalizeInteractive = (value) => {
  if (value == null) return null;
  const source = parseJsonCollection(value, {});
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;

  const logic = parseJsonCollection(source.logic, {});
  return {
    ...source,
    logic: {
      ...logic,
      games: normalizeInteractiveGames(logic.games),
    },
  };
};

const isVideoUrl = (value) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(value || '');
const isImageUrl = (value) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(value || '');
const isAudioUrl = (value) => /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(value || '');
const is3DReference = (value) => /\.(glb|gltf|usdz|obj|fbx)(\?|$)/i.test(value || '')
  || /\/model_3D\//i.test(value || '');
const isVideoReference = (value) => isVideoUrl(value) || /\/(?:videos?|video-files)\//i.test(value || '');
const isImageReference = (value) => isImageUrl(value) || /\/(?:images?|photos?|image-files)\//i.test(value || '');
const isAudioReference = (value) => isAudioUrl(value) || /\/(?:audios?|audio-files)\//i.test(value || '');
const isRemoteUrl = (value) => /^https?:\/\//i.test(value || '');
const resourceVersion = (url) => {
  let hash = 0;
  for (let index = 0; index < url.length; index += 1) {
    hash = (hash * 31 + url.charCodeAt(index)) % 4294967296;
  }
  return hash.toString(16);
};

const resolvePrivateFileUrl = (value, userId, mediaType) => {
  if (typeof value !== 'string' || !value.trim()) return '';

  const candidate = value.trim();
  let normalized = candidate.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const parsedUrl = new URL(candidate);
      if (parsedUrl.hostname !== 'echoes.sophiehorner.art') {
        return candidate;
      }
      if (parsedUrl.pathname.includes('/api/private-files/')) return candidate;
      if (parsedUrl.pathname.includes('/private-files/')) {
        return `${parsedUrl.origin}/api${parsedUrl.pathname}${parsedUrl.search}`;
      }
      normalized = parsedUrl.pathname.replace(/^\/+/, '');
    } catch {
      return candidate;
    }
  } else if (/^(file:\/\/|content:\/\/)/i.test(candidate)) {
    return candidate;
  }

  if (normalized.startsWith('private-files/')) {
    return `${PRIVATE_FILES_BASE_URL}/${normalized.slice('private-files/'.length)}`;
  }

  const fileName = normalized.split(/[\\/]/).pop();
  if (!userId || !fileName) return candidate;

  return `${PRIVATE_FILES_BASE_URL}/${encodeURIComponent(String(userId))}/${mediaType}/${encodeURIComponent(fileName)}`;
};

export function useRadar(initialRadius = MAP_RADIUS_METERS) {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [memories, setMemories] = useState([]);
  const [radius, setRadius] = useState(Math.min(initialRadius, MAP_RADIUS_METERS));
  const [isLoadingApi, setIsLoadingApi] = useState(false);
  const [apiError, setApiError] = useState(null);
  const startedRef = useRef(false);

  const cacheRemoteAsset = useCallback(async (remoteUrl, fileName, token) => {
    if (!isRemoteUrl(remoteUrl)) return remoteUrl;

    const cacheDirectory = `${Dirs.DocumentDir}/memory-assets`;
    if (!(await FileSystem.exists(cacheDirectory))) {
      await FileSystem.mkdir(cacheDirectory);
    }
    const localUri = `${cacheDirectory}/${fileName}`;
    if (await FileSystem.exists(localUri)) return `file://${localUri}`;

    try {
      const downloadResult = await FileSystem.fetch(remoteUrl, {
        path: localUri,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (downloadResult.status < 200 || downloadResult.status >= 300) {
        throw new Error(translate('fileDownloadFailed', { status: downloadResult.status }));
      }
    } catch (error) {
      if (await FileSystem.exists(localUri)) await FileSystem.unlink(localUri);
      throw error;
    }
    return `file://${localUri}`;
  }, []);

  const cacheMemoryAssets = useCallback(async (memory) => {
    const token = await getAuthToken();
    const cacheAsset = (url, type, index = 0) => {
      if (!url) return Promise.resolve('');
      const pathWithoutQuery = url.split('?')[0];
      const extension = pathWithoutQuery.includes('.')
        ? pathWithoutQuery.slice(pathWithoutQuery.lastIndexOf('.'))
        : '';
      return cacheRemoteAsset(
        url,
        `${memory.id}-${type}-${index}${extension}`,
        token,
      );
    };

    const sourceModelUrls = memory.model_urls?.length
      ? memory.model_urls
      : (memory.model_url ? [memory.model_url] : []);
    const [modelUrls, imageUrl, videoUrl, audioUrl, experience] = await Promise.all([
      Promise.all(sourceModelUrls.map((url, index) => cacheAsset(url, 'model', index))),
      cacheAsset(memory.image_url, 'image'),
      cacheAsset(memory.video_url, 'video'),
      cacheAsset(memory.audio_url, 'audio'),
      cacheExperience(memory, (url, kind, index) => {
        const mediaType = ['GLB', 'GLTF', 'OBJ'].includes(kind) ? 'model_3D' : kind;
        const userId = memory.user_id || memory.user?.id || memory.creator?.id || memory.created_by;
        return cacheAsset(
          resolvePrivateFileUrl(url, userId, mediaType),
          `experience-${kind}-${resourceVersion(url)}`,
          index,
        );
      }),
    ]);
    const cachedMemory = {
      ...memory,
      model_urls: modelUrls,
      model_url: modelUrls[0] || '',
      image_url: imageUrl,
      video_url: videoUrl,
      audio_url: audioUrl,
      ...(experience ? {
        interactive: {
          ...memory.interactive,
          logic: { ...(memory.interactive?.logic || memory.logic), ...experience },
        },
      } : {}),
    };

    setMemories((currentMemories) => currentMemories.map((currentMemory) => (
      String(currentMemory.id) === String(memory.id) ? cachedMemory : currentMemory
    )));
    return cachedMemory;
  }, [cacheRemoteAsset]);

  const fetchMemories = useCallback(async (lat, lng, currentRadius, throwOnError = false) => {
    setIsLoadingApi(true);
    setApiError(null);
    try {
      const token = await getAuthToken();
      const response = await fetch(
        `https://echoes.sophiehorner.art/api/memories-near-me?lat=${lat}&lng=${lng}&radius=${Math.min(currentRadius, MAP_RADIUS_METERS)}`,
        {
          headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!response.ok) throw new Error(translate('serverError', { status: response.status }));

      const rawData = await response.json();
      const dataArray = Array.isArray(rawData) ? rawData : (rawData.data || rawData.memories || []);

      const formattedMemories = dataArray.map((item, index) => {
        const latVal = Number(String(item.latitude ?? NaN).replace(',', '.'));
        const lngVal = Number(String(item.longitude ?? NaN).replace(',', '.'));

        // The server uses model_3D as the canonical 3D asset field.
        const mediaContents = parseJsonValue(item.media_contents, {});
        const interactive = normalizeInteractive(
          item.interactive ?? (item.logic ? { type: item.type, logic: item.logic } : null),
        );
        const rawContents = parseJsonValue(item.contents, []);
        const isContentObject = rawContents && typeof rawContents === 'object'
          && !Array.isArray(rawContents)
          && ['model_3D', 'image', 'image_url', 'audio', 'audio_url', 'video', 'video_url']
            .some((key) => Object.prototype.hasOwnProperty.call(rawContents, key));
        const mediaArray = Array.isArray(rawContents)
          ? rawContents
          : (isContentObject ? [rawContents] : Object.values(rawContents || {}));
        const mediaContentsArray = Array.isArray(mediaContents) ? mediaContents : [];
        const userId = item.user_id || item.user?.id || item.creator?.id || item.created_by;
        const normalizeContent = (content, contentIndex) => {
          const source = content && typeof content === 'object' ? content : {};
          const modelUrl = extractMediaUrl(
            source.model_3D
          );
          const imageUrl = extractMediaUrl(source.image || source.image_url);
          const audioUrl = extractMediaUrl(source.audio || source.audio_url);
          const videoUrl = extractMediaUrl(source.video || source.video_url);

          return {
            ...source,
            index: contentIndex,
            model_3D: modelUrl ? resolvePrivateFileUrl(modelUrl, userId, 'model_3D') : null,
            image: imageUrl ? resolvePrivateFileUrl(imageUrl, userId, 'image') : null,
            audio: audioUrl ? resolvePrivateFileUrl(audioUrl, userId, 'audio') : null,
            video: videoUrl ? resolvePrivateFileUrl(videoUrl, userId, 'video') : null,
          };
        };
        const contents = mediaArray.map(normalizeContent);
        const contentImageUrls = contents.map((content) => content.image).filter(Boolean);
        const contentAudioUrls = contents.map((content) => content.audio).filter(Boolean);
        const contentVideoUrls = contents.map((content) => content.video).filter(Boolean);
        const findMediaUrls = (keys, mediaType) => {
          const directMatches = keys.flatMap((key) => extractMediaUrls(mediaContents[key]));
          const contentMatches = [...mediaContentsArray, ...mediaArray].flatMap((content) => {
            const contentType = String(content?.type || content?.mime_type || '').toLowerCase();
            if (contentType.includes(mediaType)) return extractMediaUrls(content);
            return keys.flatMap((key) => extractMediaUrls(content?.[key]));
          });
          return [...directMatches, ...contentMatches].filter(Boolean);
        };
        const contentModelUrls = contents.map((content) => content.model_3D).filter(Boolean);
        const explicitModelUrls = extractMediaUrls(item.model_3D);
        const modelCandidates = [
          ...explicitModelUrls,
          ...contentModelUrls,
          ...findMediaUrls(['model_3D'], 'model'),
        ];
        const modelUrls = [...new Set(modelCandidates
          .map((value) => resolvePrivateFileUrl(value, userId, 'model_3D'))
          .filter(is3DReference))];
        const explicitModelUrl = modelUrls[0] || '';
        const inferredMediaType = String(
          item.media_type || item.mime_type || item.content_type || item.type || ''
        ).toLowerCase();
        const inferredVideo = inferredMediaType.includes('video') || isVideoReference(explicitModelUrl);
        const inferredImage = !inferredVideo && !isAudioReference(explicitModelUrl)
          && !is3DReference(explicitModelUrl);
        const imageUrl = extractMediaUrl(item.image_url)
          || extractMediaUrl(item.image)
          || contentImageUrls[0]
          || findMediaUrls(['image', 'images', 'image_url'], 'image')[0]
          || (isImageReference(explicitModelUrl) || inferredImage ? explicitModelUrl : '');
        const videoUrl = extractMediaUrl(item.video_url)
          || extractMediaUrl(item.video)
          || contentVideoUrls[0]
          || findMediaUrls(['video', 'videos', 'video_url'], 'video')[0]
          || (inferredVideo ? explicitModelUrl : '');
        const audioUrl = extractMediaUrl(item.audio_url)
          || extractMediaUrl(item.audio)
          || contentAudioUrls[0]
          || findMediaUrls(['audio', 'audios', 'audio_url'], 'audio')[0];
        const resolvedImageCandidate = resolvePrivateFileUrl(imageUrl, userId, 'image');
        const resolvedVideoCandidate = resolvePrivateFileUrl(videoUrl, userId, 'video');
        const resolvedAudioUrl = resolvePrivateFileUrl(audioUrl, userId, 'audio');
        const resolvedImageUrl = isVideoReference(resolvedImageCandidate) ? '' : resolvedImageCandidate;
        const resolvedVideoUrl = resolvedVideoCandidate || (isVideoReference(resolvedImageCandidate) ? resolvedImageCandidate : '');
        const audioUrls = [...new Set([
          audioUrl,
          ...contents.map((content) => content.audio).filter(Boolean),
        ].map((value) => resolvePrivateFileUrl(value, userId, 'audio')).filter(Boolean))];
        const videoUrls = [...new Set([
          videoUrl,
          ...contents.map((content) => content.video).filter(Boolean),
        ].map((value) => resolvePrivateFileUrl(value, userId, 'video')).filter(Boolean))];
        const effectiveModelUrls = modelUrls;
        const effectiveModelUrl = effectiveModelUrls[0] || '';

        return {
          ...item,
          id: item.id || index,
          name: item.name || translate('memoryDefault'),
          creatorName: formatCreatorName(
            item.user_name,
            item.user,
            item.creator,
            item.created_by,
            item.creator_name,
            item.username,
            item.name_user,
          ),
          lat: latVal,
          lng: lngVal,
          latitude: latVal,
          longitude: lngVal,
          interactive,
          interactive_json: JSON.stringify(interactive),
          contents,
          model_url: effectiveModelUrl,
          model_urls: effectiveModelUrls,
          image_url: resolvedImageUrl,
          video_url: resolvedVideoUrl,
          video_urls: videoUrls,
          audio_url: resolvedAudioUrl,
          audio_urls: audioUrls,
          allow_manual_placement: item.allow_manual_placement ?? true,
          is_collectible: item.is_collectible ?? true,
        };
      });

      const validMemories = formattedMemories.filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng));
      setMemories(validMemories);
      return validMemories;

    } catch (err) {
      setApiError(err.message || translate('networkUnavailable'));
      if (throwOnError) throw err;
    } finally {
      setIsLoadingApi(false);
    }
  }, []);

  const loadNearbyMemories = useCallback(async () => {
    const currentLoc = await Location.getCurrentPositionAsync({ timeout: 20000 });
    if (!currentLoc?.coords) throw new Error(translate('gpsLocationUnavailable'));
    const origin = currentLoc.coords;
    setLocation(origin);
    const nearby = await fetchMemories(origin.latitude, origin.longitude, MAP_RADIUS_METERS, true);
    return { location: origin, memories: nearby };
  }, [fetchMemories]);

  const requestGpsPermission = useCallback(async () => {
    // This async function may call setState.
    let permission;
    try {
      permission = await Location.requestForegroundPermissionsAsync();
    } catch (error) {
      console.warn('Location permission request failed:', error);
      setErrorMsg(error.message || translate('gpsPermissionRequired'));
      return false;
    }
    const { status, canAskAgain } = permission;

    const applyError = (msg) => setErrorMsg((prev) => (prev === msg ? prev : msg));

    if (status !== 'granted') {
      setPermissionStatus(status);
      applyError(!canAskAgain
        ? translate('gpsPermissionDisabled')
        : translate('gpsPermissionRequired'));
      return false;
    }

    setPermissionStatus('granted');
    let currentLoc;
    try {
      currentLoc = await Location.getCurrentPositionAsync({
        timeout: 20000,
      });
    } catch (error) {
      console.warn('Location fix failed:', error);
      setErrorMsg(error.message || translate('gpsLocationUnavailable'));
      return false;
    }

    if (currentLoc) {
      setLocation((prev) => (prev?.latitude === currentLoc.coords.latitude &&
        prev?.longitude === currentLoc.coords.longitude ? prev : currentLoc.coords));
      fetchMemories(currentLoc.coords.latitude, currentLoc.coords.longitude, radius);
      return true;
    }

    applyError(translate('gpsLocationUnavailable'));
    return false;
  }, [fetchMemories, radius]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // Keep setState out of the effect's synchronous body to satisfy react-hooks/set-state-in-effect.
    // Use a microtask only: the first render is a no-op, then the second render sets the idle state.
    const handle = () => {
      requestGpsPermission();
    };
    const timer = setTimeout(handle, 0);
    return () => {
      clearTimeout(timer);
      startedRef.current = false;
    };
  }, [requestGpsPermission]);

  const updateRadius = (newRadius) => {
    const limitedRadius = Math.min(newRadius, MAP_RADIUS_METERS);
    setRadius(limitedRadius);
    if (location) fetchMemories(location.latitude, location.longitude, limitedRadius);
  };

  const openSettings = () => Linking.openSettings();

  return {
    location,
    errorMsg,
    permissionStatus,
    memories,
    radius,
    isLoadingApi,
    apiError,
    updateRadius,
    cacheMemoryAssets,
    loadNearbyMemories,
    requestGpsPermission,
    openSettings,
    refreshData: () => location && fetchMemories(location.latitude, location.longitude, radius)
  };
}