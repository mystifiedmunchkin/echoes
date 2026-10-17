import * as React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import {
  Viro3DObject,
  Viro3DSceneNavigator,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroNode,
  ViroScene,
} from '@reactvision/react-viro';
import { FileSystem } from 'react-native-file-access';
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
      dragRotation: [number, number];
      zoom: number;
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

const INITIAL_MODEL_SCALE = 0.5;
const TARGET_MODEL_SIZE = 1.4;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3;
const DRAG_DEGREES_PER_PIXEL = 0.4;

type ModelBounds = {
  min: [number, number, number];
  max: [number, number, number];
};

// Measure transformed accessor bounds without depending on native renderer load timing.
const parseGltfBounds = (gltf: {
  accessors?: Array<{ min?: number[]; max?: number[] }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }>;
  nodes?: Array<{
    mesh?: number;
    children?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
    matrix?: number[];
  }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
}): ModelBounds => {
  const bounds: ModelBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const updateBounds = (point: [number, number, number]) => {
    for (let axis = 0; axis < 3; axis += 1) {
      bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
    }
  };
  const transformPoint = (
    point: [number, number, number],
    nodeIndices: number[]
  ): [number, number, number] => {
    let transformed = point;
    // A point travels from its mesh node through each ancestor to the scene root.
    [...nodeIndices].reverse().forEach((nodeIndex) => {
      const node = gltf.nodes?.[nodeIndex];
      if (!node) return;

      if (node.matrix?.length === 16) {
        const matrix = node.matrix;
        const [x, y, z] = transformed;
        transformed = [
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ];
        return;
      }

      const scale = node.scale || [1, 1, 1];
      const rotation = node.rotation || [0, 0, 0, 1];
      const translation = node.translation || [0, 0, 0];
      const [x, y, z] = transformed.map((value, axis) => value * scale[axis]) as [
        number,
        number,
        number,
      ];
      const [qx, qy, qz, qw] = rotation;
      const ix = qw * x + qy * z - qz * y;
      const iy = qw * y + qz * x - qx * z;
      const iz = qw * z + qx * y - qy * x;
      const iw = -qx * x - qy * y - qz * z;
      transformed = [
        ix * qw + iw * -qx + iy * -qz - iz * -qy + translation[0],
        iy * qw + iw * -qy + iz * -qx - ix * -qz + translation[1],
        iz * qw + iw * -qz + ix * -qy - iy * -qx + translation[2],
      ];
    });
    return transformed;
  };
  const visitNode = (nodeIndex: number, ancestors: number[]) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;
    const nodePath = [...ancestors, nodeIndex];
    if (typeof node.mesh === 'number' && Number.isInteger(node.mesh)) {
      const mesh = gltf.meshes?.[node.mesh];
      (mesh?.primitives || []).forEach((primitive) => {
        const accessor = gltf.accessors?.[primitive.attributes?.POSITION ?? -1];
        if (!accessor?.min || !accessor.max) return;
        // Transform all eight corners: rotating only min/max would underestimate the bounds.
        for (let corner = 0; corner < 8; corner += 1) {
          const point: [number, number, number] = [
            corner % 2 ? accessor.max[0] : accessor.min[0],
            Math.floor(corner / 2) % 2 ? accessor.max[1] : accessor.min[1],
            Math.floor(corner / 4) ? accessor.max[2] : accessor.min[2],
          ];
          updateBounds(transformPoint(point, nodePath));
        }
      });
    }
    (node.children || []).forEach((childIndex) => visitNode(childIndex, nodePath));
  };

  if (gltf.nodes?.length) {
    const sceneNodes = gltf.scenes?.[gltf.scene || 0]?.nodes;
    const childIndices = new Set(gltf.nodes.flatMap((node) => node.children || []));
    const rootNodes = sceneNodes || gltf.nodes
      .map((_node, index) => index)
      .filter((index) => !childIndices.has(index));
    rootNodes.forEach((nodeIndex) => visitNode(nodeIndex, []));
  } else {
    (gltf.meshes || []).forEach((mesh) => {
      (mesh.primitives || []).forEach((primitive) => {
        const accessor = gltf.accessors?.[primitive.attributes?.POSITION ?? -1];
        if (!accessor?.min || !accessor.max) return;
        for (let corner = 0; corner < 8; corner += 1) {
          updateBounds([
            corner % 2 ? accessor.max[0] : accessor.min[0],
            Math.floor(corner / 2) % 2 ? accessor.max[1] : accessor.min[1],
            Math.floor(corner / 4) ? accessor.max[2] : accessor.min[2],
          ]);
        }
      });
    });
  }

  if (bounds.min.some((value) => !Number.isFinite(value))) {
    throw new Error('Model geometry does not include position bounds');
  }
  return bounds;
};

