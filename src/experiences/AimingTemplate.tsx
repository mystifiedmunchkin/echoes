import * as React from 'react';
import { ViroARPlane, ViroNode, ViroText } from '@reactvision/react-viro';
import { translate } from '../../constants/i18n';
import { AimingSceneContext } from './AimingScene';
import { colliderShape } from './aiming';
import type { ExperienceObject, Vector3 } from './experience';
import { SceneObject } from './SceneObject';
import type { TemplateProps } from './ExperienceTemplates';

interface Floor {
  anchorId?: string;
  position: Vector3;
  rotation: Vector3;
  width: number;
  length: number;
}

type PlaneAnchor = Parameters<
  NonNullable<React.ComponentProps<typeof ViroARPlane>['onAnchorFound']>
>[0];

interface Shot {
  id: string;
  position: Vector3;
  rotation: Vector3;
  velocity: Vector3;
  expiresAt: number;
}

const hintStyle = { fontSize: 20, color: '#FFFFFF' };

function floorFromAnchor(
  anchor: PlaneAnchor,
  minWidth: number,
  minLength: number,
): Floor | null {
  const { width, height, position, rotation, center = [0, 0, 0] } = anchor;
  if (
    anchor.type !== 'plane' ||
    (anchor.alignment !== 'Horizontal' &&
      anchor.alignment !== 'HorizontalUpward') ||
    !width ||
    !height ||
    width < minWidth ||
    height < minLength ||
    ![...position, ...rotation, ...center, width, height].every(Number.isFinite)
  )
    return null;
  const yaw = (rotation[1] * Math.PI) / 180;
  return {
    anchorId: anchor.anchorId,
    position: [
      position[0] + center[0] * Math.cos(yaw) + center[2] * Math.sin(yaw),
      position[1] + center[1],
      position[2] - center[0] * Math.sin(yaw) + center[2] * Math.cos(yaw),
    ],
    rotation: [0, rotation[1], 0],
    width,
    length: height,
  };
}

