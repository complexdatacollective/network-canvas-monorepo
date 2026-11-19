import { v5 } from 'uuid';

import {
  type ProtocolObjectId,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';

const TEST_ID_NAMESPACE = '3f1c2b6e-8a47-4f5d-9c1e-7b0a2d4e6f81';

/**
 * A protocol object id for a test fixture: a real UUID that is the same every
 * time for the same label, so a fixture can name a stage or prompt by a
 * readable label and an assertion can refer to it again by that label.
 */
export const testId = (label: string): ProtocolObjectId =>
  ProtocolObjectIdSchema.parse(v5(label, TEST_ID_NAMESPACE));