const decodeGlbJsonChunk = (base64: string): string => {
  const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let binary = '';
  for (let index = 0; index < base64.length; index += 4) {
    const first = base64Alphabet.indexOf(base64[index]);
    const second = base64Alphabet.indexOf(base64[index + 1]);
    const third = base64Alphabet.indexOf(base64[index + 2]);
    const fourth = base64Alphabet.indexOf(base64[index + 3]);
    binary += String.fromCharCode(Math.floor((first * 64 + second) / 16));
    if (base64[index + 2] !== '=') {
      binary += String.fromCharCode(((second % 16) * 16) + Math.floor(third / 4));
    }
    if (base64[index + 3] !== '=') {
      binary += String.fromCharCode(((third % 4) * 64) + fourth);
    }
  }
  const readUint32 = (offset: number) =>
    binary.charCodeAt(offset)
    + binary.charCodeAt(offset + 1) * 256
    + binary.charCodeAt(offset + 2) * 65536
    + binary.charCodeAt(offset + 3) * 16777216;

  if (binary.length < 20 || binary.slice(0, 4) !== 'glTF' || readUint32(4) !== 2) {
    throw new Error('Unsupported GLB file header');
  }

  let offset = 12;
  // GLB v2 has a 12-byte header, then length/type-prefixed chunks; only JSON describes bounds.
  while (offset + 8 <= binary.length) {
    const chunkLength = readUint32(offset);
    const chunkType = readUint32(offset + 4);
    const chunkStart = offset + 8;

    if (chunkType === 0x4e4f534a) {
      if (chunkStart + chunkLength > binary.length) {
        throw new Error('GLB JSON chunk is truncated');
      }
      return binary.slice(chunkStart, chunkStart + chunkLength).replace(/\0+$/, '');
    }

    offset = chunkStart + chunkLength;
  }

  throw new Error('GLB file does not contain a JSON chunk');
};

const getModelBounds = async (modelUrl: string, modelType: ModelType): Promise<ModelBounds> => {
  if (!modelUrl.startsWith('file://')) {
    throw new Error('Model bounds require a locally cached model file');
  }

  const path = decodeURIComponent(modelUrl.replace(/^file:\/\//, ''));
  if (modelType === 'GLB') {
    const json = decodeGlbJsonChunk(await FileSystem.readFile(path, 'base64'));
    return parseGltfBounds(JSON.parse(json));
  }

  if (modelType === 'GLTF') {
    return parseGltfBounds(JSON.parse(await FileSystem.readFile(path)));
  }

  const modelText = await FileSystem.readFile(path);
  const bounds: ModelBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const vertexPattern = /^\s*v\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/gm;
  let match: RegExpExecArray | null;
  while ((match = vertexPattern.exec(modelText)) !== null) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = Number(match[axis + 1]);
      if (!Number.isFinite(value)) continue;
      bounds.min[axis] = Math.min(bounds.min[axis], value);
      bounds.max[axis] = Math.max(bounds.max[axis], value);
    }
  }

  if (bounds.min.some((value) => !Number.isFinite(value))) {
    throw new Error('OBJ file does not contain vertex positions');
  }
  return bounds;
};

type ModelContentProps = {
  modelType: ModelType;
  modelUrl: string;
  dragRotation: [number, number];
  zoom: number;
  onError?: (message: string) => void;
  onLoadEnd?: () => void;
  onLoadStart?: () => void;
};

