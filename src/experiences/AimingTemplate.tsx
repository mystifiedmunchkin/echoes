/** Locks a playable floor, launches projectiles, and translates native impacts into game events. */
import * as React from 'react';
import { ViroARPlane, ViroNode, ViroQuad } from '@reactvision/react-viro';
import { AimingSceneContext } from './AimingScene';
import { AimingReadyProjectile } from './AimingReadyProjectile';
import {
  basketThickness, colliderShape, colliderSize, distanceAdjustedPoints, hasFallen,
  hasImpactRules, impactPoints, isBottomContact, launchSpeed, rotate,
} from './aiming';
import type { BodyTransform } from './aiming';
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

interface PlaneCandidate extends Floor {
  center: Vector3;
  surfaceRotation: Vector3;
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

interface Impact {
  projectileId: number;
  point: Vector3;
  normal: Vector3;
  points: number;
}
type Contact = Omit<Impact, 'projectileId'>;

function floorFromAnchor(
  anchor: PlaneAnchor,
  minWidth: number,
  minLength: number,
  vertical: boolean,
): PlaneCandidate | null {
  const { width, height, position, rotation, center = [0, 0, 0] } = anchor;
  if (
    anchor.type !== 'plane' ||
    (vertical
      ? anchor.alignment !== 'Vertical'
      : anchor.alignment !== 'Horizontal' &&
        anchor.alignment !== 'HorizontalUpward') ||
    !width ||
    !height ||
    width < minWidth ||
    height < minLength ||
    ![...position, ...rotation, ...center, width, height].every(Number.isFinite)
  )
    return null;
  const offset = rotate(center, rotation);
  const normal = rotate([0, 1, 0], rotation);
  const yaw = vertical
    ? Math.atan2(normal[0], normal[2]) * 180 / Math.PI
    : rotation[1];
  // The anchor center is plane-local; rotate its offset into world space before locking.
  return {
    anchorId: anchor.anchorId,
    center: [...center],
    surfaceRotation: [...rotation],
    position: [
      position[0] + offset[0],
      position[1] + offset[1],
      position[2] + offset[2],
    ],
    rotation: [0, yaw, 0],
    width,
    length: height,
  };
}

export function ConfiguredAimingTemplate(props: TemplateProps) {
  const { game, mode, onEvent, onError } = props;
  const config = game.settings!;
  const vertical = config.plane.orientation === 'vertical';
  const impactRules = hasImpactRules(config);
  const basketGame = game.subtype === 'basket';
  const scene = React.useContext(AimingSceneContext);
  const trackingReady = mode === 'viewer' || scene?.trackingReady === true;
  const [floor, setFloor] = React.useState<Floor | null>(
    mode === 'viewer'
      ? {
          position: [0, vertical ? 0 : -1, -2],
          rotation: [0, 0, 0],
          width: config.plane.minWidth,
          length: config.plane.minLength,
        }
      : null,
  );
  const [candidate, setCandidate] = React.useState<PlaneCandidate | null>(null);
  const latestCandidate = React.useRef<PlaneCandidate | null>(null);
  const planeLocked = React.useRef(mode === 'viewer');
  const trackingReadyRef = React.useRef(trackingReady);
  trackingReadyRef.current = trackingReady;
  const [shots, setShots] = React.useState<Shot[]>([]);
  const activeShots = React.useRef<Shot[]>([]);
  const scoredContacts = React.useRef(new Set<string>());
  const scoredTargets = React.useRef(new Set<number>());
  const [frozenShots, setFrozenShots] = React.useState(new Set<number>());
  const [fallenTargets, setFallenTargets] = React.useState(new Set<number>());
  const pendingFalls = React.useRef(new Map<number, Impact>());
  const targetContacts = React.useRef(new Map<number, Map<number, Contact>>());
  const freezeRequests = React.useRef(new Set<number>());
  const projectileContactTransforms = React.useRef(new Map<number, BodyTransform>());
  const [frozenTransforms, setFrozenTransforms] = React.useState(
    new Map<number, BodyTransform>(),
  );
  const [rewards, setRewards] = React.useState<{ id: number; point: Vector3 }[]>([]);
  const sequence = React.useRef(0);
  const projectile = game.objects.find(
    object => object.id === config.projectile.objectId,
  )!;
  const projectileCollider = projectile.properties.collider!;
  const projectilePhysics = { ...projectile.properties.physics };
  // Launch velocity is applied once via instantVelocity, rather than overriding gravity each render.
  delete projectilePhysics.velocity;
  const claimScore = (targetId: number, tag?: string) => {
    const id = Number(tag);
    const contactId = `${id}:${targetId}`;
    if (
      !activeShots.current.some(shot => shot.id === id) ||
      scoredContacts.current.has(contactId)
    )
      return false;
    scoredContacts.current.add(contactId);
    return true;
  };
  const award = (targetId: number, impact: Impact) => {
    // Fall rules score each target once; other impact rules score each projectile once.
    if (config.fall) {
      if (scoredTargets.current.has(targetId)) return;
      scoredTargets.current.add(targetId);
      setFallenTargets(new Set(scoredTargets.current));
    } else {
      const key = `${impact.projectileId}:${targetId}`;
      if (scoredContacts.current.has(key)) return;
      scoredContacts.current.add(key);
    }
    if (config.reward !== undefined) {
      const reward = { id: -++sequence.current, point: impact.point };
      setRewards(current => [...current, reward]);
    }
    onEvent?.({
      type: 'aiming', gameId: game.id, objectId: targetId, name: 'collision',
      data: {
        scoringContact: true,
        projectileId: impact.projectileId,
        point: impact.point,
        normal: impact.normal,
        points: impact.points,
        ...(config.fall ? { fallen: true } : {}),
      },
    });
  };
  const propagateFall = (targetId: number, impact: Impact) => {
    // Remember contact chains so a projectile can topple and score indirectly hit targets.
    if (pendingFalls.current.has(targetId)) return;
    pendingFalls.current.set(targetId, impact);
    for (const [neighbor, contact] of targetContacts.current.get(targetId) ?? []) {
      propagateFall(neighbor, {
        projectileId: impact.projectileId, ...contact,
      });
    }
  };
  const checkFall = (object: ExperienceObject, transform: BodyTransform) => {
    const impact = pendingFalls.current.get(object.id);
    if (impact && floor && hasFallen(
      transform.rotation, object.properties.rotation ?? [0, 0, 0], floor.rotation,
    )) award(object.id, impact);
  };
  const captureProjectileContact = (
    shotId: number,
    tag: string | undefined,
    transform: BodyTransform,
  ) => {
    if (!config.freeze || !config.targets.includes(Number(tag))) return;
    projectileContactTransforms.current.set(shotId, transform);
    if (freezeRequests.current.has(shotId)) {
    setFrozenTransforms(current => {
      if (current.has(shotId)) return current;
      return new Map(current).set(shotId, transform);
    });
    }
  };
  const handleImpact = (
    object: ExperienceObject, tag: string | undefined, point: Vector3,
    normal: Vector3, transform: BodyTransform,
  ) => {
    const otherId = Number(tag);
    const collider = object.properties.collider!;
    if ((basketGame || collider.type === 'basket') &&
      !isBottomContact(collider, point, normal, transform, true)) return;
    const basePoints = game.subtype === 'bowling' || basketGame
      ? config.multiplier ?? 1
      : impactPoints(collider, point, normal, transform, config.multiplier ?? 1);
    const distanceMeters = scene?.camera.current
      ? Math.hypot(
        ...scene.camera.current.position.map(
          (value, index) => value - transform.position[index],
        ),
      )
      : Infinity;
    const contact: Contact = {
      point,
      normal,
      points: distanceAdjustedPoints(distanceMeters, basePoints),
    };
    if (config.fall && activeShots.current.length && config.targets.includes(otherId)) {
      if (!targetContacts.current.has(otherId)) targetContacts.current.set(otherId, new Map());
      targetContacts.current.get(otherId)!.set(object.id, contact);
      const inherited = pendingFalls.current.get(otherId);
      if (inherited) propagateFall(object.id, { projectileId: inherited.projectileId, ...contact });
      checkFall(object, transform);
      return;
    }
    const projectile = activeShots.current.find(shot => shot.id === otherId)
      || (activeShots.current.length === 1 ? activeShots.current[0] : undefined);
    if (!projectile) return;
    const projectileId = projectile.id;
    if (!config.fall && scoredContacts.current.has(`${projectileId}:${object.id}`))
      return;
    if (config.freeze) {
      freezeRequests.current.add(projectileId);
      const contactTransform = projectileContactTransforms.current.get(projectileId);
      if (contactTransform) {
        setFrozenTransforms(current => {
          if (current.has(projectileId)) return current;
          return new Map(current).set(projectileId, contactTransform);
        });
      } else {
        // Keep the existing fallback for runtimes that only report the target
        // side of a collision; native projectile callbacks provide the exact
        // contact pose whenever available.
        setFrozenShots(current =>
          current.has(projectileId) ? current : new Set([...current, projectileId]),
        );
      }
    }
    const impact: Impact = {
      projectileId, ...contact,
    };
    if (config.fall) {
      propagateFall(object.id, impact);
      checkFall(object, transform);
    } else {
      award(object.id, impact);
      if (basketGame) {
        activeShots.current = activeShots.current.filter(shot => shot.id !== projectileId);
        setShots(activeShots.current);
      }
    }
  };
  const emit = React.useCallback(
    (
      name: 'planeCandidate' | 'planeReady' | 'projectileHint' | 'shot' | 'shotBlocked',
      data?: unknown,
      objectId?: number,
    ) => onEvent?.({ type: 'aiming', gameId: game.id, name, data, objectId }),
    [game.id, onEvent],
  );

  const lockPlane = React.useCallback((position?: Vector3) => {
    const plane = latestCandidate.current;
    if (planeLocked.current || !trackingReadyRef.current || !plane) return;
    planeLocked.current = true;
    // Keep the exact pose selected by the user; subsequent anchor updates must
    // not move the playable scene.
    const locked = {
      anchorId: plane.anchorId,
      width: plane.width,
      length: plane.length,
      position: [...(position ?? plane.position)] as Vector3,
      rotation: [...plane.rotation] as Vector3,
    };
    setFloor(locked);
    emit('planeReady', locked);
  }, [emit]);

  const selectPlane = React.useCallback((position: Vector3) => {
    if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
      onError('Invalid AR plane selection: missing or invalid world-space hit position');
      return;
    }
    lockPlane(position);
  }, [lockPlane, onError]);

