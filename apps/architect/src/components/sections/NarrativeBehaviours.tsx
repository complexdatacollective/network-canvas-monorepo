import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  narrativeBehaviors: {
    id: 'architect.sections.narrativeBehaviours.narrativeBehaviors',
    defaultMessage: 'Narrative behaviors',
    description:
      'The title text in components / sections / NarrativeBehaviours.',
  },
  controlAutomaticLayoutDrawingAndNode: {
    id: 'architect.sections.narrativeBehaviours.controlAutomaticLayoutDrawingAndNode',
    defaultMessage:
      'Control automatic layout, drawing, and node repositioning on the narrative canvas.',
    description:
      'The description text in components / sections / NarrativeBehaviours.',
  },
  automaticLayout: {
    id: 'architect.sections.narrativeBehaviours.automaticLayout',
    defaultMessage: 'Automatic layout',
    description:
      'The label text in components / sections / NarrativeBehaviours.',
  },
  positionNodesAutomaticallyUsingAForceDirected: {
    id: 'architect.sections.narrativeBehaviours.positionNodesAutomaticallyUsingAForceDirected',
    defaultMessage:
      'Position nodes automatically using a force-directed layout',
    description:
      'The hint text in components / sections / NarrativeBehaviours.',
  },
  freeDraw: {
    id: 'architect.sections.narrativeBehaviours.freeDraw',
    defaultMessage: 'Free-draw',
    description:
      'The label text in components / sections / NarrativeBehaviours.',
  },
  allowDrawingOnTheCanvas: {
    id: 'architect.sections.narrativeBehaviours.allowDrawingOnTheCanvas',
    defaultMessage: 'Allow drawing on the canvas',
    description:
      'The hint text in components / sections / NarrativeBehaviours.',
  },
  allowRepositioning: {
    id: 'architect.sections.narrativeBehaviours.allowRepositioning',
    defaultMessage: 'Allow repositioning',
    description:
      'The label text in components / sections / NarrativeBehaviours.',
  },
  allowNodesToBeRepositioned: {
    id: 'architect.sections.narrativeBehaviours.allowNodesToBeRepositioned',
    defaultMessage: 'Allow nodes to be repositioned',
    description:
      'The hint text in components / sections / NarrativeBehaviours.',
  },
});

const NarrativeBehaviours = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const initialAutomaticLayout = useStageInitialValue<boolean>(
    'behaviours.automaticLayout',
  );
  const initialFreeDraw = useStageInitialValue<boolean>('behaviours.freeDraw');
  const initialAllowRepositioning = useStageInitialValue<boolean>(
    'behaviours.allowRepositioning',
  );
  return (
    <Section
      title={intl.formatMessage(messages.narrativeBehaviors)}
      description={intl.formatMessage(
        messages.controlAutomaticLayoutDrawingAndNode,
      )}
    >
      <ArchitectField
        name="behaviours.automaticLayout"
        label={intl.formatMessage(messages.automaticLayout)}
        hint={intl.formatMessage(
          messages.positionNodesAutomaticallyUsingAForceDirected,
        )}
        component={ToggleField}
        inline
        initialValue={initialAutomaticLayout ?? false}
      />
      <ArchitectField
        name="behaviours.freeDraw"
        label={intl.formatMessage(messages.freeDraw)}
        hint={intl.formatMessage(messages.allowDrawingOnTheCanvas)}
        component={ToggleField}
        inline
        initialValue={initialFreeDraw ?? false}
      />
      <ArchitectField
        name="behaviours.allowRepositioning"
        label={intl.formatMessage(messages.allowRepositioning)}
        hint={intl.formatMessage(messages.allowNodesToBeRepositioned)}
        component={ToggleField}
        inline
        initialValue={initialAllowRepositioning ?? false}
      />
    </Section>
  );
};
export default NarrativeBehaviours;
