import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../../constants/i18n';
import { COLORS } from '../../theme';
import type { Experience } from './experience';

export function ExperienceControls({
  experience,
  gameIndex,
  onSelect,
  mode,
}: {
  experience: Experience;
  gameIndex: number;
  onSelect: (index: number) => void;
  mode: 'ar' | 'viewer';
}) {
  const { t } = useI18n();
  const game = experience.games[gameIndex];
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{t(`experience_${game.type}`)}</Text>
      <Text style={styles.text}>
        {t(
          game.aiming && mode === 'viewer'
            ? 'aimingViewerHint'
            : game.type === 'images' && mode === 'viewer'
            ? 'experienceImagesPreview'
            : `experienceHint_${game.type}`,
        )}
      </Text>
      {experience.games.length > 1 && (
        <View style={styles.games}>
          {experience.games.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => onSelect(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: index === gameIndex }}
            >
              <Text style={styles.text}>
                {index === gameIndex ? '> ' : ''}
                {t(`experience_${item.type}`)} {index + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surfaceRaised,
    padding: 12,
    borderRadius: 8,
  },
  text: { color: COLORS.text, marginBottom: 4 },
  games: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
