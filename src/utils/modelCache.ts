/** Legacy model-only cache; authenticated experience preparation is handled by useRadar. */
import { Dirs, FileSystem } from 'react-native-file-access';
import { translate } from '../../constants/i18n';
import { ensureDirectory } from './ensureDirectory';

export async function getLocalModelUri(remoteUrl: string): Promise<string> {
  const modelUrl = remoteUrl.trim();
  if (!modelUrl) return '';
  if (modelUrl.startsWith('file://')) return modelUrl;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(modelUrl);
  } catch (error) {
    console.error(translate('modelUrlInvalid', { url: modelUrl }), error);
    return '';
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    console.error(translate('modelInvalidProtocol', { url: modelUrl }));
    return '';
  }

  try {
    const modelsDir = `${Dirs.CacheDir}/models`;
    await ensureDirectory(modelsDir);

    const fileName = parsedUrl.pathname.split('/').pop() || `model_${Date.now()}.glb`;
    const targetPath = `${modelsDir}/${fileName}`;

    if (await FileSystem.exists(targetPath)) return `file://${targetPath}`;

    const response = await FileSystem.fetch(parsedUrl.href, { path: targetPath });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return `file://${targetPath}`;
  } catch (error) {
    console.error(translate('modelDownloadError', { url: modelUrl }), error);
    return modelUrl;
  }
}