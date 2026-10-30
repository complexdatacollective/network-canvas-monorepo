import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import StageWordingSection from '../../../sections/supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import type { StageSection } from '../../defineStageEditor.tsx';

export const geospatialWordingMessages = defineMessages({
  offlineLabel: {
    id: 'protocolBuilder.geospatialWording.offlineLabel',
    defaultMessage: 'Offline',
    description:
      'Label of the field holding the message shown while the device is offline and the map cannot load.',
  },
  offlineHint: {
    id: 'protocolBuilder.geospatialWording.offlineHint',
    defaultMessage:
      'Shown while the device is offline, because the map cannot load without a connection.',
    description:
      'Guidance under the field holding the offline message of a map.',
  },
  unavailableLabel: {
    id: 'protocolBuilder.geospatialWording.unavailableLabel',
    defaultMessage: 'Map unavailable',
    description:
      'Label of the field holding the message shown when the map cannot be drawn on the participant’s device.',
  },
  unavailableHint: {
    id: 'protocolBuilder.geospatialWording.unavailableHint',
    defaultMessage:
      'Shown in place of the map when it cannot be drawn, and says what to try.',
    description:
      'Guidance under the field holding the message shown when a map cannot be drawn.',
  },
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
  searchFailedLabel: {
    id: 'protocolBuilder.geospatialWording.searchFailedLabel',
    defaultMessage: 'Search failed',
    description:
      'Label of the field holding the message shown when a map search could not run.',
  },
  searchFailedHint: {
    id: 'protocolBuilder.geospatialWording.searchFailedHint',
    defaultMessage:
      'Shown when a search could not run. It does not mean the place does not exist.',
    description:
      'Guidance under the field holding the message shown when a map search could not run.',
  },
});

/** The settings the section shows whatever the map's configuration. */
const ALWAYS_SHOWN = ['offlineNotice', 'mapUnavailable', 'outsideAreasLabel'];

/** Whether the map has a search box, which its search messages are for. */
const ALLOW_SEARCH = 'mapOptions.allowSearch';

/**
 * The words a map shows a participant. The offline, unavailable and outside
 * areas messages are always shown; the failed-search message only with a
 * search, whose other words are the protocol's interface text.
 */
export const geospatialWording = (): StageSection => () => (
  <GeospatialWordingSection />
);

function GeospatialWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording('Geospatial');
  const allowSearch = useStageValue(ALLOW_SEARCH) === true;

  return (
    <StageWordingSection
      stageType="Geospatial"
      paths={allowSearch ? [...ALWAYS_SHOWN, 'searchFailed'] : ALWAYS_SHOWN}
    >
      {supplied !== undefined && (
        <>
          <Field<typeof LocalizedInputField>
            name="offlineNotice"
            component={LocalizedInputField}
            wraps
            label={intl.formatMessage(geospatialWordingMessages.offlineLabel)}
            hint={intl.formatMessage(geospatialWordingMessages.offlineHint)}
            initialValue={startingWording(
              committedFields,
              'offlineNotice',
              supplied,
            )}
            required={REQUIRED}
          />
          <Field<typeof LocalizedInputField>
            name="mapUnavailable"
            component={LocalizedInputField}
            wraps
            label={intl.formatMessage(
              geospatialWordingMessages.unavailableLabel,
            )}
            hint={intl.formatMessage(geospatialWordingMessages.unavailableHint)}
            initialValue={startingWording(
              committedFields,
              'mapUnavailable',
              supplied,
            )}
            required={REQUIRED}
          />
          <Field<typeof LocalizedInputField>
            name="outsideAreasLabel"
            component={LocalizedInputField}
            label={intl.formatMessage(
              geospatialWordingMessages.outsideAreasLabel,
            )}
            hint={intl.formatMessage(
              geospatialWordingMessages.outsideAreasHint,
            )}
            initialValue={startingWording(
              committedFields,
              'outsideAreasLabel',
              supplied,
            )}
            required={REQUIRED}
          />
          {allowSearch && (
            <Field<typeof LocalizedInputField>
              name="searchFailed"
              component={LocalizedInputField}
              wraps
              label={intl.formatMessage(
                geospatialWordingMessages.searchFailedLabel,
              )}
              hint={intl.formatMessage(
                geospatialWordingMessages.searchFailedHint,
              )}
              initialValue={startingWording(
                committedFields,
                'searchFailed',
                supplied,
              )}
              required={REQUIRED}
            />
          )}
        </>
      )}
    </StageWordingSection>
  );
}
