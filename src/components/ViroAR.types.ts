/** Shared TypeScript contracts for the React-to-Viro AR view boundary. */
import { ViewProps } from 'react-native';

export interface InteractiveObject {
  properties?: Record<string, unknown>;
  actions?: unknown[] | Record<string, unknown>;
  [key: string]: unknown;
}

export interface InteractiveGame {
  type?: string | null;
  assets?: unknown;
  objects?: InteractiveObject[];
  [key: string]: unknown;
}

export interface InteractiveDefinition {
  id: number;
  location_group_id: number;
  logic: { games: InteractiveGame[] };
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface MemoryRecord {
  id: number;
  name: string;
  model_url: string;
  model_urls?: string[];
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  user_id?: number | string;
  interactive?: InteractiveDefinition | null;
}

export interface NearbyMemory {
  id: number;
  name: string;
  bearingDeg: number;
  distanceMeters: number;
  relativePosition?: [number, number, number];
  isOwn?: boolean;
}

export interface MemoryCollectedEvent {
  nativeEvent: { id: number; name: string };
}

export interface MemoryPlacedEvent {
  nativeEvent: { id: number; name: string };
}

export interface ModelLoadingStatusEvent {
  nativeEvent: { isLoading: boolean; error?: string };
}

export interface ViroARViewProps extends ViewProps {
  arMemories?: MemoryRecord[];
  memoryToPlace?: MemoryRecord | null;
  nearbyMemories?: NearbyMemory[];
  onMemorySelected?: (event: MemoryPlacedEvent) => void;
  onMemoryCollected?: (event: MemoryCollectedEvent) => void;
  onMemoryPlaced?: (event: MemoryPlacedEvent) => void;
  onModelLoadingStatus?: (event: ModelLoadingStatusEvent) => void;
  resetPlacedMemoryKey?: number;
  canCollect?: boolean;
}
