/** HTTP client for creating memories and uploading their optional media payloads. */
import { getAuthToken } from './auth';
import { translate } from '../../constants/i18n';

const API_URL = 'https://echoes.sophiehorner.art/api';

export const createMemory = async (memoryData) => {
  try {
    const payload = {
      title: memoryData.title,
      name: memoryData.title,
      description: memoryData.description,
      latitude: parseFloat(memoryData.latitude),
      longitude: parseFloat(memoryData.longitude),
      contents: Array.isArray(memoryData.contents) ? memoryData.contents : [],
    };

    const mediaAssets = Array.isArray(memoryData.mediaAssets) ? memoryData.mediaAssets : [];
    const audioUrl = typeof memoryData.audioUrl === 'string' ? memoryData.audioUrl.trim() : '';

    const token = await getAuthToken();
    if (!token) {
      const error = new Error('AUTH_REQUIRED');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }

    const hasMultipartMedia = mediaAssets.some((asset) => typeof asset?.uri === 'string' && asset.uri)
      || audioUrl.length > 0;
    let body = JSON.stringify(payload);
    const headers = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    if (hasMultipartMedia) {
      const formData = new FormData();
      formData.append('title', payload.title);
      formData.append('name', payload.name);
      formData.append('description', payload.description || '');
      formData.append('latitude', String(payload.latitude));
      formData.append('longitude', String(payload.longitude));

      mediaAssets.forEach((asset, index) => {
        const mediaType = asset.type === 'video'
          ? 'video'
          : asset.type === 'audio'
            ? 'audio'
            : asset.type === 'model'
              ? 'model_3D'
              : 'image';
        const fallbackExtension = mediaType === 'video'
          ? 'mp4'
          : mediaType === 'audio'
            ? 'm4a'
            : mediaType === 'model_3D'
              ? 'glb'
              : 'jpg';
        const uri = typeof asset.uri === 'string' ? asset.uri : '';
        if (!uri) return;

        const fileName = String(asset.fileName || `${mediaType}_${Date.now()}.${fallbackExtension}`)
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        formData.append(`contents[${index}][${mediaType}]`, {
          uri,
          name: fileName,
          type: asset.mimeType || `${mediaType}/${fallbackExtension}`,
        });
      });

      if (audioUrl) formData.append('contents[0][audio]', audioUrl);
      body = formData;
    } else {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_URL}/memories`, {
      method: 'POST',
      headers,
      body,
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