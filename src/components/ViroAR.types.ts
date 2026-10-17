/** Shared TypeScript contracts for the React-to-Viro AR view boundary. */
import { ViewProps } from 'react-native';
import type { Experience, ExperienceEvent } from '../experiences/experience';

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
  // The map/AR entry ID identifies the game, not its shared location.
  id: number;
  location_id: number;
  name: string;
  model_url: string;
  model_urls?: string[];
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  user_id?: number | string;
  created_by?: number | string;
  relativePosition?: [number, number, number];
  isOwn?: boolean;
  interactive?: InteractiveDefinition | null;
}

export interface NearbyMemory {
  id: number;
  location_id: number;
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
  experience?: Experience | null;
  experienceGameIndex?: number;
  onExperienceEvent?: (event: ExperienceEvent) => void;
  onExperienceError?: (message: string) => void;
}
