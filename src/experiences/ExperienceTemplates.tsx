import * as React from 'react';
import {
  ViroARImageMarker,
  ViroARTrackingTargets,
  ViroNode,
} from '@reactvision/react-viro';
import type {
  ExperienceEvent,
  ExperienceGame,
  ExperienceType,
} from './experience';
import { translate } from '../../constants/i18n';
import { ConfiguredAimingTemplate } from './AimingTemplate';
import { SceneObject } from './SceneObject';

export interface TemplateProps {
  game: ExperienceGame;
  mode: 'ar' | 'viewer';
  onEvent?: (event: ExperienceEvent) => void;
  onError: (message: string) => void;
}

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
  if (props.game.settings) return <ConfiguredAimingTemplate {...props} />;
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