  const updatePlane = (anchor: PlaneAnchor) => {
    if (planeLocked.current) return;
    const next = trackingReadyRef.current ? floorFromAnchor(
      anchor,
      config.plane.minWidth,
      config.plane.minLength,
      vertical,
    ) : null;
    latestCandidate.current = next;
    emit('planeCandidate', next);
    setCandidate(next);
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
        camera.position[1] + direction[1] * config.projectile.spawnDistance +
          colliderSize(projectileCollider)[1] / 2,
        camera.position[2] + direction[2] * config.projectile.spawnDistance,
      ];
      const speed = launchSpeed(config.projectile.speed, heldMs);
      const velocity: Vector3 = [
        direction[0] * speed,
        direction[1] * speed,
        direction[2] * speed,
      ];
      const shot: Shot = {
        // Server object IDs are non-negative; negative IDs identify local shot/reward instances.
        id: -++sequence.current,
        position,
        rotation: camera.rotation,
        velocity,
      };
      activeShots.current = [...live, shot];
      // Basket successes release a slot; other bodies remain for the scene's lifetime.
      setShots(activeShots.current);
      emit(
        'shot',
        { projectileId: projectile.id, position, velocity, heldMs },
        shot.id,
      );
    },
    [
      scene?.camera, floor, trackingReady, config.projectile, projectile.id,
      projectileCollider, emit,
    ],
  );

  React.useEffect(() => {
    if (!scene?.fire) return undefined;
    scene.fire.current = fire;
    return () => {
      if (scene.fire.current === fire) scene.fire.current = null;
    };
  }, [scene?.fire, fire]);

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
  const worldFloor = floor && (
    <ViroNode viroTag="aiming-origin" position={floor.position} rotation={floor.rotation}>
      {!vertical && <ViroNode
        viroTag="aiming-floor"
        position={[0, -0.5, 0]}
        physicsBody={{
          type: 'Static',
          friction: 0.7,
          restitution: 0,
          shape: { type: 'Box', params: [100, 1, 100] },
        }}
        onCollision={() => undefined}
      />}
      {game.objects
        .filter(object => object.id !== projectile.id)
        .map(object => {
          if (!config.targets.includes(object.id)) return (
            <SceneObject
              key={object.id}
              {...props}
              object={object}
              onClickState={scene?.onClickState}
            />
          );
          const targetBodyType = basketGame
            ? 'Static'
            : object.properties.physics?.type ?? 'Static';
          const targetBottom = (basketGame || !impactRules) &&
            object.properties.collider!.type === 'bounding';
          const splitContainer = targetBodyType === 'Static' &&
            (targetBottom || object.properties.collider!.type === 'basket');
          const objectPosition = object.properties.position ?? [0, 0, 0];
          const objectHeight = colliderSize(object.properties.collider!)[1];
          const targetPosition: Vector3 = [
            objectPosition[0],
            objectPosition[1] + objectHeight / 2,
            objectPosition[2],
          ];
          const targetPhysics = {
            ...object.properties.physics,
            type: targetBodyType,
            mass: targetBodyType === 'Dynamic'
              ? object.properties.physics?.mass ?? 1
              : 0,
            useGravity: targetBodyType === 'Dynamic'
              ? object.properties.physics?.useGravity
              : false,
            velocity: targetBodyType === 'Dynamic'
              ? object.properties.physics?.velocity
              : undefined,
            instantVelocity: undefined,
          };
          return (
            <React.Fragment key={object.id}>
              {/* Separate bodies let a bottom contact enter after an earlier wall contact. */}
              {splitContainer && (
                <ViroNode
                  viroTag={`${object.id}:walls`}
                  position={targetPosition}
                  rotation={object.properties.rotation ?? [0, 0, 0]}
                  physicsBody={{
                    ...targetPhysics,
                    shape: colliderShape(object.properties.collider!, {
                      targetBottom, containerPart: 'walls',
                    }),
                  }}
                />
              )}
              <SceneObject
                {...props}
                object={physicalObject(object)}
                onClickState={scene?.onClickState}
                claimScore={impactRules ? undefined : tag => claimScore(object.id, tag)}
                onBodyCollision={impactRules ? (tag, point, normal, transform) =>
                  handleImpact(object, tag, point, normal, transform) : undefined}
                onSampleTransform={config.fall && shots.length > 0 && !fallenTargets.has(object.id)
                  ? transform => checkFall(object, transform) : undefined}
                scoreOnBottom={
                  !impactRules && (object.properties.collider?.type === 'basket' ||
                  object.properties.collider?.type === 'bounding')
                    ? true
                    : undefined
                }
                physicsBody={{
                  ...targetPhysics,
                  shape: colliderShape(object.properties.collider!, {
                    targetBottom,
                    containerPart: splitContainer ? 'bottomAtOrigin' : undefined,
                  }),
                }}
                physicsPosition={splitContainer
                  ? [
                      targetPosition[0],
                      targetPosition[1] -
                        (objectHeight - basketThickness(object.properties.collider!)) / 2,
                      targetPosition[2],
                    ]
                  : targetPosition}
                visualOffset={splitContainer
                  ? [
                      0,
                      (objectHeight - basketThickness(object.properties.collider!)) / 2,
                      0,
                    ]
                  : undefined}
              />
            </React.Fragment>
          );
        })}
    </ViroNode>
  );
  return (
    <ViroNode viroTag="aiming">
      {mode === 'viewer' && (
        <AimingReadyProjectile
          {...props}
          projectile={projectile}
          visible={trackingReady && shots.length < config.projectile.maxActive}
        />
      )}
      {mode === 'ar' && !floor && (
        <ViroARPlane
          minWidth={config.plane.minWidth}
          minHeight={config.plane.minLength}
          alignment={vertical ? 'Vertical' : 'HorizontalUpward'}
          onAnchorFound={updatePlane}
          onAnchorUpdated={updatePlane}
          onClick={selectPlane}
          onAnchorRemoved={() => {
            latestCandidate.current = null;
            setCandidate(null);
            emit('planeCandidate');
          }}
        >
          {candidate && (
            <ViroQuad
              position={candidate.center}
              rotation={[-90, 0, 0]}
              width={candidate.width}
              height={candidate.length}
              materials={['aimingPlaneIndicator']}
              opacity={0.7}
              onClick={selectPlane}
            />
          )}
        </ViroARPlane>
      )}
      {worldFloor}
      {shots.map(shot => (
        <SceneObject
          key={shot.id}
          {...props}
          object={physicalObject(projectile, shot)}
          sourceObjectId={projectile.id}
          freeze={frozenTransforms.get(shot.id) ?? frozenShots.has(shot.id)}
          onBodyCollision={config.freeze ? (tag, _point, _normal, transform) =>
            captureProjectileContact(shot.id, tag, transform) : undefined}
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
            shape: colliderShape(projectileCollider),
            useGravity: projectile.properties.physics?.useGravity ?? true,
            instantVelocity: shot.velocity,
          }}
        />
      ))}
      {rewards.map(reward => (
        <SceneObject
          key={`reward-${reward.id}`}
          {...props}
          onEvent={undefined}
          object={{
            id: reward.id,
            properties: { asset: config.reward, position: reward.point },
          }}
        />
      ))}
    </ViroNode>
  );
}
