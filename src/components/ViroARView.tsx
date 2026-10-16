/**
 * Viro AR scene for nearby memory droplets and selected experience templates.
 */
import * as React from 'react';
import {
  ViroARScene,
  ViroARSceneNavigator,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroNode,
  ViroMaterials,
  ViroSphere,
} from '@reactvision/react-viro';
import { ViroARViewProps } from './ViroAR.types';
import { ExperienceContent } from '../experiences/ExperienceTemplates';
import { AimingSceneContext, useAimingScene } from '../experiences/AimingScene';

// In Viro 3.x, transparency is handled by setting the opacity prop on the component
// rather than in the material definition if transparencyMode isn't available.
ViroMaterials.createMaterials({
  planeMaterial: { diffuseColor: '#FFFFFF', lightingModel: 'Lambert' },
  blueDroplet: {
    diffuseColor: '#0000FF',
    lightingModel: 'Lambert',
    shininess: 0.5,
  },
  pinkDroplet: {
    diffuseColor: '#FF69B4',
    lightingModel: 'Lambert',
    shininess: 0.5,
  },
  orangeDroplet: {
    diffuseColor: '#FFA500',
    lightingModel: 'Lambert',
    shininess: 0.5,
  },
});

function MemoryARScene({
  sceneNavigator,
}: {
  sceneNavigator?: { viroAppProps: ViroARViewProps };
} = {}) {
  const {
    arMemories,
    onMemorySelected,
    experience,
    experienceGameIndex = 0,
    onExperienceEvent,
    onExperienceError,
  } = sceneNavigator?.viroAppProps || {};
  const game = experience?.games[experienceGameIndex];
  const aimingScene = useAimingScene('ar');

  return (
    <AimingSceneContext.Provider value={aimingScene.value}>
      <ViroARScene
        anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']}
        physicsWorld={{ gravity: experience?.gravity || [0, -9.81, 0] }}
        onTrackingUpdated={aimingScene.onTrackingUpdated}
        onCameraTransformUpdate={aimingScene.onCameraTransformUpdate}
        onClick={aimingScene.onClick}
      >
        <ViroAmbientLight color="#FFFFFF" intensity={500} />
        <ViroDirectionalLight
          color="#FFFFFF"
          direction={[0, -1, -0.5]}
          intensity={800}
        />

        {/* RENDER MEMORY DROPLETS */}
        {!game &&
          (arMemories || []).map(memory => {
            let material = 'pinkDroplet';
            if (memory.user_id === 1 || memory.created_by === 1) {
              material = 'orangeDroplet';
            } else if (memory.isOwn) {
              material = 'blueDroplet';
            }

            return (
              <ViroNode
                key={memory.id}
                position={memory.relativePosition || [0, 0, 0]}
                onClick={() =>
                  onMemorySelected?.({
                    nativeEvent: { id: memory.id, name: memory.name },
                  })
                }
              >
                {/* Droplet: 8cm radius = 0.08m, opacity 0.5 for translucency */}
                <ViroSphere
                  radius={0.08}
                  materials={[material]}
                  opacity={0.5}
                  onClick={() =>
                    onMemorySelected?.({
                      nativeEvent: { id: memory.id, name: memory.name },
                    })
                  }
                />
              </ViroNode>
            );
          })}
        {game && (
          <ViroNode
            position={
              game.type === 'images' || game.aiming ? [0, 0, 0] : [0, 0, -2]
            }
          >
            <ExperienceContent
              key={game.id}
              game={game}
              mode="ar"
              onEvent={onExperienceEvent}
              onError={onExperienceError || console.error}
            />
          </ViroNode>
        )}
      </ViroARScene>
    </AimingSceneContext.Provider>
  );
}

export default function ViroARView(props: ViroARViewProps) {
  return (
    <ViroARSceneNavigator
      {...props}
      autofocus={true}
      videoQuality="High"
      worldAlignment="GravityAndHeading"
      hdrEnabled={true}
      viroAppProps={props}
      initialScene={initialScene}
    />
  );
}

const initialScene = { scene: MemoryARScene };
