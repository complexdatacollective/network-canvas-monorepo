import { deterministicProtocolObjectId } from '@codaco/protocol-validation';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  'b0f4c7a2-6f0e-4d55-9d3c-2f8f1d6a9e41',
);
