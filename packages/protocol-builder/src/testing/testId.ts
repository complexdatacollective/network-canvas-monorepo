import { deterministicProtocolObjectId } from '@codaco/protocol-validation';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  '0c6f3d52-8a8e-4f4e-9d3b-6a1f2c7e5b90',
);
