import * as React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  Viro3DObject,
  Viro3DSceneNavigator,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroOrbitCamera,
  ViroScene,
} from '@reactvision/react-viro';
import { translate, useI18n } from '../../constants/i18n';

type ModelType = 'GLB' | 'GLTF' | 'OBJ';

type ViroModelViewerProps = {
  modelUrl: string;
  style?: StyleProp<ViewStyle>;
};

type ModelSceneProps = {
  sceneNavigator?: {
    viroAppProps?: {
      modelType: ModelType;
      modelUrl: string;
      onError: (message: string) => void;
      onLoadEnd: () => void;
      onLoadStart: () => void;
    };
  };
};

const getModelType = (url: string): ModelType | null => {
  if (/\.glb(\?|$)/i.test(url)) return 'GLB';
  if (/\.gltf(\?|$)/i.test(url)) return 'GLTF';
  if (/\.obj(\?|$)/i.test(url)) return 'OBJ';
  return null;
};

type ModelSceneRuntimeProps = React.ComponentProps<typeof ViroScene> & ModelSceneProps;

class ModelScene extends ViroScene {
  render() {
    const { sceneNavigator } = this.props as ModelSceneRuntimeProps;
  const {
    modelType,
    modelUrl,
    onError,
    onLoadEnd,
    onLoadStart,
    } = sceneNavigator?.viroAppProps || {};

    if (!modelType || !modelUrl) {
      return <ViroScene toneMappingEnabled={false} />;
    }

    return (
      <ViroScene toneMappingEnabled={false}>
        <ViroOrbitCamera
          active
          position={[0, 0, 3]}
          focalPoint={[0, 0, 0]}
          fieldOfView={45}
        />
        <ViroAmbientLight color="#FFFFFF" intensity={350} />
        <ViroDirectionalLight color="#FFFFFF" direction={[0, -1, -1]} intensity={500} />
        <ViroDirectionalLight color="#F4C95D" direction={[-1, 0, 1]} intensity={150} />
        <Viro3DObject
          source={{ uri: modelUrl }}
          type={modelType}
          position={[0, 0, 0]}
          scale={[0.5, 0.5, 0.5]}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onError={(event) => onError?.(event.nativeEvent.error?.message || translate('modelLoadError'))}
        />
      </ViroScene>
    );
  }
}

// Viro's navigator declaration incorrectly requires a scene instance; it renders a scene class.
const initialScene = { scene: ModelScene as unknown as ViroScene };

export default function ViroModelViewer({ modelUrl, style }: ViroModelViewerProps) {
  const { t } = useI18n();
  const modelType = getModelType(modelUrl);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Wrap in function to avoid direct setState in render/effect if needed
    const reset = () => {
      setIsLoading(true);
      setError(null);
    };
    reset();
  }, [modelUrl]);

  if (!modelType) {
    return (
      <View style={[styles.container, style]}>
        <Text style={styles.errorText}>{t('modelFormatUnsupported')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Viro3DSceneNavigator
        style={styles.viewer}
        initialScene={initialScene}
        hdrEnabled={false}
        pbrEnabled={false}
        bloomEnabled={false}
        shadowsEnabled={false}
        multisamplingEnabled={false}
        viroAppProps={{
          modelType,
          modelUrl,
          onError: setError,
          onLoadEnd: () => setIsLoading(false),
          onLoadStart: () => {
            setError(null);
            setIsLoading(true);
          },
        }}
      />
      {isLoading && !error && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#F4C95D" />
          <Text style={styles.loadingText}>{t('modelLoading')}</Text>
        </View>
      )}
      {error && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 220,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  viewer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: 8,
    padding: 16,
  },
  loadingText: {
    color: '#F4C95D',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  errorText: {
    color: '#FF6B6B',
    fontFamily: 'monospace',
    fontSize: 12,
    textAlign: 'center',
  },
});
