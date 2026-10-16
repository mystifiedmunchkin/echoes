import * as React from 'react';
import {
  Viro3DObject,
  ViroARImageMarker,
  ViroARTrackingTargets,
  ViroAnimations,
  ViroImage,
  ViroNode,
  ViroSound,
  ViroText,
  ViroVideo,
} from '@reactvision/react-viro';
import type {
  ExperienceEvent,
  ExperienceGame,
  ExperienceObject,
  ExperienceType,
  Vector3,
} from './experience';
import { translate } from '../../constants/i18n';

export interface TemplateProps {
  game: ExperienceGame;
  mode: 'ar' | 'viewer';
  onEvent?: (event: ExperienceEvent) => void;
  onError: (message: string) => void;
}

function SceneObject({
  object,
  game,
  onEvent,
  onError,
}: Omit<TemplateProps, 'mode'> & {
  object: ExperienceObject;
}) {
  const { properties } = object;
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
  if (properties.active === false) return null;
  return (
    <ViroNode
      viroTag={object.id}
      position={properties.position || [0, 0, 0]}
      rotation={properties.rotation || [0, 0, 0]}
      scale={properties.scale || [1, 1, 1]}
      physicsBody={properties.physics}
      animation={
        animation && animationReady
          ? { name: animationName, run: true, loop: animation.loop ?? true }
          : undefined
      }
      onClick={() => emit('press', object.actions)}
      onCollision={(tag?: string, point?: Vector3, normal?: Vector3) =>
        emit('collision', { tag, point, normal })
      }
    >
      {asset &&
        (asset.type === 'GLB' ||
          asset.type === 'GLTF' ||
          asset.type === 'OBJ') && (
          <Viro3DObject
            source={{ uri: asset.url }}
            type={asset.type}
            onError={error}
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
  );
}

const textStyle = { fontSize: 24, color: '#FFFFFF' };

function Objects(props: TemplateProps) {
  return (
    <>
      {props.game.objects.map(object => (
        <SceneObject key={object.id} {...props} object={object} />
      ))}
    </>
  );
}

export function AimingTemplate(props: TemplateProps) {
  return (
    <ViroNode viroTag="aiming">
      <Objects {...props} />
    </ViroNode>
  );
}

export function TreasureTemplate(props: TemplateProps) {
  return (
    <ViroNode viroTag="treasure">
      <Objects {...props} />
    </ViroNode>
  );
}

export function DiscoveryTemplate(props: TemplateProps) {
  return (
    <ViroNode viroTag="discovery">
      <Objects {...props} />
    </ViroNode>
  );
}

export function ImagesTemplate(props: TemplateProps) {
  const { game, mode, onEvent, onError } = props;
  const targetName = `echoes-target-${React.useId()}`;
  const [ready, setReady] = React.useState(false);
  const [tracked, setTracked] = React.useState(false);
  const target = game.target;
  React.useEffect(() => {
    if (mode !== 'ar' || !target) return;
    setReady(false);
    setTracked(false);
    try {
      ViroARTrackingTargets.createTargets({
        [targetName]: {
          source: { uri: target.imageUrl },
          physicalWidth: target.physicalWidth,
          orientation: target.orientation,
          type: 'Image',
        },
      });
      setReady(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
      return;
    }
    return () => ViroARTrackingTargets.deleteTarget(targetName);
  }, [mode, target, targetName, onError]);

  if (mode === 'viewer')
    return (
      <ViroNode viroTag="images-preview">
        <Objects {...props} />
      </ViroNode>
    );
  if (!ready) return null;
  const emit = (name: ExperienceEvent['name'], data?: unknown) =>
    onEvent?.({
      type: 'images',
      gameId: game.id,
      name,
      data,
    });
  return (
    <ViroARImageMarker
      target={targetName}
      onError={event =>
        onError(
          event.nativeEvent.error?.message || translate('experienceError'),
        )
      }
      onAnchorFound={anchor => {
        setTracked(true);
        emit('targetFound', anchor);
      }}
      onAnchorUpdated={anchor => {
        if (anchor.trackingMethod === 'notTracking') setTracked(false);
        if (anchor.trackingMethod === 'tracking') setTracked(true);
        emit('targetUpdated', anchor);
      }}
      onAnchorRemoved={() => {
        setTracked(false);
        emit('targetRemoved');
      }}
    >
      {tracked && <Objects {...props} />}
    </ViroARImageMarker>
  );
}

export const experienceTemplates: Record<
  ExperienceType,
  React.ComponentType<TemplateProps>
> = {
  aiming: AimingTemplate,
  treasure: TreasureTemplate,
  discovery: DiscoveryTemplate,
  images: ImagesTemplate,
};

export function ExperienceContent(props: TemplateProps) {
  const Template = experienceTemplates[props.game.type];
  return <Template {...props} />;
}
