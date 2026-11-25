import {
  deterministicEntityTypeId,
  deterministicProtocolObjectId,
  deterministicVariableId,
} from '@codaco/protocol-validation';

/** A protocol object id a test can name: the same UUID for the same label. */
export const testId = deterministicProtocolObjectId(
  '3f1c2b6e-8a47-4f5d-9c1e-7b0a2d4e6f81',
);

/** A node or edge type id a test can name: the same UUID for the same label. */
export const testTypeId = deterministicEntityTypeId(
  'cb567160-7751-4b91-9971-f821294263d4',
);

/** A variable id a test can name: the same UUID for the same label. */
export const testVariableId = deterministicVariableId(
  '2999a633-ed2f-49ce-b5ab-ce9c27dd7e3c',
);
