'use client';

import { useOptimistic, useTransition } from 'react';

import SwitchUI from '@codaco/fresco-ui/form/fields/ToggleField';

const SwitchWithOptimisticUpdate = ({
  label,
  initialValue,
  updateValue,
  readOnly,
}: {
  label: string;
  initialValue: boolean;
  updateValue: (value: boolean) => Promise<boolean>;
  readOnly?: boolean;
}) => {
  const [isTransitioning, startTransition] = useTransition();
  const [optimisticIsActive, setOptimisticIsActive] = useOptimistic(
    initialValue,
    (_, newValue: boolean) => newValue,
  );

  const updateIsActive = async (newValue: boolean) => {
    setOptimisticIsActive(newValue);
    await updateValue(newValue);
  };

  return (
    <SwitchUI
      aria-label={label}
      disabled={readOnly ?? isTransitioning}
      value={optimisticIsActive}
      onChange={(checked) =>
        startTransition(() => updateIsActive(checked ?? false))
      }
    />
  );
};

export default SwitchWithOptimisticUpdate;
