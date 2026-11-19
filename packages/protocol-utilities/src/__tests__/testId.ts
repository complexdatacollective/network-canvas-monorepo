import { v5 } from 'uuid';

import {
  type ProtocolObjectId,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';

const TEST_ID_NAMESPACE = 'b0f4c7a2-6f0e-4d55-9d3c-2f8f1d6a9e41';

/**
 * A protocol object id for a fixture, the same every time for the same label,
 * so a fixture can name an object by a readable label and refer to it again.
 */
export const testId = (label: string): ProtocolObjectId =>
  ProtocolObjectIdSchema.parse(v5(label, TEST_ID_NAMESPACE));
