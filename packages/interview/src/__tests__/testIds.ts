import { deterministicProtocolObjectId } from '@codaco/protocol-validation';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  '3f1c2b6e-8a47-4f5d-9c1e-7b0a2d4e6f81',
);
