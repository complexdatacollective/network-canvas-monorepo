import { v5 } from 'uuid';

import {
  type ProtocolObjectId,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';

// Fixed so that a name gives the same id in every run and every test file.
const TEST_OBJECT_ID_NAMESPACE = '0c6f3d52-8a8e-4f4e-9d3b-6a1f2c7e5b90';

/**
 * A protocol object id a test can name: the same UUID every time it is asked
 * for `name`, and a different one for every other name.
 */
export const testObjectId = (name: string): ProtocolObjectId =>
  ProtocolObjectIdSchema.parse(v5(name, TEST_OBJECT_ID_NAMESPACE));
