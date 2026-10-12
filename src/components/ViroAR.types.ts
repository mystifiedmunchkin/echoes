/** Shared TypeScript contracts for the React-to-Viro AR view boundary. */
import { ViewProps } from 'react-native';

export interface MemoryRecord {
  id: number;
  name: string;
  model_url: string;
  model_urls?: string[];
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  user_id?: number | string;
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

export interface PlaneTappedEvent {
  nativeEvent: { screenX: number; screenY: number };
}

export interface ModelLoadingStatusEvent {
  nativeEvent: { isLoading: boolean; error?: string };
}

export interface ViroARViewProps extends ViewProps {
  arMemories?: MemoryRecord[];
  creatingMemoryMode?: boolean;
  memoryToPlace?: MemoryRecord | null;
  nearbyMemories?: NearbyMemory[];
  onMemorySelected?: (event: MemoryPlacedEvent) => void;
  onMemoryCollected?: (event: MemoryCollectedEvent) => void;
  onMemoryPlaced?: (event: MemoryPlacedEvent) => void;
  onPlaneTapped?: (event: PlaneTappedEvent) => void;
  onModelLoadingStatus?: (event: ModelLoadingStatusEvent) => void;
  resetPlacedMemoryKey?: number;
  canCollect?: boolean;
}
