import * as React from 'react';
import {
  ViroARCamera,
  ViroCamera,
  ViroMaterials,
  ViroNode,
  ViroPolyline,
} from '@reactvision/react-viro';
import { AimingSceneContext } from './AimingScene';
import { SceneObject } from './SceneObject';
import type { TemplateProps } from './ExperienceTemplates';
import type { ExperienceObject, Vector3 } from './experience';

ViroMaterials.createMaterials({
  aimingGestureHint: {
    diffuseColor: '#FFFFFF',
    lightingModel: 'Constant',
    readsFromDepthBuffer: false,
    writesToDepthBuffer: false,
  },
});

const hand: Vector3[] = [
  [0, -0.8, 0], [0, 0, 0], [0.04, 0.08, 0], [0.16, 0.08, 0],
  [0.2, 0, 0], [0.2, -0.55, 0], [0.32, -0.48, 0],
  [0.43, -0.53, 0], [0.54, -0.53, 0], [0.65, -0.6, 0],
  [0.76, -0.6, 0], [0.87, -0.72, 0], [0.87, -1.15, 0],
  [0.7, -1.5, 0], [0.14, -1.5, 0], [-0.3, -0.98, 0],
  [-0.3, -0.85, 0], [-0.2, -0.78, 0], [0, -0.95, 0],
];
const arcs: Vector3[][] = [0.3, 0.48, 0.66].map(radius =>
  Array.from({ length: 25 }, (_, index): Vector3 => {
    const angle = ((20 + (140 * index) / 24) * Math.PI) / 180;
    return [0.1 + radius * Math.cos(angle), 0.04 + radius * Math.sin(angle), 0];
  }),
);

export function AimingReadyProjectile({
  projectile,
  visible,
  showHint,
  ...props
}: TemplateProps & {
  projectile: ExperienceObject;
  visible: boolean;
  showHint: boolean;
}) {
  const scene = React.useContext(AimingSceneContext);
  const distance = props.game.settings!.projectile.spawnDistance;
  const content = visible ? (
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
              physics: undefined,
              animation: undefined,
              collectible: false,
            },
          }}
        />
      </ViroNode>
      {showHint && (
        <ViroNode
          viroTag="aiming-gesture-hint"
          position={[distance * 0.08, -distance * 0.08, -distance * 0.85]}
          rotation={[0, 0, 35]}
          scale={[distance * 0.13, distance * 0.13, distance * 0.13]}
          ignoreEventHandling
        >
          {[hand, ...arcs].map((points, index) => (
            <ViroPolyline
              key={index}
              points={points}
              thickness={0.045}
              materials={['aimingGestureHint']}
              ignoreEventHandling
            />
          ))}
        </ViroNode>
      )}
    </>
  ) : null;
  // Native camera parenting keeps the held object centered without JS pose updates.
  return props.mode === 'ar'
    ? <ViroARCamera>{content}</ViroARCamera>
    : <ViroCamera active>{content}</ViroCamera>;
}
