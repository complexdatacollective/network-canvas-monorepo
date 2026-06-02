import { useEffect } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import SecurityBehaviorControls, {
  type Behavior,
} from '~/components/SecurityBehaviorControls';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';

const DEFAULT_BEHAVIOR: Behavior = {
  idleTimeoutMinutes: 15,
  requireUnlockOnResume: true,
  requireUnlockOnExport: false,
};

function asBehavior(value: unknown): Behavior {
  if (typeof value !== 'object' || value === null) return DEFAULT_BEHAVIOR;
  const obj: Record<string, unknown> = { ...value };
  const timeout = obj.idleTimeoutMinutes;
  const idleTimeoutMinutes: IdleTimeoutMinutes =
    timeout === 1 ||
    timeout === 5 ||
    timeout === 15 ||
    timeout === 30 ||
    timeout === 60
      ? timeout
      : DEFAULT_BEHAVIOR.idleTimeoutMinutes;
  return {
    idleTimeoutMinutes,
    requireUnlockOnResume:
      typeof obj.requireUnlockOnResume === 'boolean'
        ? obj.requireUnlockOnResume
        : DEFAULT_BEHAVIOR.requireUnlockOnResume,
    requireUnlockOnExport:
      typeof obj.requireUnlockOnExport === 'boolean'
        ? obj.requireUnlockOnExport
        : DEFAULT_BEHAVIOR.requireUnlockOnExport,
  };
}

export default function Step4Behavior() {
  const wizard = useWizard();
  const behavior = asBehavior(wizard.data.behavior);

  useEffect(() => {
    wizard.setNextEnabled(true);
    wizard.setNextLabel('Finish');
    wizard.setBeforeNext(null);
    return () => {
      wizard.setNextLabel('Continue');
    };
  }, [wizard]);

  return (
    <SecurityBehaviorControls
      value={behavior}
      onChange={(next) => wizard.setStepData({ behavior: next })}
    />
  );
}
