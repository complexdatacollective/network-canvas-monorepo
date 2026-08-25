import type { StageSimulator } from './types';

/**
 * The content stages write nothing to the session: Information, Narrative and
 * NarrativePedigree are read/looked-at surfaces whose annotations never
 * persist, and Anonymisation's passphrase is UI state, not network data
 * (decision 17 keeps synthetic values plaintext, so there is nothing for it to
 * do here either). A narrative pedigree in particular RENDERS the family a
 * FamilyPedigree stage already committed, colouring it by disease variables
 * something else recorded; it collects nothing of its own.
 *
 * Their cost to the participant is real — the walk charges each stage's
 * `responseBurden` before this runs — which is exactly why an explicit no-op
 * simulator exists instead of a fallthrough: a stage type the walk cannot
 * express must fail loudly, and these four expressly can.
 */
export const simulateContentStage: StageSimulator = () => {
  // Deliberately nothing: pinned by the C4 "writes nothing" property test.
};
