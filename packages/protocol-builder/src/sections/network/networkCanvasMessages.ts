import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The canvas sections' copy that leaves this family and is rendered elsewhere.
 *
 * These are the words a shared component says on this family's behalf: the
 * confirmation `BuilderSection` shows before a capability is switched off, the
 * noun `DialogArrayField` builds its row affordances and refusals around, and
 * the sentences `PromptsSection` puts in place of its own generic ones. All of
 * them are declared here as descriptors rather than handed over as strings —
 * a string crossing that seam is invisible to `extractMessages`, absent from
 * the catalogs and covered by no guard, so the words a family cared enough to
 * write for itself would be the only words left untranslated.
 *
 * Only the copy that has already crossed a converted seam is here. The rest of
 * `sections/network/` still holds English `DEFAULT_COPY` literals and joins
 * this file when the family itself is converted; the area name is `networkCanvas`
 * either way, so nothing declared now has to be renamed then.
 */
export const networkCanvasMessages = defineMessages({
  nodeFormClearTitle: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearTitle',
    defaultMessage: 'This will delete the node form',
    description:
      'Title of the confirmation shown before a researcher switches off the form a Network Composer stage asks about each node. Switching it off discards the form, which is why it is confirmed.',
  },
  nodeFormClearDescription: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearDescription',
    defaultMessage:
      'Every field you have added to it will be removed, and the panel that opens when a participant selects a node will have nothing to ask.',
    description:
      'Body of the confirmation shown before the node form is switched off, saying what is lost. A field is one question the form asks; a node is one person or thing in the participant’s network.',
  },
  nodeFormClearConfirm: {
    id: 'protocolBuilder.networkCanvas.nodeFormClearConfirm',
    defaultMessage: 'Delete the form',
    description:
      'Button that confirms switching off the node form and discarding it.',
  },
  nodeFormFieldNoun: {
    id: 'protocolBuilder.networkCanvas.nodeFormFieldNoun',
    defaultMessage: 'node attribute field',
    description:
      'What one row of the node form’s list is called inside things said ABOUT it — "Edit node attribute field", "Remove this node attribute field?" — so it is lower case and singular. Qualified by "node" because the same stage editor shows a connection list beside it.',
  },
  edgeFormFieldNoun: {
    id: 'protocolBuilder.networkCanvas.edgeFormFieldNoun',
    defaultMessage: 'connection attribute field',
    description:
      'What one row of a connection form’s list is called inside things said ABOUT it, so it is lower case and singular. A connection is an edge — a relationship drawn between two people in the network.',
  },
  presetNoun: {
    id: 'protocolBuilder.networkCanvas.presetNoun',
    defaultMessage: 'preset',
    description:
      'What one row of the visualisation preset list is called inside things said ABOUT it — "Edit preset", "Remove this preset?" — so it is lower case and singular. A preset is one saved way of looking at the network.',
  },
  sociogramPromptsDescription: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsDescription',
    defaultMessage:
      'Write the tasks the participant works through on the canvas, and drag them into the order they do them.',
    description:
      'Description of the prompts section on a sociogram stage, which sets tasks performed on a canvas rather than asking questions to be answered in words. Replaces the generic prompts description.',
  },
  sociogramPromptsWaitingDescription: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsWaitingDescription',
    defaultMessage:
      'Choose what this stage works with before writing its prompts.',
    description:
      'Shown in place of the sociogram prompts description while the researcher has not yet chosen which node or edge type the stage is about, so there is nothing for a prompt to be written against.',
  },
  sociogramPromptsFieldHint: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsFieldHint',
    defaultMessage:
      'The participant works through these one at a time, in this order. Each one decides what the canvas shows and what tapping a node does.',
    description:
      'Guidance under the sociogram prompt list. The canvas is the drawing surface the participant arranges nodes on.',
  },
  sociogramPromptsEmptyState: {
    id: 'protocolBuilder.networkCanvas.sociogramPromptsEmptyState',
    defaultMessage:
      'No prompts yet. Create one to say what the participant does on the canvas.',
    description:
      'Shown in place of the sociogram prompt list while the stage sets no tasks yet.',
  },
});
