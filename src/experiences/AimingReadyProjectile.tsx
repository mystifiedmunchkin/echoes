import * as React from 'react';
import {
  ViroARCamera,
  ViroCamera,
  ViroNode,
} from '@reactvision/react-viro';
import { AimingSceneContext } from './AimingScene';
import { SceneObject } from './SceneObject';
import type { TemplateProps } from './ExperienceTemplates';
import type { ExperienceObject } from './experience';
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
  const distance = props.game.settings!.projectile.spawnDistance;
  const hintVisible = scene?.tapVisible !== false;

  React.useEffect(() => {
    props.onEvent?.({
      type: 'aiming',
      gameId: props.game.id,
      name: 'projectileHint',
      data: { visible: hintVisible },
    });
  }, [hintVisible, props.game.id, props.onEvent]);

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
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: (projectile.properties.scale || [1, 1, 1]).map(
                value => value * READY_PROJECTILE_SCALE,
              ),
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
