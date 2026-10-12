/** Captures optional media and submits a map-anchored memory to the API. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Camera as VisionCameraModule } from 'react-native-vision-camera';
import { launchCamera } from 'react-native-image-picker';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import Sound from 'react-native-nitro-sound';
import { Video } from 'react-native-compressor';
import { createMemory } from '../services/api';
import { COLORS } from '../../theme';
import { useI18n } from '../../constants/i18n';

const TARGET_IMAGE_PIXELS = 2_000_000;
const TARGET_VIDEO_BITRATE = 2_000_000;
const TARGET_VIDEO_MAX_SIZE = 1280;
const MODEL_OPTIONS = [
  {
    id: 'unicorn',
    label: 'Unicorn',
    fileName: 'unicorn.glb',
    source: require('../../assets/models/unicorn.glb'),
  },
  {
    id: 'butterfly',
    label: 'Butterfly',
    fileName: 'butterfly.glb',
    source: require('../../assets/models/butterfly.glb'),
  },
  {
    id: 'fish',
    label: 'Fish',
    fileName: 'fish.glb',
    source: require('../../assets/models/fish.glb'),
  },
];

const compressCapturedImage = async (asset) => {
  const sourcePixels = Number(asset.width || 0) * Number(asset.height || 0);
  const scale = sourcePixels > TARGET_IMAGE_PIXELS
    ? Math.sqrt(TARGET_IMAGE_PIXELS / sourcePixels)
    : 1;
  const width = Number(asset.width || 0) > 0 ? Math.round(asset.width * scale) : undefined;
  const height = Number(asset.height || 0) > 0 ? Math.round(asset.height * scale) : undefined;
  const result = await ImageResizer.createResizedImage(
    asset.uri,
    width || Number(asset.width) || TARGET_VIDEO_MAX_SIZE,
    height || Number(asset.height) || TARGET_VIDEO_MAX_SIZE,
    'JPEG',
    82,
  );

  return {
    ...asset,
    uri: result.uri,
    width: result.width,
    height: result.height,
    type: 'image',
    mimeType: 'image/jpeg',
    fileName: `photo_${Date.now()}.jpg`,
  };
};

const compressCapturedVideo = async (asset) => {
  const uri = await Video.compress(asset.uri, {
    compressionMethod: 'manual',
    bitrate: TARGET_VIDEO_BITRATE,
    maxSize: TARGET_VIDEO_MAX_SIZE,
    minimumFileSizeForCompress: 0,
  });

  return {
    ...asset,
    uri,
    type: 'video',
    mimeType: 'video/mp4',
    fileName: `video_${Date.now()}.mp4`,
  };
};

export const CreateMemoryModal = ({ visible, onClose, currentLocation, onMemoryCreated }) => {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [showModelChoices, setShowModelChoices] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderIsRecordingRef = useRef(false);

  const stopActiveRecording = useCallback(async (saveRecording) => {
    if (!recorderIsRecordingRef.current) return null;

    try {
      const uri = await Sound.stopRecorder();
      recorderIsRecordingRef.current = false;
      setIsRecording(false);
      if (!saveRecording || !uri) return null;

      const audioAsset = {
        uri,
        type: 'audio',
        fileName: `audio_${Date.now()}.m4a`,
      };
      setSelectedMedia(audioAsset);
      return audioAsset;
    } finally {
      Sound.removeRecordBackListener();
    }
  }, []);

  useEffect(() => {
    if (visible) return;

    stopActiveRecording(false).catch((error) => {
      console.warn(t('audioRecordingStopError'), error);
    });
  }, [stopActiveRecording, visible]);

  useEffect(() => () => {
    stopActiveRecording(false).catch((error) => {
      console.warn(t('audioRecordingStopError'), error);
    });
  }, [stopActiveRecording]);

  const captureMedia = async (mediaType) => {
    if (!currentLocation) {
      Alert.alert(t('photoRejectedTitle'), t('gpsUnavailable'));
      return;
    }

    const permission = await VisionCameraModule.requestCameraPermission();
    if (permission !== 'granted') {
      Alert.alert(t('photoRejectedTitle'), t('cameraPermission'));
      return;
    }

    setLoading(true);
    try {
      const result = await launchCamera({
        mediaType: mediaType === 'videos' ? 'video' : 'photo',
        quality: mediaType === 'videos' ? undefined : 1,
      });

      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const normalizedAsset = mediaType === 'videos'
        ? await compressCapturedVideo(asset)
        : await compressCapturedImage(asset);
      setSelectedMedia(normalizedAsset);
    } catch (error) {
      console.error(t('mediaCompressionError'), error);
      Alert.alert(t('error'), t('mediaCompressionError'));
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = () => captureMedia('images');
  const pickVideo = () => captureMedia('videos');

  const chooseModel = async (model) => {
    setLoading(true);
    try {
      const asset = Image.resolveAssetSource(model.source);
      if (!asset?.uri) throw new Error(t('localModelMissing'));

      setSelectedMedia({
        uri: asset.uri,
        type: 'model',
        mimeType: 'model/gltf-binary',
        fileName: model.fileName,
        modelName: model.label,
      });
      setShowModelChoices(false);
    } catch (error) {
      console.error(t('modelPreparationError'), error);
      Alert.alert(t('error'), t('modelPreparationError'));
    } finally {
      setLoading(false);
    }
  };

  const toggleAudioRecording = async () => {
    if (isRecording) {
      await stopActiveRecording(true);
      return;
    }

    const permission = await VisionCameraModule.requestMicrophonePermission();
    if (permission !== 'granted') {
      Alert.alert(t('error'), t('microphonePermission'));
      return;
    }

    Sound.setSubscriptionDuration(0.25);
    await Sound.startRecorder();
    recorderIsRecordingRef.current = true;
    setIsRecording(true);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert(t('error'), t('requiredMemoryName'));
      return;
    }

    if (!currentLocation) {
      Alert.alert(t('error'), t('gpsUnavailable'));
      return;
    }

    setLoading(true);

    try {
      const recordedAudio = await stopActiveRecording(true);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        latitude: parseFloat(currentLocation.latitude),
        longitude: parseFloat(currentLocation.longitude),
        mediaAssets: recordedAudio || selectedMedia ? [recordedAudio || selectedMedia] : [],
      };

      const result = await createMemory(payload);
      Alert.alert(t('success'), t('memoryCreated'));
      
      setTitle('');
      setDescription('');
      setSelectedMedia(null);
      setShowModelChoices(false);
      
      // Safely invoke prop functions
      if (typeof onMemoryCreated === 'function') {
        onMemoryCreated(result);
      }
      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (error) {
      if (error.code === 'AUTH_REQUIRED') {
        Alert.alert(t('signInRequired'), t('signInBeforeCreate'));
      } else {
        Alert.alert(t('error'), error.message || t('saveMemoryError'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>📍 {t('newMemory')}</Text>
          <Text style={styles.subtitle}>
            {t('location')} : {currentLocation?.latitude?.toFixed(4)}, {currentLocation?.longitude?.toFixed(4)}
          </Text>

          <TextInput
            style={styles.input}
            placeholder={t('memoryNamePlaceholder')}
            placeholderTextColor="#888"
            value={title}
            onChangeText={setTitle}
          />

          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder={t('memoryDescriptionPlaceholder')}
            placeholderTextColor="#888"
            multiline
            numberOfLines={3}
            value={description}
            onChangeText={setDescription}
          />

          <View style={styles.mediaButtonGrid}>
            <TouchableOpacity style={styles.mediaButton} onPress={pickPhoto} disabled={loading}>
              <Text style={styles.mediaButtonText}>
                {selectedMedia?.type === 'image' ? t('selectedPhoto') : t('takePhoto')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.mediaButton} onPress={pickVideo} disabled={loading}>
              <Text style={styles.mediaButtonText}>
                {selectedMedia?.type === 'video' ? t('selectedVideo') : t('takeVideo')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaButton} onPress={toggleAudioRecording} disabled={loading}>
              <Text style={styles.mediaButtonText}>
                {isRecording ? t('stopRecording') : selectedMedia?.type === 'audio' ? t('selectedAudio') : t('recordAudio')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.mediaButton,
                selectedMedia?.type === 'model' && styles.selectedMediaButton,
              ]}
              onPress={() => setShowModelChoices((current) => !current)}
              disabled={loading}
            >
              <Text style={styles.mediaButtonText}>
                {selectedMedia?.type === 'model'
                  ? selectedMedia.modelName
                  : t('choose3DModel')}
              </Text>
            </TouchableOpacity>
          </View>

          {showModelChoices && (
            <View style={styles.modelChoices}>
              {MODEL_OPTIONS.map((model) => (
                <TouchableOpacity
                  key={model.id}
                  style={styles.modelChoice}
                  onPress={() => chooseModel(model)}
                  disabled={loading}
                >
                  <Text style={styles.modelChoiceText}>{model.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={COLORS.background} size="small" />
              ) : (
                <Text style={styles.submitText}>{t('submitMemory')}</Text>
              )}
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
    color: COLORS.accentStrong,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 16,
  },
  input: {
    backgroundColor: COLORS.surfaceMuted,
    color: COLORS.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  mediaButton: {
    width: '48%',
    backgroundColor: COLORS.surfaceMuted,
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  mediaButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectedMediaButton: {
    borderColor: COLORS.accentStrong,
    backgroundColor: COLORS.surfaceRaised,
  },
  modelChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 8,
  },
  modelChoice: {
    backgroundColor: COLORS.primaryStrong,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modelChoiceText: {
    color: COLORS.textOnDark,
    fontWeight: 'bold',
  },
  mediaButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cancelButton: {
    padding: 12,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },
  cancelText: {
    color: COLORS.text,
  },
  submitButton: {
    backgroundColor: COLORS.accentStrong,
    padding: 12,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },
  submitText: {
    color: COLORS.background,
    fontWeight: 'bold',
  },
});