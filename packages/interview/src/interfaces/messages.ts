import { defineMessages } from '@codaco/app-i18n/messages';

/** Built-in interface controls. Protocol-authored labels and collected values remain literal. */
export const interfaceMessages = defineMessages({
  passphraseAccepted: {
    id: 'interview.interfaces.passphraseAccepted',
    defaultMessage: 'Passphrase accepted! Click "Next" to continue.',
    description:
      'Success message after the participant enters, on the anonymisation screen, the passphrase they chose earlier in the interview. Next refers to the interview navigation arrow.',
  },
  confirmPassphrase: {
    id: 'interview.interfaces.confirmPassphrase',
    defaultMessage: 'Confirm Passphrase',
    description:
      'Label of the second anonymisation password field; this is confirmation of the passphrase, not a separate password.',
  },
  discardChangesTitle: {
    id: 'interview.interfaces.discardChangesTitle',
    defaultMessage: 'Discard changes?',
    description:
      'Title of the warning shown when a participant tries to leave a form containing invalid unsaved answers.',
  },
  discardChangesDescription: {
    id: 'interview.interfaces.discardChangesDescription',
    defaultMessage: 'Do you want to discard your changes?',
    description:
      'Question asked when leaving a form with invalid unsaved answers. Continuing resets the form, so its unsaved changes will be lost.',
  },
  externalDataError: {
    id: 'interview.interfaces.externalDataError',
    defaultMessage: 'External data could not be loaded.',
    description:
      'Shown under the error heading when a list of people from a file the study provides could not be loaded.',
  },
  dontKnow: {
    id: 'interview.interfaces.dontKnow',
    defaultMessage: 'Don’t know',
    description:
      'Answer option a participant picks when they do not know the answer to a question about a family member, such as whether twins are identical.',
  },
  pauseLayout: {
    id: 'interview.interfaces.pauseLayout',
    defaultMessage: 'Pause automatic layout',
    description:
      'Tooltip and accessible name of the toggle that stops the people on a network diagram from moving into place by themselves.',
  },
  resumeLayout: {
    id: 'interview.interfaces.resumeLayout',
    defaultMessage: 'Resume automatic layout',
    description:
      'Tooltip and accessible name of the toggle that lets the people on a network diagram move into place by themselves again.',
  },
  addNamePlaceholder: {
    id: 'interview.interfaces.addNamePlaceholder',
    defaultMessage: 'Type a name, then press Enter',
    description:
      'Placeholder in the network-composer name field; pressing Enter adds the named item.',
  },
  quickAddHint: {
    id: 'interview.interfaces.quickAddHint',
    defaultMessage: 'Press Enter when you are finished.',
    description:
      'Tooltip that opens over the quick-add name field after about five seconds without typing, until the first name is added, telling the participant how to add what they typed.',
  },
  overtakenEditNotice: {
    id: 'interview.interfaces.overtakenEditNotice',
    defaultMessage:
      'Undo or redo changed an answer while you were editing it, so your edit has not been saved. To keep your edit, change that answer again. If you continue, your edit will be lost.',
    description:
      'Explanation in the Discard changes dialog shown as the interviewer leaves a network-composer form whose answer an undo or redo changed while they were editing it.',
  },
  composerGroups: {
    id: 'interview.interfaces.composerGroups',
    defaultMessage: 'Groups',
    description:
      'Name of the network-composer tool that puts nodes in groups, shown in its tooltip and read as its accessible name.',
  },
  composerAddNode: {
    id: 'interview.interfaces.composerAddNode',
    defaultMessage: 'Add node',
    description:
      'Accessible name and tooltip of the network-composer tool that adds a node.',
  },
  composerAutomaticLayout: {
    id: 'interview.interfaces.composerAutomaticLayout',
    defaultMessage: 'Automatic layout',
    description:
      'Accessible name and tooltip of the network-composer toggle that lays the nodes out automatically.',
  },
  composerDrawEdge: {
    id: 'interview.interfaces.composerDrawEdge',
    defaultMessage: 'Draw edge',
    description:
      'Accessible name and tooltip of the network-composer tool that draws an edge between two nodes.',
  },
  toggleDrawing: {
    id: 'interview.interfaces.toggleDrawing',
    defaultMessage: 'Toggle drawing',
    description:
      'Accessible name and tooltip of the Narrative button that turns drawing on the canvas on and off.',
  },
  toggleFreezing: {
    id: 'interview.interfaces.toggleFreezing',
    defaultMessage: 'Toggle freezing annotations',
    description:
      'Accessible name and tooltip of the Narrative button that freezes what has been drawn so it stays put, and unfreezes it.',
  },
  resetAnnotations: {
    id: 'interview.interfaces.resetAnnotations',
    defaultMessage: 'Reset annotations',
    description:
      'Accessible name and tooltip of the Narrative button that clears everything drawn on the canvas.',
  },
  mapOffline: {
    id: 'interview.interfaces.mapOffline',
    defaultMessage:
      'You are offline — the map will not load until you reconnect.',
    description:
      'Notice over a Geospatial map while the device is offline and the map cannot load.',
  },
  mapUnavailable: {
    id: 'interview.interfaces.mapUnavailable',
    defaultMessage:
      'This can happen if your browser or device does not support the features the map requires (for example, WebGL). Try a different browser or device, or contact the study organizer. You may be able to continue your interview by selecting the next arrow.',
    description:
      'Explanation shown when a Geospatial map cannot be drawn at all.',
  },
  searchFailed: {
    id: 'interview.interfaces.searchFailed',
    defaultMessage: 'Search could not be completed. Try again in a moment.',
    description:
      'Notice under the Geospatial map search when a search could not run.',
  },
  undo: {
    id: 'interview.interfaces.undo',
    defaultMessage: 'Undo',
    description:
      'Name of the family pedigree toolbar button that reverses the most recent change, shown in its tooltip.',
  },
  redo: {
    id: 'interview.interfaces.redo',
    defaultMessage: 'Redo',
    description:
      'Name of the family pedigree toolbar button that makes again a change that was undone, shown in its tooltip.',
  },
  binSelectPlaceHere: {
    id: 'interview.interfaces.binSelectPlaceHere',
    defaultMessage: 'Place here',
    description:
      'Button inside an opened group on a sorting screen that puts the item the participant is placing (usually a person) into that group.',
  },
  zoomIn: {
    id: 'interview.interfaces.zoomIn',
    defaultMessage: 'Zoom in',
    description:
      'Name of the family tree toolbar button that increases magnification, on the Family Pedigree and Narrative Pedigree stages, shown in its tooltip. Sentence case.',
  },
  zoomOut: {
    id: 'interview.interfaces.zoomOut',
    defaultMessage: 'Zoom out',
    description:
      'Name of the family tree toolbar button that decreases magnification, on the Family Pedigree and Narrative Pedigree stages, shown in its tooltip. Sentence case.',
  },
});
