import * as React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import {
  Viro3DSceneNavigator,
  ViroAmbientLight,
  ViroDirectionalLight,
  ViroNode,
  ViroScene,
} from '@reactvision/react-viro';
import { ExperienceContent } from './ExperienceTemplates';
import type { Experience, ExperienceEvent } from './experience';
import { AimingSceneContext, useAimingScene } from './AimingScene';

interface ViewerProps {
  experience: Experience;
  gameIndex: number;
  onEvent?: (event: ExperienceEvent) => void;
  onError: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}

class ExperienceScene extends ViroScene {
  render() {
    const { sceneNavigator } = this.props as React.ComponentProps<
      typeof ViroScene
    > & {
      sceneNavigator?: { viroAppProps: ViewerProps };
    };
    const props = sceneNavigator?.viroAppProps;
    if (!props) return <ViroScene />;
    return <ViewerContent {...props} />;
  }
}

function ViewerContent(props: ViewerProps) {
  const game = props.experience.games[props.gameIndex];
  const aimingScene = useAimingScene('viewer');
  return (
    <AimingSceneContext.Provider value={aimingScene.value}>
      <ViroScene
        physicsWorld={{
          gravity: props.experience.gravity,
          drawBounds: __DEV__ && !!game.settings,
        }}
        onCameraTransformUpdate={aimingScene.onCameraTransformUpdate}
        onClickState={aimingScene.onClickState}
      >
        <ViroAmbientLight color="#FFFFFF" intensity={400} />
        <ViroDirectionalLight
          color="#FFFFFF"
          direction={[0, -1, -1]}
          intensity={600}
        />
        <ViroNode position={game.settings ? [0, 0, 0] : [0, 0, -2]}>
          <ExperienceContent
            key={game.id}
            game={game}
            mode="viewer"
            onEvent={props.onEvent}
            onError={props.onError}
          />
        </ViroNode>
      </ViroScene>
    </AimingSceneContext.Provider>
  );
}

// Viro's 3D navigator renders a class but declares a scene instance.
const initialScene = { scene: ExperienceScene as unknown as ViroScene };

export default function ExperienceViewer(props: ViewerProps) {
  return (
    <Viro3DSceneNavigator
      style={props.style}
      initialScene={initialScene}
      viroAppProps={props}
    />
  );
}
