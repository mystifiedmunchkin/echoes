import * as React from 'react';
import { ViroARPlane, ViroNode, ViroQuad } from '@reactvision/react-viro';
import { AimingSceneContext } from './AimingScene';
import { colliderShape, launchSpeed } from './aiming';
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
  id: number;
  position: Vector3;
  rotation: Vector3;
  velocity: Vector3;
}

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
  const config = game.settings!;
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
  const scoredShots = React.useRef(new Set<number>());
  const sequence = React.useRef(0);
  const projectile = game.objects.find(
    object => object.id === config.projectile.objectId,
  )!;
  const projectilePhysics = { ...projectile.properties.physics };
  delete projectilePhysics.velocity;
  const claimScore = (tag?: string) => {
    const id = Number(tag);
    if (
      !activeShots.current.some(shot => shot.id === id) ||
      scoredShots.current.has(id)
    )
      return false;
    scoredShots.current.add(id);
    return true;
  };
  const emit = React.useCallback(
    (
      name: 'planeCandidate' | 'planeReady' | 'shot' | 'shotBlocked',
      data?: unknown,
      objectId?: number,
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
    emit('planeCandidate', next);
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

  const fire = React.useCallback(
    (heldMs = 0) => {
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
      const live = activeShots.current;
      if (live.length >= config.projectile.maxActive) return block('limit');
      const magnitude = Math.hypot(...camera.forward);
      const direction = camera.forward.map(n => n / magnitude);
      const position: Vector3 = [
        camera.position[0] + direction[0] * config.projectile.spawnDistance,
        camera.position[1] + direction[1] * config.projectile.spawnDistance,
        camera.position[2] + direction[2] * config.projectile.spawnDistance,
      ];
      const speed = launchSpeed(config.projectile.speed, heldMs);
      const velocity: Vector3 = [
        direction[0] * speed,
        direction[1] * speed,
        direction[2] * speed,
      ];
      const shot: Shot = {
        id: -++sequence.current,
        position,
        rotation: camera.rotation,
        velocity,
      };
      activeShots.current = [...live, shot];
      setShots(activeShots.current);
      emit(
        'shot',
        { projectileId: projectile.id, position, velocity, heldMs },
        shot.id,
      );
    },
    [scene, floor, trackingReady, config.projectile, projectile.id, emit],
  );

  React.useEffect(() => {
    if (!scene) return;
    scene.fire.current = fire;
    return () => {
      scene.fire.current = null;
    };
  }, [scene, fire]);

  const physicalObject = (
    object: ExperienceObject,
    shot?: Pick<Shot, 'id' | 'position' | 'rotation'>,
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
            emit('planeCandidate');
          }}
        />
      )}
      {mode === 'ar' && !floor && candidate && (
        <ViroQuad
          position={candidate.position}
          rotation={[90, candidate.rotation[1], 0]}
          width={candidate.width}
          height={candidate.length}
          materials={['aimingPlaneIndicator']}
          opacity={0.35}
          onClick={() => {
            setFloor(candidate);
            emit('planeReady', candidate);
          }}
        />
      )}
      {floor && (
        <ViroNode position={floor.position} rotation={floor.rotation}>
          <ViroNode
            viroTag="aiming-floor"
            position={[0, -0.5, 0]}
            physicsBody={{
              type: 'Static',
              friction: 0.7,
              restitution: 0,
              shape: { type: 'Box', params: [100, 1, 100] },
            }}
            onCollision={() => undefined}
          />
          {game.objects
            .filter(object => object.id !== projectile.id)
            .map(object =>
              config.targets.includes(object.id) ? (
                <SceneObject
                  key={object.id}
                  {...props}
                  object={physicalObject(object)}
                  onClickState={scene?.onClickState}
                  claimScore={claimScore}
                  scoreOnBottom={
                    object.properties.collider?.type === 'basket' ||
                    object.properties.collider?.type === 'bounding'
                      ? true
                      : undefined
                  }
                  physicsBody={{
                    ...object.properties.physics,
                    type: object.properties.physics?.type ?? 'Static',
                    mass:
                      object.properties.physics?.type === 'Dynamic'
                        ? object.properties.physics.mass ?? 1
                        : 0,
                    shape: colliderShape(object.properties.collider!, {
                      targetBottom:
                        object.properties.collider!.type === 'bounding',
                    }),
                  }}
                />
              ) : (
                <SceneObject
                  key={object.id}
                  {...props}
                  object={object}
                  onClickState={scene?.onClickState}
                />
              ),
            )}
        </ViroNode>
      )}
      {shots.map(shot => (
        <SceneObject
          key={shot.id}
          {...props}
          object={physicalObject(projectile, shot)}
          sourceObjectId={projectile.id}
          onClickState={scene?.onClickState}
          projectileDiagnostics={{
            floorY: floor!.position[1],
            expiresAt: null,
            lifetimeMs: null,
            configuredLifetimeMs: config.projectile.lifetimeMs,
          }}
          physicsBody={{
            ...projectilePhysics,
            type: 'Dynamic',
            mass: projectile.properties.physics?.mass ?? 1,
            shape: colliderShape(projectile.properties.collider!),
            useGravity: projectile.properties.physics?.useGravity ?? true,
            instantVelocity: shot.velocity,
          }}
        />
      ))}
    </ViroNode>
  );
}