export function ConfiguredAimingTemplate(props: TemplateProps) {
  const { game, mode, onEvent } = props;
  const config = game.aiming!;
  const scene = React.useContext(AimingSceneContext);
  const trackingReady = mode === 'viewer' || scene?.trackingReady === true;
  const [floor, setFloor] = React.useState<Floor | null>(
    mode === 'viewer'
      ? {
          position: [0, -1, -2],
          rotation: [0, 0, 0],
          width: config.plane.minWidth,
          length: config.plane.minLength,
        }
      : null,
  );
  const [candidate, setCandidate] = React.useState<Floor | null>(null);
  const latestCandidate = React.useRef<Floor | null>(null);
  const [shots, setShots] = React.useState<Shot[]>([]);
  const activeShots = React.useRef<Shot[]>([]);
  const sequence = React.useRef(0);
  const projectile = game.objects.find(
    object => object.id === config.projectile.objectId,
  )!;
  const emit = React.useCallback(
    (
      name: 'planeReady' | 'shot' | 'shotBlocked',
      data?: unknown,
      objectId?: string,
    ) => onEvent?.({ type: 'aiming', gameId: game.id, name, data, objectId }),
    [game.id, onEvent],
  );

  React.useEffect(() => {
    if (!trackingReady || !candidate || floor) return;
    const timer = setTimeout(() => {
      const locked = latestCandidate.current;
      if (!locked) return;
      setFloor(locked);
      emit('planeReady', locked);
    }, config.plane.stableMs);
    return () => clearTimeout(timer);
  }, [candidate, trackingReady, floor, config.plane.stableMs, emit]);

  const updatePlane = (anchor: PlaneAnchor) => {
    if (floor) return;
    const next = floorFromAnchor(
      anchor,
      config.plane.minWidth,
      config.plane.minLength,
    );
    latestCandidate.current = next;
    setCandidate(previous => {
      if (!next || !previous) return next;
      const distance = Math.hypot(
        ...next.position.map((n, i) => n - previous.position[i]),
      );
      const angle = Math.abs(
        ((next.rotation[1] - previous.rotation[1] + 540) % 360) - 180,
      );
      return next.anchorId !== previous.anchorId || distance > 0.03 || angle > 3
        ? next
        : previous;
    });
  };

  React.useEffect(() => {
    if (trackingReady || floor) return;
    latestCandidate.current = null;
    setCandidate(null);
  }, [trackingReady, floor]);

  const fire = React.useCallback(() => {
    const camera = scene?.camera.current;
    const block = (reason: string) => emit('shotBlocked', { reason });
    if (!floor) return block('plane');
    if (!trackingReady) return block('tracking');
    if (
      !camera ||
      ![...camera.position, ...camera.forward, ...camera.rotation].every(
        Number.isFinite,
      ) ||
      Math.hypot(...camera.forward) === 0
    )
      return block('camera');
    const now = Date.now();
    const live = activeShots.current.filter(shot => shot.expiresAt > now);
    if (live.length >= config.projectile.maxActive) return block('limit');
    const magnitude = Math.hypot(...camera.forward);
    const direction = camera.forward.map(n => n / magnitude);
    const position: Vector3 = [
      camera.position[0] + direction[0] * config.projectile.spawnDistance,
      camera.position[1] + direction[1] * config.projectile.spawnDistance,
      camera.position[2] + direction[2] * config.projectile.spawnDistance,
    ];
    const velocity: Vector3 = [
      direction[0] * config.projectile.speed,
      direction[1] * config.projectile.speed,
      direction[2] * config.projectile.speed,
    ];
    const shot: Shot = {
      id: `aiming-shot:${game.id}:${++sequence.current}`,
      position,
      rotation: camera.rotation,
      velocity,
      expiresAt: now + config.projectile.lifetimeMs,
    };
    activeShots.current = [...live, shot];
    setShots(activeShots.current);
    emit('shot', { projectileId: projectile.id, position, velocity }, shot.id);
  }, [
    scene,
    floor,
    trackingReady,
    config.projectile,
    game.id,
    projectile.id,
    emit,
  ]);

  React.useEffect(() => {
    if (!scene) return;
    scene.fire.current = fire;
    return () => {
      scene.fire.current = null;
    };
  }, [scene, fire]);

  React.useEffect(() => {
    if (!shots.length) return;
    const timer = setTimeout(() => {
      activeShots.current = activeShots.current.filter(
        shot => shot.expiresAt > Date.now(),
      );
      setShots(activeShots.current);
    }, Math.max(0, Math.min(...shots.map(shot => shot.expiresAt)) - Date.now()));
    return () => clearTimeout(timer);
  }, [shots]);

  const physicalObject = (
    object: ExperienceObject,
    shot?: Shot,
  ): ExperienceObject => ({
    ...object,
    id: shot?.id ?? object.id,
    properties: {
      ...object.properties,
      position: shot?.position ?? object.properties.position,
      rotation: shot?.rotation ?? object.properties.rotation,
      animation: undefined,
      physics: undefined,
    },
  });
  return (
    <ViroNode viroTag="aiming">
      {mode === 'ar' && !floor && (
        <ViroARPlane
          minWidth={config.plane.minWidth}
          minHeight={config.plane.minLength}
          alignment="HorizontalUpward"
          onAnchorFound={updatePlane}
          onAnchorUpdated={updatePlane}
          onAnchorRemoved={() => {
            latestCandidate.current = null;
            setCandidate(null);
          }}
        />
      )}
      {(!floor || !trackingReady) && (
        <ViroText
          position={[0, 0, -1]}
          width={1.5}
          height={0.4}
          text={translate(!floor ? 'aimingScanPlane' : 'aimingTrackingLost')}
          style={hintStyle}
        />
      )}
      {floor && (
        <ViroNode position={floor.position} rotation={floor.rotation}>
          <ViroNode
            viroTag="aiming-floor"
            position={[0, -0.025, 0]}
            physicsBody={{
              type: 'Static',
              friction: 0.7,
              restitution: 0.2,
              shape: { type: 'Box', params: [floor.width, 0.05, floor.length] },
            }}
          />
          {game.objects
            .filter(object => object.id !== projectile.id)
            .map(object =>
              config.targets.includes(object.id) ? (
                <SceneObject
                  key={object.id}
                  {...props}
                  object={physicalObject(object)}
                  onPress={fire}
                  physicsBody={{
                    ...object.properties.physics,
                    type: object.properties.physics?.type ?? 'Static',
                    shape: colliderShape(object.properties.collider!),
                  }}
                />
              ) : (
                <SceneObject key={object.id} {...props} object={object} />
              ),
            )}
        </ViroNode>
      )}
      {shots.map(shot => (
        <SceneObject
          key={shot.id}
          {...props}
          object={physicalObject(projectile, shot)}
          onPress={fire}
          physicsBody={{
            ...projectile.properties.physics,
            type: 'Dynamic',
            mass: projectile.properties.physics?.mass ?? 1,
            shape: colliderShape(projectile.properties.collider!),
            velocity: shot.velocity,
          }}
        />
      ))}
    </ViroNode>
  );
}
