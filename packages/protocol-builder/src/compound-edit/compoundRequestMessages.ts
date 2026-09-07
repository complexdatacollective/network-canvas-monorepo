import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What is wrong with a compound edit — a change that touches the codebook
 * alongside the interview step being edited — or with applying one.
 *
 * One home for these because both sides check the same things. The session
 * refuses a malformed request before it is sent, and a host refuses it again
 * on arrival because the session is not the only thing that can submit one;
 * declaring the words twice would mean translating them twice and letting the
 * two copies drift, and `extractMessages` throws outright on a repeated id.
 *
 * They travel to the screen inside a `CompoundEditResult`'s plain-string
 * `message`, encoded with `createMessageError` and decoded where they are
 * rendered, because a host writes messages of its own into that same field.
 */
export const compoundRequestMessages = defineMessages({
  notSerializable: {
    id: 'protocolBuilder.compoundEdit.notSerializable',
    defaultMessage: 'the compound edit payload is not canonically serializable',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: the request could not be written down in a form the host can compare against a retry.',
  },
  requestIdReused: {
    id: 'protocolBuilder.compoundEdit.requestIdReused',
    defaultMessage:
      'compound edit request id {requestId} was reused for a different payload',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: an identifier that must name one change was sent with different contents. requestId is that identifier.',
  },
  missingId: {
    id: 'protocolBuilder.compoundEdit.missingId',
    defaultMessage:
      'a compound edit requires an id and at least one section edit',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: the request was not formed correctly.',
  },
  requiresId: {
    id: 'protocolBuilder.compoundEdit.requiresId',
    defaultMessage: 'a compound edit requires a stable request id',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it carried no identifier the host could use to apply it exactly once.',
  },
  requiresDescription: {
    id: 'protocolBuilder.compoundEdit.requiresDescription',
    defaultMessage: 'a compound edit requires a description',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it did not say what it was doing.',
  },
  touchesNothing: {
    id: 'protocolBuilder.compoundEdit.touchesNothing',
    defaultMessage: 'a compound edit must touch at least one section',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it would change nothing.',
  },
  duplicateSection: {
    id: 'protocolBuilder.compoundEdit.duplicateSection',
    defaultMessage: 'a compound edit may touch each section only once',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it named the same part of the protocol twice.',
  },
  unknownSection: {
    id: 'protocolBuilder.compoundEdit.unknownSection',
    defaultMessage: 'a compound edit contains an unknown section id',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it named a part of the protocol that does not exist.',
  },
  updateNeedsHash: {
    id: 'protocolBuilder.compoundEdit.updateNeedsHash',
    defaultMessage:
      'a compound section update requires an expected content hash',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it did not say which version of that part of the protocol it was built from.',
  },
  removalNeedsHash: {
    id: 'protocolBuilder.compoundEdit.removalNeedsHash',
    defaultMessage:
      'a compound section removal requires an expected content hash',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: a deletion did not say which version of that part of the protocol it was built from.',
  },
  editNeedsHash: {
    id: 'protocolBuilder.compoundEdit.editNeedsHash',
    defaultMessage: 'a compound section edit requires an expected content hash',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it did not say which version of that part of the protocol it was built from.',
  },
  updateNeedsCommands: {
    id: 'protocolBuilder.compoundEdit.updateNeedsCommands',
    defaultMessage: 'a compound section update requires at least one command',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: one of the parts it named would change nothing.',
  },
  stageIdentityLocked: {
    id: 'protocolBuilder.compoundEdit.stageIdentityLocked',
    defaultMessage:
      'stage identity fields cannot be changed by a compound edit',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it would rename or retype the step itself. "stage" is one step of an interview.',
  },
  structuralSectionLocked: {
    id: 'protocolBuilder.compoundEdit.structuralSectionLocked',
    defaultMessage:
      'only codebook sections can be structurally created or removed',
    description:
      'Why a change touching the codebook alongside the interview step being edited was refused: it would add or delete a part of the protocol that is not a codebook entry.',
  },
});
