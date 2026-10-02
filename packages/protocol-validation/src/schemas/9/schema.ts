import { z } from 'zod';

import { VersionlessProtocolSchema } from '../8/schema.ts';

// Schema 9 is schema 8 with variable names relaxed from `CodebookIdSchema` to
// `CodebookNameSchema`: any script, spaces and punctuation. Both versions are
// built from the one document tree in `schemas/8/`, which carries this rule.
const ProtocolSchema = VersionlessProtocolSchema.safeExtend({
  schemaVersion: z.literal(9),
});

export default ProtocolSchema;
