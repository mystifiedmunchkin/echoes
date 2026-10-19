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
  fire: React.RefObject<((heldMs?: number) => void) | null>;
  trackingReady: boolean;
  onClickState: (state: number) => void;
  tapVisible: boolean;
  cancelCharge: () => void;
}

// Share live camera/fire refs without rerendering the scene on every camera update.
export const AimingSceneContext = React.createContext<AimingSceneState | null>(
  null,
);

export function useAimingScene(mode: 'ar' | 'viewer') {
  const camera = React.useRef<CameraPose | null>(null);
  const fire = React.useRef<((heldMs?: number) => void) | null>(null);
  const charge = React.useRef<{
    startedAt: number;
    fire: (heldMs?: number) => void;
  } | null>(null);
  const [tapVisible, setTapVisible] = React.useState(true);
  const [trackingReady, setTrackingReady] = React.useState(mode === 'viewer');
  const cancelCharge = React.useCallback(() => { charge.current = null; }, []);
  const onClickState = React.useCallback((state: number) => {
    if (state === 1) setTapVisible(true);
    if (state === 2) setTapVisible(false);
    if (state === 1 && !charge.current && fire.current) {
      charge.current = { startedAt: Date.now(), fire: fire.current };
    }
    if (state !== 2) return;
    const held = charge.current;
    charge.current = null;
    // Releasing a press from an old game must not fire into the newly selected scene.
    if (held && held.fire === fire.current)
      held.fire(Date.now() - held.startedAt);
  }, []);
  const value = React.useMemo(
    () => ({
      camera, fire, tapVisible, trackingReady, onClickState, cancelCharge,
    }),
    [tapVisible, trackingReady, onClickState, cancelCharge],
  );
  return {
    value,
    onCameraTransformUpdate: (pose: CameraPose) => {
      camera.current = pose;
    },
    onTrackingUpdated: (state: number) => {
      const ready = state === ViroTrackingStateConstants.TRACKING_NORMAL;
      if (!ready) {
        // Tracking loss invalidates both the camera pose and any partially charged shot.
        camera.current = null;
        charge.current = null;
      }
      setTrackingReady(ready);
    },
    onClickState,
  };
}
