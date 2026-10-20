/** Renders a declarative scene object and bridges collection, physics, and media callbacks. */
import * as React from 'react';
import {
  Viro3DObject,
  ViroAnimations,
  ViroImage,
  ViroNode,
  ViroSound,
  ViroText,
  ViroVideo,
} from '@reactvision/react-viro';
import { translate } from '../../constants/i18n';
import { isBodyTransform, isBottomContact } from './aiming';
import type { BodyTransform } from './aiming';
import { AimingSceneContext } from './AimingScene';
import type { ExperienceEvent, ExperienceObject, Vector3 } from './experience';
import type { TemplateProps } from './ExperienceTemplates';

export function SceneObject({
  object,
  game,
  onEvent,
  onError,
  onPress,
  onClickState,
  scoreOnBottom,
  claimScore,
  onCollision: onCollisionCallback,
  physicsBody,
  projectileDiagnostics,
  sourceObjectId,
  freeze = false,
  onBodyCollision,
  onSampleTransform,
  physicsPosition,
  visualOffset,
}: Omit<TemplateProps, 'mode'> & {
  object: ExperienceObject;
  sourceObjectId?: number;
  freeze?: boolean;
  onBodyCollision?: (
    tag: string | undefined,
    point: Vector3,
    normal: Vector3,
    transform: BodyTransform,
  ) => void;
  onSampleTransform?: (transform: BodyTransform) => void;
  physicsPosition?: Vector3;
  visualOffset?: Vector3;
  onPress?: () => void;
  onClickState?: React.ComponentProps<typeof ViroNode>['onClickState'];
  scoreOnBottom?: boolean;
  claimScore?: (tag?: string) => boolean;
  onCollision?: (tag?: string, point?: Vector3, normal?: Vector3) => void;
  physicsBody?: React.ComponentProps<typeof ViroNode>['physicsBody'] & {
    instantVelocity?: Vector3;
  };
  projectileDiagnostics?: {
    floorY: number;
    expiresAt: number | null;
    lifetimeMs: number | null;
    configuredLifetimeMs: number | null;
  };
}) {
  const { properties } = object;
  const aimingScene = React.useContext(AimingSceneContext);
  const trackingReady = aimingScene?.trackingReady;
  const collectionTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCollectionTimer = React.useCallback(() => {
    if (collectionTimer.current !== null) clearTimeout(collectionTimer.current);
    collectionTimer.current = null;
  }, []);
  React.useEffect(() => {
    if (trackingReady === false) clearCollectionTimer();
    return clearCollectionTimer;
  }, [trackingReady, object.id, properties.collectible, clearCollectionTimer]);
  const handleClickState: NonNullable<React.ComponentProps<typeof ViroNode>['onClickState']> =
    (...args) => {
      const [state] = args;
      onClickState?.(...args);
      if (state === 1 && trackingReady !== false && collectionTimer.current === null) {
        // A successful long press collects instead of also releasing a charged aiming shot.
        collectionTimer.current = setTimeout(() => {
          collectionTimer.current = null;
          aimingScene?.cancelCharge();
          onEvent?.({
            type: game.type,
            gameId: game.id,
            objectId: sourceObjectId ?? object.id,
            name: 'collect',
          });
        }, 600);
      } else if (state === 2) {
        clearCollectionTimer();
      }
    };
  const node = React.useRef<ViroNode | null>(null);
  const [frozen, setFrozen] = React.useState<BodyTransform | null>(null);
  const sample = React.useRef(onSampleTransform);
  sample.current = onSampleTransform;
  const sampling = onSampleTransform !== undefined;
  React.useEffect(() => {
    if (!freeze) return;
    // Capture the simulated world pose before replacing the dynamic body with a static one.
    let cancelled = false;
    const freezeBody = async () => {
      try {
        if (!node.current) throw new Error('Projectile body is not mounted');
        const transform: unknown = await node.current.getTransformAsync();
        if (!isBodyTransform(transform)) throw new Error('Invalid native projectile transform');
        if (!cancelled) setFrozen(transform);
      } catch (freezeError) {
        if (!cancelled) onError(freezeError instanceof Error ? freezeError.message : String(freezeError));
      }
    };
    freezeBody();
    return () => { cancelled = true; };
  }, [freeze, onError]);
  React.useEffect(() => {
    if (!sampling) return;
    // Native transform queries are asynchronous; never overlap polls or publish after unmount.
    let cancelled = false;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || cancelled) return;
      busy = true;
      try {
        if (!node.current) throw new Error('Target body is not mounted');
        const transform: unknown = await node.current.getTransformAsync();
        if (!isBodyTransform(transform)) throw new Error('Invalid native target transform');
        if (!cancelled) sample.current?.(transform);
      } catch (sampleError) {
        clearInterval(timer);
        if (!cancelled) onError(sampleError instanceof Error ? sampleError.message : String(sampleError));
      } finally {
        busy = false;
      }
    }, 100);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sampling, onError]);
  const model = React.useRef<Viro3DObject | null>(null);
  const diagnosticState = React.useRef({
    config: projectileDiagnostics,
    contacts: new Set<string>(),
    timers: new Set<ReturnType<typeof setTimeout>>(),
  });
  const logProjectile = (phase: string, data: unknown) => {
    console.info(
      '[AimingPhysics]',
      JSON.stringify(
        { gameId: game.id, shotId: object.id, phase, data },
        (_key, value) =>
          typeof value === 'number' && !Number.isFinite(value)
            ? String(value)
            : value,
      ),
    );
  };
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    const { config, timers } = diagnosticState.current;
    if (config)
      logProjectile('mounted', {
        ...config,
        position: properties.position,
        scale: properties.scale,
        physicsBody,
      });
    return () => {
      mounted.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
      if (config)
        logProjectile('unmounted', {
          expiresAt: config.expiresAt,
          now: Date.now(),
        });
    };
    // A mounted shot retains its launch configuration across score/UI updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const snapshotProjectile = async (phase: string) => {
    const config = diagnosticState.current.config;
    if (!config || !mounted.current || !node.current || !model.current) return;
    try {
      const [bodyTransform, modelTransform, modelBounds] = await Promise.all([
        node.current.getTransformAsync(),
        model.current.getTransformAsync(),
        model.current.getBoundingBoxAsync(),
      ]);
      if (!mounted.current) return;
      logProjectile(phase, {
        floorY: config.floorY,
        bodyTransform,
        modelTransform,
        modelBounds,
      });
    } catch (diagnosticError) {
      if (!mounted.current) return;
      console.warn('[AimingPhysics] native snapshot failed', {
        gameId: game.id,
        shotId: object.id,
        phase,
        error:
          diagnosticError instanceof Error
            ? diagnosticError.message
            : String(diagnosticError),
      });
    }
  };
  const asset = game.assets.find(item => item.id === properties.asset);
  const animation = properties.animation;
  const animationName = `echoes-animation-${React.useId()}`;
  const [animationReady, setAnimationReady] = React.useState(false);
  React.useEffect(() => {
    if (!animation) return;
    ViroAnimations.registerAnimations({
      [animationName]: {
        properties: { rotateY: `+=${animation.rotateY}` },
        duration: animation.duration,
      },
    });
    setAnimationReady(true);
  }, [animation, animationName]);
  const error: React.ComponentProps<typeof Viro3DObject>['onError'] = event =>
    onError(event.nativeEvent.error?.message || translate('mediaLoadError'));
  const emit = (name: ExperienceEvent['name'], data?: unknown) =>
    onEvent?.({
      type: game.type,
      gameId: game.id,
      objectId: object.id,
      name,
      data,
    });
  const onCollision = async (
    tag?: string,
    point?: Vector3,
    normal?: Vector3,
  ) => {
    const diagnostics = diagnosticState.current;
    if (diagnostics.config && !diagnostics.contacts.has(tag ?? 'untagged')) {
      diagnostics.contacts.add(tag ?? 'untagged');
      logProjectile('contact', { tag, point, normal });
      snapshotProjectile('contact-now');
      for (const delay of [250, 1000, 3000]) {
        const timer = setTimeout(() => {
          diagnostics.timers.delete(timer);
          snapshotProjectile(`contact+${delay}ms`);
        }, delay);
        diagnostics.timers.add(timer);
      }
    }
    let scoringContact = false;
    if (onBodyCollision && point && normal) {
      try {
        if (![...point, ...normal].every(Number.isFinite) || Math.hypot(...normal) === 0)
          throw new Error('Invalid native collision contact');
        if (!node.current) throw new Error('Collision body is not mounted');
        const transform: unknown = await node.current.getTransformAsync();
        if (!isBodyTransform(transform)) throw new Error('Invalid native collision body transform');
        if (!mounted.current) return;
        onBodyCollision(tag, point, normal, transform);
      } catch (collisionError) {
        if (!mounted.current) return;
        onError(collisionError instanceof Error ? collisionError.message : String(collisionError));
      }
    }
    if (scoreOnBottom && properties.collider && point && normal) {
      try {
        if (!node.current) throw new Error('Collision body is not mounted');
        const transform: unknown = await node.current.getTransformAsync();
        if (!isBodyTransform(transform))
          throw new Error('Invalid native collision body transform');
        if (!mounted.current) return;
        scoringContact =
          isBottomContact(properties.collider, point, normal, transform) &&
          claimScore?.(tag) === true;
      } catch (collisionError) {
        if (!mounted.current) return;
        onError(
          collisionError instanceof Error
            ? collisionError.message
            : String(collisionError),
        );
      }
    }
    emit('collision', {
      tag,
      point,
      normal,
      ...(scoreOnBottom === undefined ? {} : { scoringContact }),
      ...(scoringContact ? { projectileId: Number(tag) } : {}),
    });
    onCollisionCallback?.(tag, point, normal);
  };
  if (properties.active === false) return null;
  // Remount when freezing so the native body is rebuilt at the captured pose.
  return (
    <ViroNode
      key={frozen ? 'frozen' : 'live'}
      ref={node}
      viroTag={String(object.id)}
      position={frozen?.position ?? physicsPosition ?? properties.position ?? [0, 0, 0]}
      rotation={frozen?.rotation ?? properties.rotation ?? [0, 0, 0]}
      scale={physicsBody ? undefined : properties.scale || [1, 1, 1]}
      physicsBody={frozen ? {
        ...physicsBody,
        type: 'Static',
        mass: 0,
        useGravity: false,
        velocity: undefined,
        instantVelocity: undefined,
      } : physicsBody || properties.physics}
      animation={
        animation && animationReady
          ? { name: animationName, run: true, loop: animation.loop ?? true }
          : undefined
      }
      onClick={() => {
        emit('press', object.actions);
        onPress?.();
      }}
      onCollision={(tag?: string, point?: Vector3, normal?: Vector3) => {
        onCollision(tag, point, normal);
      }}
      onClickState={properties.collectible === true ? handleClickState : onClickState}
    >
      {/* Scale visual geometry separately so explicit colliders retain their meter dimensions. */}
      <ViroNode
        position={visualOffset}
        scale={physicsBody ? properties.scale : undefined}
      >
        {asset &&
          (asset.type === 'GLB' ||
            asset.type === 'GLTF' ||
            asset.type === 'OBJ') && (
            <Viro3DObject
              ref={model}
              source={{ uri: asset.url }}
              type={asset.type}
              onError={error}
              onLoadStart={
                projectileDiagnostics
                  ? () => {
                      logProjectile('model-load-start', {});
                    }
                  : undefined
              }
              onLoadEnd={
                projectileDiagnostics
                  ? () => {
                      snapshotProjectile('model-loaded');
                    }
                  : undefined
              }
            />
          )}
        {asset?.type === 'image' && (
          <ViroImage source={{ uri: asset.url }} onError={error} />
        )}
        {asset?.type === 'video' && (
          <ViroVideo source={{ uri: asset.url }} loop onError={error} />
        )}
        {asset?.type === 'audio' && (
          <ViroSound source={{ uri: asset.url }} onError={error} />
        )}
        {properties.text !== undefined && (
          <ViroText
            text={properties.text}
            width={1.5}
            height={0.6}
            style={textStyle}
          />
        )}
      </ViroNode>
    </ViroNode>
  );
}

const textStyle = { fontSize: 24, color: '#FFFFFF' };
