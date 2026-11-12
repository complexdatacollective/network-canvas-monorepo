import { defineMessages } from '@codaco/app-i18n/message-errors';

/**
 * What Studio's resource host tells a researcher, in the cases only a host
 * that keeps the bytes can meet: its storage, and what it holds or no longer
 * holds. Everything a file can be refused for on its content is said in
 * `@codaco/protocol-builder`'s own words instead, the ones its editor uses for
 * the same refusal.
 *
 * Each one crosses the contract's string-only `ResourceGatewayFailure.message`
 * encoded (`createMessageError`), and the editor formats it in the reader's
 * language. The server never formats them, so they live here rather than in
 * the client, and the client's catalogue extraction collects this module.
 */
export const studioResourceFailureMessages = defineMessages({
  noStorage: {
    id: 'studio.resourceFailure.noStorage',
    defaultMessage:
      'This Studio has no file storage set up, so files cannot be added or opened. Ask whoever runs it to set up storage.',
    description:
      'Shown in the protocol editor when the Studio installation has no storage configured for protocol files (images, audio, video, rosters). "Whoever runs it" is the person or team that installed this Studio.',
  },
  notSaved: {
    id: 'studio.resourceFailure.notSaved',
    defaultMessage: 'The file could not be saved. Try again in a moment.',
    description:
      'Shown in the protocol editor when a file a researcher added could not be kept, for a reason that may pass.',
  },
  noCopy: {
    id: 'studio.resourceFailure.noCopy',
    defaultMessage:
      'Studio has no copy of this file. Import it again to use it here.',
    description:
      'Shown in the protocol editor in place of a file (an image, audio, video or roster) the protocol names but whose contents Studio does not have.',
  },
  importGone: {
    id: 'studio.resourceFailure.importGone',
    defaultMessage:
      'That import is no longer waiting to be added. Import the file again.',
    description:
      'Shown in the protocol editor when a researcher uses a file they imported earlier that has since been discarded, before it was added to the protocol.',
  },
  importEmpty: {
    id: 'studio.resourceFailure.importEmpty',
    defaultMessage: 'That import holds no file. Import the file again.',
    description:
      'Shown in the protocol editor when a file a researcher imported has nothing stored for it, so it cannot be added to the protocol.',
  },
  notInProtocol: {
    id: 'studio.resourceFailure.notInProtocol',
    defaultMessage: 'That file is not part of this protocol.',
    description:
      'Shown in the protocol editor when it asks for a file (an image, audio, video or roster) the protocol does not hold.',
  },
  emptyFile: {
    id: 'studio.resourceFailure.emptyFile',
    defaultMessage: 'That file is empty. Choose a file with something in it.',
    description:
      'Shown in the protocol editor when a researcher imports a file with nothing in it.',
  },
  rosterCharacter: {
    id: 'studio.resourceFailure.rosterCharacter',
    defaultMessage: 'The roster holds a character that an export cannot carry.',
    description:
      'Shown in the protocol editor when an imported roster (a file listing people for an interview) contains a character that exported data cannot represent. The editor usually names the character and where it is instead; this is what it says when it cannot.',
  },
});
