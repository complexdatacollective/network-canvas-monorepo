import { createMessageError } from '@codaco/app-i18n/messages';
import { SyntheticDataConstraintError } from '@codaco/protocol-utilities';
import { constraintReasonMessages } from '@codaco/protocol-utilities/messages';
import { syntheticGenerationMessages } from '~/i18n/syntheticGenerationMessages';
import type { SyntheticGenerationFailure } from '~/schemas/synthetic-interviews';

export function getSyntheticGenerationFailure(
  error: unknown,
): SyntheticGenerationFailure {
  const diagnostic = error instanceof Error ? error.message : String(error);
  if (error instanceof SyntheticDataConstraintError) {
    return {
      error: createMessageError(syntheticGenerationMessages.constraints),
      details: error.conflicts.map((conflict) => ({
        subject: createMessageError(
          syntheticGenerationMessages.conflictSubject,
          {
            entity: conflict.entity,
            type: conflict.entityTypeName ?? conflict.entityType ?? '',
            variables: { list: conflict.variableNames },
          },
        ),
        reason: createMessageError(
          constraintReasonMessages[conflict.reasonCode ?? 'noSolution'],
        ),
      })),
      diagnostic,
    };
  }
  return {
    error: createMessageError(syntheticGenerationMessages.interrupted),
    diagnostic,
  };
}
