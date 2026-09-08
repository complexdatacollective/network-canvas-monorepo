import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';

/**
 * Every researcher-facing refusal this package's own resource code produces.
 *
 * One home rather than one per module, for two reasons. `extractMessages`
 * throws when an id is declared in two files, and the read-only refusal is
 * genuinely produced by two of them — the session's lifecycle and the
 * in-memory host — in the same words. And these messages cross a string-only
 * contract (`ResourceGatewayFailure.message`, `ProtocolValidationIssue.message`),
 * so they are encoded with {@link createMessageError} where they are produced
 * and decoded with `formatMessageError(text, intl) ?? text` where they are
 * rendered; the `?? text` is what keeps a host's own plain-string failure
 * working unchanged. Keeping them together makes the set a translator sees
 * the set an adapter author can produce.
 */
export const resourceFailureMessages = defineMessages({
  unreachable: {
    id: 'protocolBuilder.resourceFailure.unreachable',
    defaultMessage: 'The resource could not be reached. Try again in a moment.',
    description:
      'Shown to a researcher when the host storing protocol resources (images, audio, rosters, API keys) threw instead of answering. Deliberately says nothing about the host.',
  },
  invalidManifestEntry: {
    id: 'protocolBuilder.resourceFailure.invalidManifestEntry',
    defaultMessage: 'asset {resourceId}: {reason}',
    description:
      'Shown to a researcher when a host proposed a protocol asset entry the protocol schema rejects. resourceId is the asset id; reason is the schema’s own English message, or the generic fallback. Lower case because a surface may put it after a clause of its own.',
  },
  assetValidationFailed: {
    id: 'protocolBuilder.resourceFailure.assetValidationFailed',
    defaultMessage: 'asset validation failed',
    description:
      'Fallback reason used when the protocol schema rejected an asset entry without saying why. Appears inside a longer sentence, so it is lower case and has no full stop.',
  },
  missingResource: {
    id: 'protocolBuilder.resourceFailure.missingResource',
    defaultMessage:
      'This stage uses a resource ("{resourceId}") that is not in the protocol.',
    description:
      'Validation problem shown against the field of an interview stage (one step of an interview) that names a resource the protocol does not contain. resourceId is the asset id the field holds.',
  },
  invalidResource: {
    id: 'protocolBuilder.resourceFailure.invalidResource',
    defaultMessage:
      'The resource ("{resourceId}") this stage uses is not valid: {reason}',
    description:
      'Validation problem shown against the field of an interview stage whose resource has an unusable entry in the protocol. resourceId is the asset id; reason is the schema’s own English message, or the generic fallback.',
  },
  unsavableResource: {
    id: 'protocolBuilder.resourceFailure.unsavableResource',
    defaultMessage:
      'The resource ("{resourceId}") this stage uses cannot be saved: {reason}',
    description:
      'Validation problem shown when saving an interview stage and the host will not vouch for a resource it references. resourceId is the asset id; reason is the host’s own refusal, itself a localized sentence.',
  },
  readOnly: {
    id: 'protocolBuilder.resourceFailure.readOnly',
    defaultMessage:
      'this protocol is open for viewing only, so its resources cannot change',
    description:
      'Refusal shown when a researcher tries to import, discard, or save a resource in a protocol opened read-only. Lower case and without a full stop because surfaces put it after a clause of their own.',
  },
  saveInFlight: {
    id: 'protocolBuilder.resourceFailure.saveInFlight',
    defaultMessage:
      'these resources are being saved right now, so they cannot be discarded until the save finishes',
    description:
      'Refusal shown when a researcher asks to discard an imported resource while the stage that uses it is being saved. Lower case and without a full stop: surfaces put it after a clause of their own.',
  },
  promotionUndecided: {
    id: 'protocolBuilder.resourceFailure.promotionUndecided',
    defaultMessage:
      'the last attempt to save these resources did not say whether it finished, so they cannot be discarded until saving again settles it',
    description:
      'Refusal shown when a researcher asks to discard an imported resource whose last save never reported whether it committed. Lower case and without a full stop: surfaces put it after a clause of their own.',
  },
  sessionCancelled: {
    id: 'protocolBuilder.resourceFailure.sessionCancelled',
    defaultMessage:
      'this stage was discarded, so its resources can no longer be saved',
    description:
      'Refusal shown when a save is attempted after the interview stage being edited was discarded. "Stage" is one step of an interview. Lower case and without a full stop.',
  },
  resourceLeaving: {
    id: 'protocolBuilder.resourceFailure.resourceLeaving',
    defaultMessage:
      'That resource is being discarded, so it cannot be used here. Choose a different one.',
    description:
      'Refusal shown when a researcher picks a resource another field is in the middle of discarding.',
  },
  resourceDiscarded: {
    id: 'protocolBuilder.resourceFailure.resourceDiscarded',
    defaultMessage:
      'That resource is no longer available: it was discarded while this list was open. Close and reopen the browser to see what there is.',
    description:
      'Refusal shown when a researcher picks a resource from a list read before that resource was discarded. "The browser" is this app’s resource-picking dialog, not the web browser.',
  },
  stagingEndedFile: {
    id: 'protocolBuilder.resourceFailure.stagingEndedFile',
    defaultMessage:
      'this editing session ended before the file finished staging, so it was not kept',
    description:
      'Refusal shown when a researcher’s imported file finished uploading after they had already discarded or saved the stage. Lower case and without a full stop: surfaces put it after a clause of their own.',
  },
  stagingEndedSecret: {
    id: 'protocolBuilder.resourceFailure.stagingEndedSecret',
    defaultMessage:
      'this editing session ended before the secret finished staging, so it was not kept',
    description:
      'Refusal shown when a researcher’s API key finished being stored after they had already discarded or saved the stage. Lower case and without a full stop: surfaces put it after a clause of their own.',
  },
  hostUnavailable: {
    id: 'protocolBuilder.resourceFailure.hostUnavailable',
    defaultMessage: 'the resource host is temporarily unavailable',
    description:
      'Refusal shown when the store holding protocol resources cannot answer right now. Lower case and without a full stop: surfaces put it after a clause of their own.',
  },
  uploadNeedsIdAndName: {
    id: 'protocolBuilder.resourceFailure.uploadNeedsIdAndName',
    defaultMessage: 'a staged file needs a stable request id and a name',
    description:
      'Refusal shown when an imported file arrived without the name or request identifier the host needs. Lower case and without a full stop.',
  },
  uploadNeedsFilename: {
    id: 'protocolBuilder.resourceFailure.uploadNeedsFilename',
    defaultMessage: 'a staged file needs a filename without path separators',
    description:
      'Refusal shown when an imported file’s recorded filename still carries a folder path. Lower case and without a full stop.',
  },
  fileEmpty: {
    id: 'protocolBuilder.resourceFailure.fileEmpty',
    defaultMessage: 'the selected file is empty',
    description:
      'Refusal shown when the file a researcher chose holds no bytes at all. Lower case and without a full stop.',
  },
  fileTooLarge: {
    id: 'protocolBuilder.resourceFailure.fileTooLarge',
    defaultMessage:
      'the selected file is larger than the {limit, number} byte limit',
    description:
      'Refusal shown when the file a researcher chose exceeds what the host will store. limit is that size as an exact byte count, not a rounded one. Lower case and without a full stop.',
  },
  secretNeedsIdAndName: {
    id: 'protocolBuilder.resourceFailure.secretNeedsIdAndName',
    defaultMessage: 'a staged secret needs a stable request id and a name',
    description:
      'Refusal shown when an API key was submitted without the name or request identifier the host needs. Lower case and without a full stop.',
  },
  secretValueEmpty: {
    id: 'protocolBuilder.resourceFailure.secretValueEmpty',
    defaultMessage: 'the secret value is empty',
    description:
      'Refusal shown when an API key was submitted with no value in it. Lower case and without a full stop.',
  },
  previewUnsupported: {
    id: 'protocolBuilder.resourceFailure.previewUnsupported',
    defaultMessage: 'secret material cannot be previewed',
    description:
      'Refusal shown when something asked to display an API key’s content. Lower case and without a full stop.',
  },
  downloadUnsupported: {
    id: 'protocolBuilder.resourceFailure.downloadUnsupported',
    defaultMessage: 'secret material cannot be downloaded',
    description:
      'Refusal shown when something asked to download an API key’s content. Lower case and without a full stop.',
  },
  promotionRolledBack: {
    id: 'protocolBuilder.resourceFailure.promotionRolledBack',
    defaultMessage: 'the resources could not be stored; nothing was changed',
    description:
      'Refusal shown when saving a stage’s imported resources failed partway and every part of it was undone. Lower case and without a full stop.',
  },
  manifestUpdateFailed: {
    id: 'protocolBuilder.resourceFailure.manifestUpdateFailed',
    defaultMessage: 'the asset manifest could not be updated',
    description:
      'Refusal shown when the protocol’s own list of resources could not be written while saving. Lower case and without a full stop.',
  },
  promotionNeedsId: {
    id: 'protocolBuilder.resourceFailure.promotionNeedsId',
    defaultMessage: 'a promotion requires a stable request id',
    description:
      'Refusal shown when a save of imported resources arrived without the identifier that makes it safe to repeat. Lower case and without a full stop.',
  },
  promotionNeedsResource: {
    id: 'protocolBuilder.resourceFailure.promotionNeedsResource',
    defaultMessage: 'a promotion must name at least one staged resource',
    description:
      'Refusal shown when a save of imported resources named none of them. Lower case and without a full stop.',
  },
  promotionDuplicateResource: {
    id: 'protocolBuilder.resourceFailure.promotionDuplicateResource',
    defaultMessage: 'a promotion may name each resource only once',
    description:
      'Refusal shown when a save of imported resources named the same one twice. Lower case and without a full stop.',
  },
  alreadyCommitted: {
    id: 'protocolBuilder.resourceFailure.alreadyCommitted',
    defaultMessage: 'that resource is already part of the protocol',
    description:
      'Refusal shown when a save was asked to import a resource the protocol already holds. Lower case and without a full stop.',
  },
  secretNeedsHandle: {
    id: 'protocolBuilder.resourceFailure.secretNeedsHandle',
    defaultMessage:
      'a staged secret can only be promoted with its staged handle',
    description:
      'Refusal shown when a save tried to store an API key without the token the host issued for it. Lower case and without a full stop.',
  },
  notFound: {
    id: 'protocolBuilder.resourceFailure.notFound',
    defaultMessage: 'that resource is no longer available',
    description:
      'Refusal shown when nothing in the protocol or this editing session has the requested resource id. Lower case and without a full stop.',
  },
  rosterUnreadable: {
    id: 'protocolBuilder.resourceFailure.rosterUnreadable',
    defaultMessage: 'the selected file is not a readable network',
    description:
      'Refusal shown when an imported roster (participant data an interview reads) cannot be parsed as network data. "Network" is the network-research sense: people and the ties between them. Lower case and without a full stop.',
  },
  rosterUnreadableDetail: {
    id: 'protocolBuilder.resourceFailure.rosterUnreadableDetail',
    defaultMessage: 'the selected file is not a readable network: {detail}',
    description:
      'The same refusal as rosterUnreadable, with the specific fault named. detail is one of the roster* messages below, already localized. Lower case and without a full stop.',
  },
  rosterNodeNotObject: {
    id: 'protocolBuilder.resourceFailure.rosterNodeNotObject',
    defaultMessage: 'node {position} is not an object',
    description:
      'Names the entry at fault in an imported roster. "Node" is the network-research term for one person or entity in the data; position is its one-based place in the file. Appears after a clause of its own, so it is lower case and has no full stop.',
  },
  rosterNodeAttributesNotObject: {
    id: 'protocolBuilder.resourceFailure.rosterNodeAttributesNotObject',
    defaultMessage: 'the attributes of node {position} are not an object',
    description:
      'Names the entry at fault in an imported roster whose attributes are malformed. "Node" is one person or entity in network data; position is its one-based place in the file. Lower case and without a full stop.',
  },
  rosterValueUnusableInRow: {
    id: 'protocolBuilder.resourceFailure.rosterValueUnusableInRow',
    defaultMessage:
      'the "{name}" attribute of row {row} is not a value a variable can hold',
    description:
      'Names the cell at fault in an imported spreadsheet roster. name is the researcher’s own column heading; row is its one-based line in the file. "Attribute" and "variable" are the data fields a protocol records. Lower case and without a full stop.',
  },
  rosterValueUnusableInNode: {
    id: 'protocolBuilder.resourceFailure.rosterValueUnusableInNode',
    defaultMessage:
      'the "{name}" attribute of node {position} is not a value a variable can hold',
    description:
      'Names the attribute at fault in an imported JSON roster. name is the researcher’s own attribute name; "node" is one person or entity in network data and position is its one-based place in the file. Lower case and without a full stop.',
  },
  rosterEmpty: {
    id: 'protocolBuilder.resourceFailure.rosterEmpty',
    defaultMessage:
      'the selected file has no records in it, so a stage using it would have nobody to show',
    description:
      'Refusal shown when an imported roster parsed correctly but holds no entries. "Stage" is one step of an interview. Lower case and without a full stop.',
  },
  rosterAttributeNameUnusable: {
    id: 'protocolBuilder.resourceFailure.rosterAttributeNameUnusable',
    defaultMessage:
      'the "{name}" attribute cannot be used as a variable name: names may hold only letters, digits, and the characters . _ - :',
    description:
      'Refusal shown when an imported roster carries a column or attribute name a protocol variable cannot take — a spreadsheet heading such as "home address". name is that heading, left exactly as the researcher wrote it. Lower case and without a full stop.',
  },
});

/**
 * The schema’s own reason for rejecting an asset entry, or this package’s
 * fallback when it gave none.
 *
 * Returned as a `createMessageError` value rather than a string wherever the
 * fallback applies, so the fallback follows the reader’s locale while the
 * schema’s English message is carried through untouched.
 */
export function assetValidationReason(
  message: string | undefined,
): string | Readonly<{ messageError: string }> {
  return (
    message ?? {
      messageError: createMessageError(
        resourceFailureMessages.assetValidationFailed,
      ),
    }
  );
}
