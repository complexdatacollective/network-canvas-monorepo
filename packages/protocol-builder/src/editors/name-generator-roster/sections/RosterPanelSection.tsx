import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import { LocalizedInputField } from '../../../fields/LocalizedStringField.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { nodePanelsMessages } from '../../../sections/panels/NodePanelsSection.tsx';

/** Where a roster stage keeps the heading above the people it offers. */
const PANEL_TITLE_FIELD = 'panelTitle';

const rosterPanelMessages = defineMessages({
  title: {
    id: 'protocolBuilder.rosterPanel.title',
    defaultMessage: 'Roster panel',
    description:
      'Heading of the section naming the panel that lists the people a participant can add from a roster. A roster is a list of people imported from a data file.',
  },
  description: {
    id: 'protocolBuilder.rosterPanel.description',
    defaultMessage:
      'Name the list of people participants choose from. It starts with wording Network Canvas supplies, which you can change.',
    description:
      'Description of the roster-panel section. The panel title starts with supplied wording in each of the protocol’s languages that Network Canvas has it in.',
  },
  panelTitleHint: {
    id: 'protocolBuilder.rosterPanel.panelTitleHint',
    defaultMessage:
      'Shown above the list of people participants can add to their network.',
    description: 'Guidance under the box holding the roster panel’s title.',
  },
});

const PANEL_TITLE_REQUIRED = createMessageError(
  nodePanelsMessages.panelTitleRequired,
);

/**
 * The heading above the people a roster offers. The roster IS the stage's one
 * panel, so it has a title like a name generator's side panel, but no source
 * or filter of its own: those are the data file and the card sections.
 */
export default function RosterPanelSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(rosterPanelMessages.title)}
      description={intl.formatMessage(rosterPanelMessages.description)}
    >
      <Field<typeof LocalizedInputField>
        name={PANEL_TITLE_FIELD}
        component={LocalizedInputField}
        label={intl.formatMessage(nodePanelsMessages.panelTitleLabel)}
        hint={intl.formatMessage(rosterPanelMessages.panelTitleHint)}
        required={PANEL_TITLE_REQUIRED}
      />
    </BuilderSection>
  );
}
