import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The words these sections have to say as descriptors already.
 *
 * Every other string in the form and name-generator sections is still an
 * English constant, and converting them is their own piece of work. These are
 * the ones that cannot wait for it: the shared components the sections mount
 * take a `MessageDescriptor` rather than a phrase — `SectionCapability`'s
 * `confirmClear`, a list's `itemLabel` — because the sentence each goes into
 * is formatted where it is READ, and a caller that resolved it to English
 * first would put an English clause in a Spanish sentence.
 *
 * Declared together rather than beside each section, so the partial state is
 * one file a reader can see the whole of, and the conversion that finishes
 * these sections moves whole areas out of here at once. The ids are the ones
 * `ID_MAP.md` reserves for these sections, so nothing has to be renamed then —
 * and a renamed id is a translation silently orphaned.
 */
export const sectionMessages = defineMessages({
  alterLimitsClearTitle: {
    id: 'protocolBuilder.alterLimits.clearTitle',
    defaultMessage: 'This will clear your nomination limits',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that caps how many people one stage of an interview may name.',
  },
  alterLimitsClearDescription: {
    id: 'protocolBuilder.alterLimits.clearDescription',
    defaultMessage:
      'This will clear the minimum and maximum number of people this stage may name. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching off the nomination limits discards both ends of the range. A stage is one step of an interview.',
  },
  alterLimitsClearConfirm: {
    id: 'protocolBuilder.alterLimits.clearConfirm',
    defaultMessage: 'Clear limits',
    description:
      'Action that confirms switching the nomination limits off and discarding them.',
  },

  cardDisplayClearTitle: {
    id: 'protocolBuilder.cardDisplay.clearTitle',
    defaultMessage: 'This will clear the card details',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that chooses what the cards in a roster show about each person.',
  },
  cardDisplayClearDescription: {
    id: 'protocolBuilder.cardDisplay.clearDescription',
    defaultMessage:
      'This will remove every extra attribute your roster cards show, along with the labels you gave them. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching off the card details discards the chosen attributes and their labels. A roster is a list of people imported from a data file; an attribute is one field the protocol records about a person.',
  },
  cardDisplayClearConfirm: {
    id: 'protocolBuilder.cardDisplay.clearConfirm',
    defaultMessage: 'Clear card details',
    description:
      'Action that confirms switching the roster card details off and discarding them.',
  },

  nodePanelsClearTitle: {
    id: 'protocolBuilder.nodePanels.clearTitle',
    defaultMessage: 'This will delete your side panels',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that adds panels of people beside a name generator for the participant to nominate from.',
  },
  nodePanelsClearDescription: {
    id: 'protocolBuilder.nodePanels.clearDescription',
    defaultMessage:
      'This will remove every side panel on this stage, and delete any filter rules you have created for them. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching off the side panels discards the panels and the filter rules written for them. A stage is one step of an interview.',
  },
  nodePanelsClearConfirm: {
    id: 'protocolBuilder.nodePanels.clearConfirm',
    defaultMessage: 'Remove panels',
    description:
      'Action that confirms switching the side panels off and deleting them.',
  },
  nodePanelsItemNoun: {
    id: 'protocolBuilder.nodePanels.itemNoun',
    defaultMessage: 'panel',
    description:
      'What one row of the side-panel list is called inside things said ABOUT it — "Edit panel", "Remove this panel?" — so it is lower case and singular. A side panel lists people beside a name generator for the participant to nominate from.',
  },

  searchOptionsClearTitle: {
    id: 'protocolBuilder.searchOptions.clearTitle',
    defaultMessage: 'This will turn off roster search',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that lets a participant search a roster.',
  },
  searchOptionsClearDescription: {
    id: 'protocolBuilder.searchOptions.clearDescription',
    defaultMessage:
      'This will remove the attributes a participant’s search is matched against, and the tolerance you set. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching roster search off discards the searchable attributes and the fuzziness setting. A roster is a list of people imported from a data file.',
  },
  searchOptionsClearConfirm: {
    id: 'protocolBuilder.searchOptions.clearConfirm',
    defaultMessage: 'Turn off search',
    description:
      'Action that confirms switching roster search off and discarding how it was configured.',
  },

  sortOptionsClearTitle: {
    id: 'protocolBuilder.sortOptions.clearTitle',
    defaultMessage: 'This will clear your sorting',
    description:
      'Title of the dialog asking a researcher to confirm switching off the section that decides the order a roster is shown in and what a participant may reorder it by.',
  },
  sortOptionsClearDescription: {
    id: 'protocolBuilder.sortOptions.clearDescription',
    defaultMessage:
      'This will remove the roster’s starting order and every attribute the participant could sort by. Do you want to continue?',
    description:
      'Body of the dialog confirming that switching roster sorting off discards both the starting order and the attributes offered to the participant. A roster is a list of people imported from a data file.',
  },
  sortOptionsClearConfirm: {
    id: 'protocolBuilder.sortOptions.clearConfirm',
    defaultMessage: 'Clear sorting',
    description:
      'Action that confirms switching roster sorting off and discarding it.',
  },
});
