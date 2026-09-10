import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What a canvas list calls a reference the codebook no longer defines.
 *
 * Declared beside `useLostReferences` rather than in either list's own
 * messages file: the helper and the words it produces are one behaviour, and
 * the sentence is the same wherever a canvas stage names an edge type that has
 * been deleted. Two lists say it today — a sociogram prompt's connections and
 * a narrative preset's — and a second copy of the sentence would be a second
 * catalog entry asking a translator the same question twice.
 */
export const canvasMessages = defineMessages({
  missingEdgeType: {
    id: 'protocolBuilder.networkCanvas.promptMissingEdgeType',
    defaultMessage:
      '{edgeTypeId} — this edge type is no longer in the codebook',
    description:
      'Name of the tick-list choice standing for an edge type a stage still names — a sociogram prompt displays it, a network composer draws it, a narrative preset draws it — and the protocol’s codebook no longer defines. edgeTypeId is the raw stored identifier: there is no name left to show, because the definition it would have come from has been deleted. An edge type is a kind of relationship between two network members.',
  },
});
