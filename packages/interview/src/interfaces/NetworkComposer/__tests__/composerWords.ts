/**
 * The settings a Network Composer stage holds for its wording. Network Canvas
 * supplies these defaults; the tests use them as a protocol would.
 */
export const OVERTAKEN_EDIT_NOTICE =
  'Undo or redo changed an answer while you were editing it, so your edit has not been saved. To keep your edit, change that answer again. If you continue, your edit will be lost.';

export const composerWords = () => ({
  addNamePlaceholder: { en: 'Type a name, then press Enter' },
  overtakenEditNotice: { en: OVERTAKEN_EDIT_NOTICE },
  groupsHeading: { en: 'Groups' },
  tooltips: {
    addPerson: { en: 'Add node' },
    automaticLayout: { en: 'Automatic layout' },
    drawConnection: { en: 'Draw edge' },
  },
});