function ModelContent({
  modelType,
  modelUrl,
  dragRotation,
  zoom,
  onError,
  onLoadEnd,
  onLoadStart,
}: ModelContentProps) {
  const [modelTransform, setModelTransform] = React.useState({
    scale: INITIAL_MODEL_SCALE,
    position: [0, 0, -2.4] as [number, number, number],
  });

  React.useEffect(() => {
    let cancelled = false;
    setModelTransform({
      scale: INITIAL_MODEL_SCALE,
      position: [0, 0, -2.4],
    });

    getModelBounds(modelUrl, modelType).then((bounds) => {
      const size = bounds.max.map((value, axis) => value - bounds.min[axis]);
      const largestDimension = Math.max(...size);
      if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
        throw new Error('Model geometry has invalid dimensions');
      }

      const fittedScale = TARGET_MODEL_SIZE / largestDimension;
      const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2);
      // Fit the longest dimension and center the geometry around the gesture rotation pivot.
      if (!cancelled) {
        setModelTransform({
          scale: fittedScale,
          position: [
            -center[0] * fittedScale,
            -center[1] * fittedScale,
            -2.4 - center[2] * fittedScale,
          ],
        });
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        console.error('Unable to measure 3D model bounds; using default framing.', error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [modelType, modelUrl]);

  return (
    <ViroScene toneMappingEnabled={false}>
      <ViroAmbientLight color="#FFFFFF" intensity={350} />
      <ViroDirectionalLight color="#FFFFFF" direction={[0, -1, -1]} intensity={500} />
      <ViroDirectionalLight color="#F4C95D" direction={[-1, 0, 1]} intensity={150} />
      <ViroNode
        position={[0, 0, -2.4]}
        rotation={[dragRotation[0], dragRotation[1], 0]}
        scale={[zoom, zoom, zoom]}
      >
        <Viro3DObject
          source={{ uri: modelUrl }}
          type={modelType}
          position={[
            modelTransform.position[0],
            modelTransform.position[1],
            modelTransform.position[2] + 2.4,
          ]}
          scale={[
            modelTransform.scale,
            modelTransform.scale,
            modelTransform.scale,
          ]}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onError={(event) => onError?.(event.nativeEvent.error?.message || translate('modelLoadError'))}
        />
      </ViroNode>
    </ViroScene>
  );
}

class ModelScene extends ViroScene {
  render() {
    const { sceneNavigator } = this.props as ModelSceneRuntimeProps;
  const {
    modelType,
    modelUrl,
    dragRotation,
    zoom,
    onError,
    onLoadEnd,
    onLoadStart,
    } = sceneNavigator?.viroAppProps || {};

    if (!modelType || !modelUrl) {
      return <ViroScene toneMappingEnabled={false} />;
    }

    return (
      <ModelContent
        modelType={modelType}
        modelUrl={modelUrl}
        dragRotation={dragRotation || [0, 0]}
        zoom={zoom ?? 1}
        onError={onError}
        onLoadEnd={onLoadEnd}
        onLoadStart={onLoadStart}
      />
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
  const [dragRotation, setDragRotation] = React.useState<[number, number]>([0, 0]);
  const [zoom, setZoom] = React.useState(1);
  const zoomRef = React.useRef(1);
  const pinchTouch = React.useRef<{ distance: number; angle: number } | null>(null);
  const dragRotationRef = React.useRef<[number, number]>([0, 0]);
  const dragTouch = React.useRef<{ identifier: string; x: number; y: number } | null>(null);

  const handleTouch = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length === 2) {
      dragTouch.current = null;
      const dx = touches[1].pageX - touches[0].pageX;
      const dy = touches[1].pageY - touches[0].pageY;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const previous = pinchTouch.current;
      if (previous && distance > 0 && previous.distance > 0) {
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
          zoomRef.current * distance / previous.distance));
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
        const angleDelta = Math.atan2(
          // Keep twist deltas continuous when the touch angle crosses -PI/PI.
          Math.sin(angle - previous.angle), Math.cos(angle - previous.angle));
        const nextRotation: [number, number] = [
          dragRotationRef.current[0],
          dragRotationRef.current[1] + angleDelta * 180 / Math.PI,
        ];
        dragRotationRef.current = nextRotation;
        setDragRotation(nextRotation);
      }
      pinchTouch.current = { distance, angle };
      return;
    }
    pinchTouch.current = null;
    if (touches.length !== 1) {
      dragTouch.current = null;
      return;
    }

    const touch = touches[0];
    const previous = dragTouch.current;
    if (previous && previous.identifier === touch.identifier) {
      const nextRotation: [number, number] = [
        dragRotationRef.current[0] + (touch.pageY - previous.y) * DRAG_DEGREES_PER_PIXEL,
        dragRotationRef.current[1] + (touch.pageX - previous.x) * DRAG_DEGREES_PER_PIXEL,
      ];
      dragRotationRef.current = nextRotation;
      setDragRotation(nextRotation);
    }
    dragTouch.current = { identifier: touch.identifier, x: touch.pageX, y: touch.pageY };
  };

  React.useEffect(() => {
    // A new model starts with fresh loading state and no gesture offsets from its predecessor.
    const reset = () => {
      setIsLoading(true);
      setError(null);
      setDragRotation([0, 0]);
      dragRotationRef.current = [0, 0];
      dragTouch.current = null;
      pinchTouch.current = null;
      zoomRef.current = 1;
      setZoom(1);
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
          dragRotation,
          zoom,
          onError: setError,
          onLoadEnd: () => setIsLoading(false),
          onLoadStart: () => {
            setError(null);
            setIsLoading(true);
          },
        }}
      />
      <View
        testID="model-gesture-surface"
        collapsable={false}
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleTouch}
        onResponderStart={handleTouch}
        onResponderMove={handleTouch}
        onResponderEnd={handleTouch}
        onResponderRelease={() => {
          dragTouch.current = null;
          pinchTouch.current = null;
        }}
        onResponderTerminate={() => {
          dragTouch.current = null;
          pinchTouch.current = null;
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
