import {
  deterministicEntityTypeId,
  deterministicVariableId,
} from '@codaco/protocol-validation';

/** A node or edge type id a test can name: the same UUID for the same label. */
export const testTypeId = deterministicEntityTypeId(
  '15ac5c39-597f-4e31-ac0a-1049cde3db3b',
);

/** A variable id a test can name: the same UUID for the same label. */
export const testVariableId = deterministicVariableId(
  '44a5e6bc-4b00-492e-aee0-3ab62f40aec8',
);
