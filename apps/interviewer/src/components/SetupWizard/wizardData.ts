import type { Behavior } from '~/components/SecurityBehaviorControls';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';

import type { WizardSelectedMethod } from '../SetupWizardDialog';

// The wizard hands every step, and the dialog's result, its accumulated data
// as `Record<string, unknown>`, so each reader narrows the fields it uses.

const WIZARD_METHODS: WizardSelectedMethod[] = [
  'biometric',
  'pin',
  'passphrase',
  'none',
];

export function isWizardSelectedMethod(
  value: unknown,
): value is WizardSelectedMethod {
  return typeof value === 'string' && WIZARD_METHODS.some((m) => m === value);
}

const DEFAULT_BEHAVIOR: Behavior = {
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
};

export function asBehavior(value: unknown): Behavior {
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
    requireUnlockOnEnter:
      typeof obj.requireUnlockOnEnter === 'boolean'
        ? obj.requireUnlockOnEnter
        : DEFAULT_BEHAVIOR.requireUnlockOnEnter,
    requireUnlockOnExit:
      typeof obj.requireUnlockOnExit === 'boolean'
        ? obj.requireUnlockOnExit
        : DEFAULT_BEHAVIOR.requireUnlockOnExit,
    requireUnlockOnExport:
      typeof obj.requireUnlockOnExport === 'boolean'
        ? obj.requireUnlockOnExport
        : DEFAULT_BEHAVIOR.requireUnlockOnExport,
  };
}
