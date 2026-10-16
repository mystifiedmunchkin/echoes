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
import type { ExperienceEvent, ExperienceObject, Vector3 } from './experience';
import type { TemplateProps } from './ExperienceTemplates';

export function SceneObject({
  object,
  game,
  onEvent,
  onError,
  onPress,
  physicsBody,
}: Omit<TemplateProps, 'mode'> & {
  object: ExperienceObject;
  onPress?: () => void;
  physicsBody?: React.ComponentProps<typeof ViroNode>['physicsBody'];
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
      scale={physicsBody ? undefined : properties.scale || [1, 1, 1]}
      physicsBody={physicsBody || properties.physics}
      animation={
        animation && animationReady
          ? { name: animationName, run: true, loop: animation.loop ?? true }
          : undefined
      }
      onClick={() => {
        emit('press', object.actions);
        onPress?.();
      }}
      onCollision={(tag?: string, point?: Vector3, normal?: Vector3) =>
        emit('collision', { tag, point, normal })
      }
    >
      <ViroNode scale={physicsBody ? properties.scale : undefined}>
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
    </ViroNode>
  );
}

const textStyle = { fontSize: 24, color: '#FFFFFF' };
