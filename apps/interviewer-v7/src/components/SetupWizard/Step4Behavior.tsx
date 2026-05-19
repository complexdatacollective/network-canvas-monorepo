import { useEffect } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';

type Behavior = {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnResume: boolean;
  requireUnlockOnExport: boolean;
};

const DEFAULT_BEHAVIOR: Behavior = {
  idleTimeoutMinutes: 15,
  requireUnlockOnResume: true,
  requireUnlockOnExport: false,
};

const TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

function asBehavior(value: unknown): Behavior {
  if (typeof value !== 'object' || value === null) return DEFAULT_BEHAVIOR;
  const obj = value as Record<string, unknown>;
  const timeout = obj.idleTimeoutMinutes;
  const idleTimeoutMinutes: IdleTimeoutMinutes =
    timeout === 1 ||
    timeout === 5 ||
    timeout === 15 ||
    timeout === 30 ||
    timeout === 60
      ? timeout
      : 15;
  return {
    idleTimeoutMinutes,
    requireUnlockOnResume:
      typeof obj.requireUnlockOnResume === 'boolean'
        ? obj.requireUnlockOnResume
        : true,
    requireUnlockOnExport:
      typeof obj.requireUnlockOnExport === 'boolean'
        ? obj.requireUnlockOnExport
        : false,
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

  const update = (patch: Partial<Behavior>) => {
    wizard.setStepData({ behavior: { ...behavior, ...patch } });
  };

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend>Auto-lock after</legend>
        <RichSelectGroupField
          name="idleTimeoutMinutes"
          orientation="vertical"
          options={TIMEOUT_OPTIONS}
          value={behavior.idleTimeoutMinutes}
          onChange={(v) => {
            const n = typeof v === 'number' ? v : Number(v);
            const next: IdleTimeoutMinutes =
              n === 1 || n === 5 || n === 15 || n === 30 || n === 60 ? n : 15;
            update({ idleTimeoutMinutes: next });
          }}
        />
      </fieldset>
      <label className="flex items-center justify-between gap-4">
        <span>Require unlock before resuming an interview</span>
        <ToggleField
          name="requireUnlockOnResume"
          value={behavior.requireUnlockOnResume}
          onChange={(v) => update({ requireUnlockOnResume: Boolean(v) })}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>Require unlock before exporting data</span>
        <ToggleField
          name="requireUnlockOnExport"
          value={behavior.requireUnlockOnExport}
          onChange={(v) => update({ requireUnlockOnExport: Boolean(v) })}
        />
      </label>
    </div>
  );
}
