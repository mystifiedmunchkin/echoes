import * as React from 'react';
import { ViroTrackingStateConstants } from '@reactvision/react-viro';
import type { Vector3 } from './experience';

export interface CameraPose {
  position: Vector3;
  forward: Vector3;
  rotation: Vector3;
}

interface AimingSceneState {
  camera: React.RefObject<CameraPose | null>;
  fire: React.RefObject<(() => void) | null>;
  trackingReady: boolean;
}

export const AimingSceneContext = React.createContext<AimingSceneState | null>(
  null,
);

export function useAimingScene(mode: 'ar' | 'viewer') {
  const camera = React.useRef<CameraPose | null>(null);
  const fire = React.useRef<(() => void) | null>(null);
  const [trackingReady, setTrackingReady] = React.useState(mode === 'viewer');
  const value = React.useMemo(
    () => ({ camera, fire, trackingReady }),
    [trackingReady],
  );
  return {
    value,
    onCameraTransformUpdate: (pose: CameraPose) => {
      camera.current = pose;
    },
    onTrackingUpdated: (state: number) => {
      const ready = state === ViroTrackingStateConstants.TRACKING_NORMAL;
      if (!ready) camera.current = null;
      setTrackingReady(ready);
    },
    onClick: () => fire.current?.(),
  };
}
