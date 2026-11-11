import {
  type CurrentProtocol,
  hashProtocol,
} from '@codaco/protocol-validation';
import type { StudyContext } from '@codaco/shared-consts';

/**
 * What a review looked at, as one string: the protocol's structural hash
 * (`hashProtocol`, which leaves out its name, description and experiments)
 * and the study details. Equal fingerprints mean nothing a review reads has
 * changed since, so another review would be asked the same question.
 */

/** cyrb53: a fast, well-mixed 53-bit string hash. Not cryptographic. */
const cyrb53 = (text: string): string => {
  let h1 = 0xde_ad_be_ef;
  let h2 = 0x41_c6_ce_57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2_654_435_761);
    h2 = Math.imul(h2 ^ code, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  return (4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0)).toString(36);
};

/** The study details in a fixed key order, so equal details hash equal. */
const canonicalStudyContext = (context: StudyContext) =>
  JSON.stringify([
    context.researchQuestions,
    context.population,
    context.administration,
    context.synopsis ?? null,
  ]);

export const reviewFingerprint = (
  protocol: CurrentProtocol,
  studyContext: StudyContext,
): string =>
  `${hashProtocol(protocol)}:${cyrb53(canonicalStudyContext(studyContext))}`;
