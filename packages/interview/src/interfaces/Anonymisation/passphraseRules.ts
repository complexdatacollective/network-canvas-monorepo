import type { Stage } from '@codaco/protocol-validation';
import { effectivePassphraseMinLength } from '@codaco/shared-consts';

type AnonymisationStage = Extract<Stage, { type: 'Anonymisation' }>;

type PassphraseLengthRules = { minLength: number; maxLength?: number };

/**
 * The stage's lengths without any that leave no passphrase to choose. Schema 9
 * refuses a minimum above the maximum and Architect refuses a maximum below
 * one, but a stored row validated before either existed can still carry them.
 * An inverted pair is dropped whole, as the 8 to 9 migration does; a maximum
 * below one character is dropped alone.
 */
function choosableLengths(
  validation: AnonymisationStage['validation'],
): AnonymisationStage['validation'] {
  const minLength = validation?.minLength;
  const maxLength = validation?.maxLength;
  if (maxLength === undefined) return validation;
  if (minLength !== undefined && minLength > maxLength) return undefined;
  if (maxLength < 1) return minLength === undefined ? undefined : { minLength };
  return validation;
}

/**
 * The length rules a passphrase being chosen must meet. A minimum set by the
 * researcher replaces the default, even when it is lower, and the default
 * never exceeds the researcher's maximum.
 */
export function passphraseLengthRules(
  validation: AnonymisationStage['validation'],
): PassphraseLengthRules {
  const lengths = choosableLengths(validation);
  const minLength = effectivePassphraseMinLength(lengths);
  const maxLength = lengths?.maxLength;
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
