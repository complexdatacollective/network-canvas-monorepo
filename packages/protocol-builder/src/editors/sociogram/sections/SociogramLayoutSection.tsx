import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { Stage } from '@codaco/protocol-validation';

import LayoutPickerField from '../../../fields/LayoutPickerField.tsx';
import UnreachableLayoutAlert, {
  useUnreachableLayoutTypes,
} from '../../../fields/UnreachableLayoutAlert.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useStageNodeTypes } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import type { StageSection } from '../../defineStageEditor.tsx';

const LAYOUT_FIELD = 'layout';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.sociogram.layoutTitle',
    defaultMessage: 'Layout',
    description:
      'Heading of the sociogram stage section choosing the layout that stores where the participant places each node. A layout is a named set of positions in the codebook.',
  },
  description: {
    id: 'protocolBuilder.sociogram.layoutDescription',
    defaultMessage:
      "Stores each node's position on the canvas. Every prompt of this stage uses this layout. Choosing the same layout in other stages keeps positions as the participant moves between tasks.",
    description:
      'Description of the sociogram stage section choosing its layout. A prompt is one task of the stage. A stage is one step of an interview, so choosing one layout in several stages carries the participant’s placements from one step to the next.',
  },
  label: {
    id: 'protocolBuilder.sociogram.layoutLabel',
    defaultMessage: 'Layout',
    description:
      'Label of the control choosing the layout of the codebook that this sociogram stage stores node positions in.',
  },
});

/**
 * The saved Sociogram with the layout and node types being edited: whether
 * it reads or sets its layout depends on the rest of the saved stage. A
 * stage not saved yet is not judged.
 */
function useDraftSociogram(): Stage | undefined {
  const { identity } = useStageEditorForm();
  const { orderedStages } = useProtocolContext();
  const layout = useStageValue(LAYOUT_FIELD);
  const nodeTypes = useStageNodeTypes();
  return useMemo(() => {
    const saved = orderedStages.find((stage) => stage.id === identity.id);
    const [first, ...rest] = nodeTypes;
    if (
      saved?.type !== 'Sociogram' ||
      typeof layout !== 'string' ||
      first === undefined
    ) {
      return undefined;
    }
    return {
      ...saved,
      layout,
      subject: { entity: 'node', types: [first, ...rest] },
    };
  }, [identity.id, layout, nodeTypes, orderedStages]);
}

function SociogramLayoutSection() {
  const intl = useAppIntl();
  const draft = useDraftSociogram();
  const unreachable = useUnreachableLayoutTypes(draft);

  return (
    <BuilderSection
      sectionKey="sociogram-layout"
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
    >
      <Field<typeof LayoutPickerField>
        name={LAYOUT_FIELD}
        component={LayoutPickerField}
        label={intl.formatMessage(messages.label)}
        required={REQUIRED}
      />
      {draft?.type === 'Sociogram' && (
        <UnreachableLayoutAlert
          layoutId={draft.layout}
          nodeTypes={unreachable}
        />
      )}
    </BuilderSection>
  );
}

/** The layout every prompt of a sociogram places nodes in. */
export const sociogramLayout = (): StageSection => () => (
  <SociogramLayoutSection />
);
