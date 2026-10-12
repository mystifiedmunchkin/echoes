import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Sound from 'react-native-nitro-sound';
import { COLORS } from '../../app/theme';
import { useI18n } from '../../constants/i18n';

const formatDuration = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export function MemoryAudioControls({ source }) {
  const { t } = useI18n();
  const [status, setStatus] = useState({ duration: 0, currentTime: 0, playing: false });
  const startedRef = useRef(false);
  const duration = Number.isFinite(status.duration) ? status.duration / 1000 : 0;
  const currentTime = Math.min(
    Number.isFinite(status.currentTime) ? status.currentTime / 1000 : 0,
    duration,
  );

  useEffect(() => {
    startedRef.current = false;
    Sound.setSubscriptionDuration(0.25);
    Sound.addPlayBackListener(({ duration: nextDuration, currentPosition }) => {
      setStatus((current) => ({
        duration: nextDuration,
        currentTime: currentPosition,
        playing: current.playing,
      }));
    });
    Sound.addPlaybackEndListener(() => {
      startedRef.current = false;
      setStatus((current) => ({ ...current, playing: false, currentTime: 0 }));
    });

    return () => {
      Sound.removePlayBackListener();
      Sound.removePlaybackEndListener();
      Sound.stopPlayer().catch(() => undefined);
    };
  }, [source]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{t('audio')}</Text>
        <Text style={styles.duration}>{formatDuration(currentTime)} / {formatDuration(duration)}</Text>
      </View>
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.playButton}
          onPress={async () => {
            try {
              if (status.playing) {
                await Sound.pausePlayer();
                setStatus((current) => ({ ...current, playing: false }));
              } else if (startedRef.current) {
                await Sound.resumePlayer();
                setStatus((current) => ({ ...current, playing: true }));
              } else {
                await Sound.startPlayer(source);
                startedRef.current = true;
                setStatus((current) => ({ ...current, playing: true }));
              }
            } catch (error) {
              console.warn(t('audioPlaybackError'), error);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? t('pauseAudio') : t('playAudio')}
        >
          <Text style={styles.playButtonText}>{status.playing ? 'II' : '▶'}</Text>
        </TouchableOpacity>
        <Slider
          style={styles.timeline}
          minimumValue={0}
          maximumValue={Math.max(duration, 1)}
          value={currentTime}
          minimumTrackTintColor={COLORS.accentStrong}
          maximumTrackTintColor={COLORS.surfaceMuted}
          thumbTintColor={COLORS.accentStrong}
          onSlidingComplete={(value) => {
            if (!startedRef.current) return;
            Sound.seekToPlayer(value * 1000).catch((error) => {
              console.warn(t('audioPlaybackError'), error);
            });
          }}
          accessibilityLabel={t('audioTimeline')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    color: COLORS.text,
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
  },
  duration: {
    color: COLORS.textMuted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  playButton: {
    alignItems: 'center',
    backgroundColor: COLORS.primaryStrong,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  playButtonText: {
    color: COLORS.textOnDark,
    fontSize: 13,
    fontWeight: 'bold',
  },
  timeline: {
    flex: 1,
    height: 36,
  },
});
