/**
 * Viro/ARCore scene: renders planes, memory droplets, and selected memory content.
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

// In Viro 3.x, transparency is handled by setting the opacity prop on the component
// rather than in the material definition if transparencyMode isn't available.
ViroMaterials.createMaterials({
  planeMaterial: { diffuseColor: '#FFFFFF', lightingModel: 'Lambert' },
  blueDroplet: { diffuseColor: '#0000FF', lightingModel: 'Lambert', shininess: 0.5 },
  pinkDroplet: { diffuseColor: '#FF69B4', lightingModel: 'Lambert', shininess: 0.5 },
  orangeDroplet: { diffuseColor: '#FFA500', lightingModel: 'Lambert', shininess: 0.5 },
});

function MemoryARScene(props: any) {
  const {
    arMemories,
    onMemorySelected,
  } = props.viroAppProps;

  return (
    <ViroARScene
      anchorDetectionTypes={['PlanesHorizontal', 'PlanesVertical']}
      onTrackingUpdated={(state: any, reason: any) => {
        console.log(`[AR Tracking] State: ${state}, Reason: ${reason}`);
      }}
    >
      <ViroAmbientLight color="#FFFFFF" intensity={500} />
      <ViroDirectionalLight color="#FFFFFF" direction={[0, -1, -0.5]} intensity={800} />

      {/* RENDER MEMORY DROPLETS */}
      {(arMemories || []).map((memory: any) => {
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
            onClick={() => onMemorySelected && onMemorySelected({ nativeEvent: { id: memory.id } })}
          >
            {/* Droplet: 8cm radius = 0.08m, opacity 0.5 for translucency */}
            <ViroSphere
              radius={0.08}
              materials={[material]}
              opacity={0.5}
              onClick={() => onMemorySelected && onMemorySelected({ nativeEvent: { id: memory.id } })}
            />
          </ViroNode>
        );
      })}
    </ViroARScene>
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
      initialScene={{ scene: () => <MemoryARScene viroAppProps={props} /> }}
    />
  );
}
