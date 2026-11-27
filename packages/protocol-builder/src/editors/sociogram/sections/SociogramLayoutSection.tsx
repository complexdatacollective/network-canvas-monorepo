import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import LayoutPickerField from '../../../fields/LayoutPickerField.tsx';
import UnreachableLayoutAlert, {
  useUnreachableLayoutTypes,
} from '../../../fields/UnreachableLayoutAlert.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import type { StageSection } from '../../defineStageEditor.tsx';
import { useDraftSociogram } from './useDraftSociogram.ts';

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
