import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import StageWordingSection from '../../../sections/supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import type { StageSection } from '../../defineStageEditor.tsx';

export const geospatialWordingMessages = defineMessages({
  outsideAreasLabel: {
    id: 'protocolBuilder.geospatialWording.outsideAreasLabel',
    defaultMessage: 'Outside selectable areas',
    description:
      'Label of the field holding the button that lets the participant choose a place outside the areas the map allows.',
  },
  outsideAreasHint: {
    id: 'protocolBuilder.geospatialWording.outsideAreasHint',
    defaultMessage:
      'The button that marks a place outside the areas the map allows.',
    description:
      'Guidance under the field holding the outside-areas button of a map.',
  },
});

const PATHS = ['outsideAreasLabel'];

/**
 * The words a map shows a participant that this stage holds: the button for a
 * place outside the map's areas. The notices every map shows alike (offline,
 * unavailable, a failed search) and its search's other words are the
 * protocol's interface text.
 */
export const geospatialWording = (): StageSection => () => (
  <GeospatialWordingSection />
);

function GeospatialWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording('Geospatial');

  return (
    <StageWordingSection stageType="Geospatial" paths={PATHS}>
      {supplied !== undefined && (
        <Field<typeof LocalizedInputField>
          name="outsideAreasLabel"
          component={LocalizedInputField}
          label={intl.formatMessage(
            geospatialWordingMessages.outsideAreasLabel,
          )}
          hint={intl.formatMessage(geospatialWordingMessages.outsideAreasHint)}
          initialValue={startingWording(
            committedFields,
            'outsideAreasLabel',
            supplied,
          )}
          required={REQUIRED}
        />
      )}
    </StageWordingSection>
  );
}
