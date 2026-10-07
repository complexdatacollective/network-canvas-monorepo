import type { Stage } from '@codaco/protocol-validation';
import { DEFAULT_PASSPHRASE_MIN_LENGTH } from '@codaco/shared-consts';

type AnonymisationStage = Extract<Stage, { type: 'Anonymisation' }>;

type PassphraseLengthRules = { minLength: number; maxLength?: number };

/**
 * The length rules a passphrase being chosen must meet. A minimum set by the
 * researcher replaces the default, even when it is lower.
 */
export function passphraseLengthRules(
  validation: AnonymisationStage['validation'],
): PassphraseLengthRules {
  const minLength = validation?.minLength ?? DEFAULT_PASSPHRASE_MIN_LENGTH;
  const maxLength = validation?.maxLength;
  return maxLength === undefined ? { minLength } : { minLength, maxLength };
}

/**
 * The length rules of the protocol's first Anonymisation stage, for a
 * passphrase chosen before reaching it, or in a protocol without one.
 */
export function protocolPassphraseLengthRules(
  stages: readonly Stage[],
): PassphraseLengthRules {
  const stage = stages.find(
    (candidate): candidate is AnonymisationStage =>
      candidate.type === 'Anonymisation',
  );
  return passphraseLengthRules(stage?.validation);
}
