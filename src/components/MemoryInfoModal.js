/** Read-only details modal for a memory selected from the map. */
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { COLORS } from '../../app/theme';
import { useI18n } from '../../constants/i18n';
import { MemoryAudioControls } from './MemoryAudioControls';

/**
 * Read-only modal displaying an existing memory's details.
 * It contains no input fields and submits no POST requests.
 */
export const MemoryInfoModal = ({
  visible,
  memory,
  onClose,
  onViewImage,
  onViewModel,
  onViewVideo,
}) => {
  const { t } = useI18n();
  if (!memory) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{memory.name}</Text>
          {!!memory.creatorName && <Text style={styles.creatorName}>{memory.creatorName}</Text>}

          {/* Collectible badge. */}
          {memory.is_collectible && (
            <View style={styles.collectibleBadge}>
              <Text style={styles.collectibleText}>✦ {t('collectible')}</Text>
            </View>
          )}

          {/* Description. */}
          {memory.description ? (
            <Text style={styles.description}>{memory.description}</Text>
          ) : (
            <Text style={styles.descriptionMuted}>{t('noDescription')}</Text>
          )}

          {!!memory.audio_url && <MemoryAudioControls source={memory.audio_url} />}

          {/* Metadata. */}
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>{t('memoryId')}</Text>
              <Text style={styles.metaValue}>#{memory.id}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>{t('latitude')}</Text>
              <Text style={styles.metaValue}>{Number(memory.lat).toFixed(5)}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>{t('longitude')}</Text>
              <Text style={styles.metaValue}>{Number(memory.lng).toFixed(5)}</Text>
            </View>
          </View>

          <View style={styles.buttonRow}>
            {!!memory.model_url && (
              <TouchableOpacity
                style={styles.modelButton}
                onPress={() => onViewModel?.(memory)}
              >
                <Text style={styles.modelButtonText}>{t('viewModel')}</Text>
              </TouchableOpacity>
            )}
            {!!memory.image_url && (
              <TouchableOpacity
                style={styles.mediaButton}
                onPress={() => onViewImage?.(memory)}
              >
                <Text style={styles.modelButtonText}>{t('viewImage')}</Text>
              </TouchableOpacity>
            )}
            {!!memory.video_url && (
              <TouchableOpacity
                style={styles.mediaButton}
                onPress={() => onViewVideo?.(memory)}
              >
                <Text style={styles.modelButtonText}>{t('viewVideo')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={false}
            >
              <Text style={styles.cancelText}>{t('closeModal')}</Text>
            </TouchableOpacity>

          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.accentStrong,
  },
  title: {
    color: COLORS.border,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  creatorName: {
    color: COLORS.primary,
    fontSize: 11,
    marginTop: -8,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  collectibleBadge: {
    backgroundColor: 'rgba(244, 201, 93, 0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 12,
  },
  collectibleText: {
    color: COLORS.accentStrong,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  description: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  descriptionMuted: {
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  metaCell: {
    alignItems: 'center',
    flex: 1,
  },
  metaLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  metaValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  cancelButton: {
    backgroundColor: COLORS.transparentLight,
    padding: 14,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modelButton: {
    backgroundColor: COLORS.primaryStrong,
    padding: 14,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  mediaButton: {
    backgroundColor: COLORS.primaryStrong,
    padding: 14,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  modelButtonText: {
    color: COLORS.textOnDark,
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  cancelText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});