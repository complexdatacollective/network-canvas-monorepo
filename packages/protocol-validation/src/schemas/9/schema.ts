import { z } from 'zod';

import { VersionlessProtocolSchema } from '../8/schema.ts';

// Schema 9 is schema 8 with variable names relaxed from `CodebookIdSchema` to
// `CodebookNameSchema`: any script, spaces and punctuation. Both versions are
// built from the one document tree in `schemas/8/`, which carries this rule.
//
// Schema 9 alone refuses an Anonymisation stage whose minimum passphrase
// length is above its maximum, since no participant could choose a passphrase.
// Schema 8 still accepts one, so the 8 to 9 migration can remove the pair
// rather than refuse the protocol.
const ProtocolSchema = VersionlessProtocolSchema.safeExtend({
  schemaVersion: z.literal(9),
}).superRefine((protocol, ctx) => {
  protocol.stages.forEach((stage, index) => {
    if (stage.type !== 'Anonymisation') return;
    const minLength = stage.validation?.minLength;
    const maxLength = stage.validation?.maxLength;
    if (
      minLength !== undefined &&
      maxLength !== undefined &&
      minLength > maxLength
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `The minimum passphrase length (${minLength}) is longer than the maximum (${maxLength}), so no participant could choose a passphrase.`,
        path: ['stages', index, 'validation', 'minLength'],
      });
    }
  });
});

export default ProtocolSchema;
