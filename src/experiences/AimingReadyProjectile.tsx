import * as React from 'react';
import {
  ViroARCamera,
  ViroCamera,
  ViroNode,
} from '@reactvision/react-viro';
import { AimingSceneContext } from './AimingScene';
import { SceneObject } from './SceneObject';
import type { TemplateProps } from './ExperienceTemplates';
import type { ExperienceObject, Vector3 } from './experience';
import { colliderSize } from './aiming';
const READY_PROJECTILE_SCALE = 0.05;

export function AimingReadyProjectile({
  projectile,
  visible,
  ...props
}: TemplateProps & {
  projectile: ExperienceObject;
  visible: boolean;
}) {
  const scene = React.useContext(AimingSceneContext);
  const { game, onEvent } = props;
  const distance = props.game.settings!.projectile.spawnDistance;
  const hintVisible = scene?.tapVisible !== false;

  React.useEffect(() => {
    onEvent?.({
      type: 'aiming',
      gameId: game.id,
      name: 'projectileHint',
      data: { visible: hintVisible },
    });
  }, [hintVisible, game.id, onEvent]);

  const content = visible && hintVisible ? (
    <>
      <ViroNode viroTag="aiming-ready-projectile" position={[0, 0, -distance]}>
        <SceneObject
          {...props}
          onEvent={undefined}
          onClickState={scene?.onClickState}
          object={{
            ...projectile,
            properties: {
              ...projectile.properties,
              position: [0, colliderSize(projectile.properties.collider!)[1] / 2, 0],
              rotation: [0, 0, 0],
              scale: (projectile.properties.scale || [1, 1, 1]).map(
                value => value * READY_PROJECTILE_SCALE,
              ) as Vector3,
              physics: undefined,
              animation: undefined,
              collectible: false,
            },
          }}
        />
      </ViroNode>
    </>
  ) : null;
  // Native camera parenting keeps the held object centered without JS pose updates.
  return props.mode === 'ar'
    ? <ViroARCamera>{content}</ViroARCamera>
    : <ViroCamera active>{content}</ViroCamera>;
}
