import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import type { FinishMode } from '@codaco/protocol-validation';

import { MODE_FIELD } from './ModeSection.tsx';

/**
 * The mode the stage is being edited in. A stage without one is treated as
 * confirmation, the mode every finish stage had before there was a choice.
 */
export const useFinishMode = (): FinishMode => {
  const { [MODE_FIELD]: value } = useFormValue([MODE_FIELD] as const);
  return value === 'automatic' ? 'automatic' : 'confirmation';
};
