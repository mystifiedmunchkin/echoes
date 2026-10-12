/** Configures and plays the selected memory's audio without rendering UI. */
import { useEffect } from 'react';
import Sound from 'react-native-nitro-sound';
import { translate } from '../../constants/i18n';

export function MemoryAudioPlayer({ source }) {
  useEffect(() => {
    if (!source) {
      Sound.stopPlayer().catch(() => undefined);
      return undefined;
    }

    Sound.startPlayer(source).catch((error) => {
      console.warn(translate('audioPlaybackError'), error);
    });

    return () => {
      Sound.stopPlayer().catch(() => undefined);
    };
  }, [source]);

  return null;
}