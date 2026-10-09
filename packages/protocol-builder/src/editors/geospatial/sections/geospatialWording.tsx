import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import type { StageSection } from '../../defineStageEditor.tsx';

export const geospatialWordingMessages = defineMessages({
  title: {
    id: 'protocolBuilder.geospatialWording.title',
    defaultMessage: 'Messages',
    description:
      'Heading of the section holding the words a map shows a participant: when it is offline, when it cannot be drawn, its outside-areas button, and its search. A map is a Geospatial stage.',
  },
  description: {
    id: 'protocolBuilder.geospatialWording.description',
    defaultMessage:
      'These start with wording Network Canvas supplies, which you can change. The search messages appear only when the map has a search.',
    description:
      'Description of the messages section of a map. Each message starts with wording Network Canvas supplies in each of the protocol’s languages that it has.',
  },
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
  searchLabelLabel: {
    id: 'protocolBuilder.geospatialWording.searchLabelLabel',
    defaultMessage: 'Search label',
    description:
      'Label of the field holding the search box’s placeholder on a map, which a screen reader also reads out.',
  },
  searchLabelHint: {
    id: 'protocolBuilder.geospatialWording.searchLabelHint',
    defaultMessage: 'The placeholder shown in the map’s search box.',
    description:
      'Guidance under the field holding the search box’s placeholder on a map.',
  },
  searchNoMatchLabel: {
    id: 'protocolBuilder.geospatialWording.searchNoMatchLabel',
    defaultMessage: 'No search results',
    description:
      'Label of the field holding the message shown when a map search matches nothing.',
  },
  searchNoMatchHint: {
    id: 'protocolBuilder.geospatialWording.searchNoMatchHint',
    defaultMessage: 'Shown when a search of the map matches nothing.',
    description:
      'Guidance under the field holding the map search’s no-match message.',
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

/** Whether the map has a search box, which its search messages are for. */
const ALLOW_SEARCH = 'mapOptions.allowSearch';

/**
 * The words a map shows a participant. The offline, unavailable and outside
 * areas messages are always shown; the search messages only with a search.
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
    <BuilderSection
      title={intl.formatMessage(geospatialWordingMessages.title)}
      description={intl.formatMessage(geospatialWordingMessages.description)}
    >
      {supplied !== undefined && (
        <>
          <Field<typeof LocalizedInputField>
            name="offlineNotice"
            component={LocalizedInputField}
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
            <>
              <Field<typeof LocalizedInputField>
                name="searchLabel"
                component={LocalizedInputField}
                label={intl.formatMessage(
                  geospatialWordingMessages.searchLabelLabel,
                )}
                hint={intl.formatMessage(
                  geospatialWordingMessages.searchLabelHint,
                )}
                initialValue={startingWording(
                  committedFields,
                  'searchLabel',
                  supplied,
                )}
                required={REQUIRED}
              />
              <Field<typeof LocalizedInputField>
                name="searchNoMatch"
                component={LocalizedInputField}
                label={intl.formatMessage(
                  geospatialWordingMessages.searchNoMatchLabel,
                )}
                hint={intl.formatMessage(
                  geospatialWordingMessages.searchNoMatchHint,
                )}
                initialValue={startingWording(
                  committedFields,
                  'searchNoMatch',
                  supplied,
                )}
                required={REQUIRED}
              />
              <Field<typeof LocalizedInputField>
                name="searchFailed"
                component={LocalizedInputField}
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
            </>
          )}
        </>
      )}
    </BuilderSection>
  );
}
