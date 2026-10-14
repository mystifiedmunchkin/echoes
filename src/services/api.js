/** HTTP client for creating memories using the server's JSON and multipart contracts. */
import { getAuthToken } from './auth';
import { translate } from '../../constants/i18n';

const API_URL = 'https://echoes.sophiehorner.art/api';

const MEDIA_TYPES = [
  ['model', 'models_3d', 'glb'],
  ['image', 'images', 'jpg'],
  ['audio', 'audios', 'mp3'],
  ['video', 'videos', 'mp4'],
];

const getMediaField = (type) => {
  const mediaType = MEDIA_TYPES.find(([assetType]) => assetType === type);
  return mediaType ? mediaType[1] : null;
};

const createContents = (memoryData) => {
  if (Array.isArray(memoryData.contents)) return memoryData.contents;

  const mediaContents = memoryData.mediaContents;
  if (!mediaContents || typeof mediaContents !== 'object') return [];

  const mediaFields = [
    ['models_3d', 'model_3D'],
    ['images', 'image'],
    ['audios', 'audio'],
    ['videos', 'video'],
  ];
  const length = Math.max(...mediaFields.map(([key]) => (
    Array.isArray(mediaContents[key]) ? mediaContents[key].length : 0
  )), 0);

  return Array.from({ length }, (_, index) => mediaFields.reduce((content, [sourceKey, targetKey]) => {
    const value = mediaContents[sourceKey]?.[index];
    if (typeof value === 'string' && value.trim()) content[targetKey] = value;
    return content;
  }, {}));
};

const appendFile = (formData, asset, index) => {
  const field = getMediaField(asset?.type);
  const uri = typeof asset?.uri === 'string' ? asset.uri : '';
  if (!field || !uri) throw new Error('Le fichier média sélectionné est invalide.');

  const extension = MEDIA_TYPES.find(([assetType]) => assetType === asset.type)?.[2] || 'bin';
  const name = String(asset.fileName || `${field}_${Date.now()}.${extension}`)
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const mimeType = asset.mimeType || (
    asset.type === 'model' ? 'model/gltf-binary' : `${asset.type}/${extension}`
  );
  formData.append(`contents[${index}][${field === 'models_3d' ? 'model_3D' : field.slice(0, -1)}]`, {
    uri,
    name,
    type: mimeType,
  });
};

const createJsonPayload = (memoryData) => ({
  name: memoryData.title,
  description: memoryData.description,
  latitude: parseFloat(memoryData.latitude),
  longitude: parseFloat(memoryData.longitude),
  contents: createContents(memoryData),
});

const createMultipartPayload = (memoryData, mediaAsset) => {
  const formData = new FormData();
  const payload = createJsonPayload(memoryData);
  formData.append('name', payload.name || '');
  formData.append('description', payload.description || '');
  formData.append('latitude', String(payload.latitude));
  formData.append('longitude', String(payload.longitude));
  appendFile(formData, mediaAsset, 0);
  return formData;
};

export const createMemory = async (memoryData) => {
  try {
    const mediaAssets = Array.isArray(memoryData.mediaAssets) ? memoryData.mediaAssets : [];
    if (mediaAssets.length > 1) {
      throw new Error('Un seul média peut être envoyé par souvenir.');
    }
    if (mediaAssets.length === 1
      && (typeof mediaAssets[0]?.uri !== 'string' || !mediaAssets[0].uri)) {
      throw new Error('Le fichier média sélectionné est introuvable.');
    }
    const payload = createJsonPayload(memoryData);

    const token = await getAuthToken();
    if (!token) {
      const error = new Error('AUTH_REQUIRED');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }

    const hasLocalFile = mediaAssets.length === 1;
    const requestBody = hasLocalFile
      ? createMultipartPayload(memoryData, mediaAssets[0])
      : JSON.stringify(payload);
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (!hasLocalFile) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_URL}/memories`, {
      method: 'POST',
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const errorDetails = await response.json().catch(() => null);
      console.error(translate('serverValidationError'), errorDetails);
      if (response.status === 401) {
        const error = new Error('AUTH_REQUIRED');
        error.code = 'AUTH_REQUIRED';
        throw error;
      }
      const validationMessage = errorDetails?.message
        || Object.values(errorDetails?.errors || {}).flat()?.[0]
        || translate('serverError', { status: response.status });
      throw new Error(validationMessage);
    }

    return await response.json();
  } catch (error) {
    console.error(translate('memoryCreationError'), error);
    throw error;
  }
};
