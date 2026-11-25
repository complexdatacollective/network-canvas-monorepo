import { deterministicVariableId } from '@codaco/protocol-validation';

/**
 * A variable id a scenario can name in its build and in its assertions: the
 * same UUID for the same label. A scenario passes it to `addVariable` as the
 * variable's `id`, which SyntheticInterview keeps as given.
 */
export const e2eVariableId = deterministicVariableId(
  '2fe4183c-5ea6-4a25-9e8c-61250386ab00',
);
