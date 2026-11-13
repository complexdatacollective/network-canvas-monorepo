import { defineMessages } from '@codaco/app-i18n/messages';

export const nodeLabelWorkerMessages = defineMessages({
  title: {
    id: 'architect.nodeLabelWorker.title',
    defaultMessage: 'Node label worker',
    description:
      'Heading of the section on the Codebook page, and title of the dialog it opens, for the node label worker: a JavaScript function the researcher writes that decides the label shown on each node during an interview.',
  },
  description: {
    id: 'architect.nodeLabelWorker.description',
    defaultMessage:
      'A node label worker is a script that decides the label shown on each node during an interview. It can use the attributes of the node and the rest of the network. Without one, each node shows its standard label.',
    description:
      'Text under the Node label worker heading on the Codebook page, read by the researcher designing the protocol. The standard label is the one a node shows when there is no script, usually its name.',
  },
  add: {
    id: 'architect.nodeLabelWorker.add',
    defaultMessage: 'Add node label worker',
    description:
      'Button on the Codebook page that opens a dialog for writing a node label worker when the protocol has none. Add is a verb.',
  },
  edit: {
    id: 'architect.nodeLabelWorker.edit',
    defaultMessage: 'Edit script',
    description:
      'Button on the Codebook page that opens the dialog for changing the script of the node label worker the protocol already has. Edit is a verb.',
  },
  remove: {
    id: 'architect.nodeLabelWorker.remove',
    defaultMessage: 'Remove',
    description:
      'Button on the Codebook page that removes the node label worker from the protocol, after a confirmation. Also the label of the confirming button in that confirmation. A verb.',
  },
  removeTitle: {
    id: 'architect.nodeLabelWorker.removeTitle',
    defaultMessage: 'Remove the node label worker?',
    description:
      'Title of the confirmation shown when the researcher presses Remove beside the node label worker on the Codebook page.',
  },
  removeDescription: {
    id: 'architect.nodeLabelWorker.removeDescription',
    defaultMessage:
      'The script will be deleted, and nodes will show their standard labels again.',
    description:
      'Text of the confirmation shown before the node label worker is removed from the protocol. The script is the code the researcher wrote.',
  },
  script: {
    id: 'architect.nodeLabelWorker.script',
    defaultMessage: 'Script',
    description:
      'Label of the large text field in the node label worker dialog where the researcher writes JavaScript code. A noun.',
  },
  scriptHint: {
    id: 'architect.nodeLabelWorker.scriptHint',
    defaultMessage:
      'Write a JavaScript function named <code>nodeLabelWorker</code>. It is given a node and the whole network, and returns the label as text. The script cannot use the internet or read anything else on the device.',
    description:
      'Hint under the Script field in the node label worker dialog. The code tag wraps the exact function name the researcher must use, which is never translated. Text here means a string of characters.',
  },
  encryptedNote: {
    id: 'architect.nodeLabelWorker.encryptedNote',
    defaultMessage:
      'Encrypted attributes are never given to the script. A node whose standard label is encrypted keeps that label.',
    description:
      'Note in the node label worker dialog, under the hint for the Script field. Encrypted attributes are variables the researcher has marked to be encrypted during the interview.',
  },
  preview: {
    id: 'architect.nodeLabelWorker.preview',
    defaultMessage: 'Preview',
    description:
      'Heading of the pane beside the Script field in the node label worker dialog, which shows the labels the script gives to sample nodes. A noun.',
  },
  previewDescription: {
    id: 'architect.nodeLabelWorker.previewDescription',
    defaultMessage:
      'The labels your script gives to sample nodes made from this protocol.',
    description:
      'Text under the Preview heading in the node label worker dialog. The sample nodes are invented automatically from the stages and codebook of the protocol.',
  },
  previewChecking: {
    id: 'architect.nodeLabelWorker.previewChecking',
    defaultMessage: 'Checking the script…',
    description:
      'Status shown in the Preview pane of the node label worker dialog while the script the researcher typed is being run against the sample nodes.',
  },
  previewNoNodes: {
    id: 'architect.nodeLabelWorker.previewNoNodes',
    defaultMessage:
      'The script can be used, but there are no sample nodes to label. Add a stage that creates nodes to see a preview.',
    description:
      'Message in the Preview pane of the node label worker dialog when the script is valid but the protocol has no stage that would create nodes, so no sample nodes could be invented.',
  },
  noLabel: {
    id: 'architect.nodeLabelWorker.noLabel',
    defaultMessage: 'No label returned. The standard label is shown.',
    description:
      'Shown beside a sample node in the Preview pane of the node label worker dialog when the script returned nothing, or something that is not text, for that node.',
  },
  nodeError: {
    id: 'architect.nodeLabelWorker.nodeError',
    defaultMessage: 'Error: {error}. The standard label is shown.',
    description:
      'Shown beside a sample node in the Preview pane of the node label worker dialog when the script failed for that node. error is the error message from the JavaScript engine, in English.',
  },
  cannotBeUsed: {
    id: 'architect.nodeLabelWorker.cannotBeUsed',
    defaultMessage: 'This script cannot be used. {error}',
    description:
      'Error shown in the node label worker dialog, in the Preview pane and under the Script field when saving, when the script has a mistake that stops it from loading. error is the error message from the JavaScript engine, in English, ending with the line number.',
  },
  tookTooLong: {
    id: 'architect.nodeLabelWorker.tookTooLong',
    defaultMessage:
      'The script took too long to run and was stopped. In an interview, nodes would show their standard labels.',
    description:
      'Error shown in the Preview pane of the node label worker dialog when the script ran past its time limit, for example because of a loop that never ends.',
  },
  neverFinished: {
    id: 'architect.nodeLabelWorker.neverFinished',
    defaultMessage:
      'The script returned a promise that never finished. In an interview, nodes would show their standard labels.',
    description:
      'Error shown in the Preview pane of the node label worker dialog when the function returned a JavaScript promise that was never resolved. Promise is the JavaScript term.',
  },
  failed: {
    id: 'architect.nodeLabelWorker.failed',
    defaultMessage:
      'The script failed. {error} In an interview, nodes would show their standard labels.',
    description:
      'Error shown in the Preview pane of the node label worker dialog when the script stopped working for a reason other than a mistake in its code, running too long, or an unfinished promise. error is a full sentence from the JavaScript engine, in English.',
  },
});
