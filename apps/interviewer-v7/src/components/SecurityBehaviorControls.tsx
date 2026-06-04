import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';

export type Behavior = {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnResume: boolean;
  requireUnlockOnExport: boolean;
};

type Props = {
  value: Behavior;
  onChange: (next: Behavior) => void;
  disabled?: boolean;
};

const TIMEOUT_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
];

function parseIdleTimeout(raw: unknown): IdleTimeoutMinutes {
  const n = Number(raw);
  return n === 1 || n === 5 || n === 15 || n === 30 || n === 60 ? n : 15;
}

export default function SecurityBehaviorControls({
  value,
  onChange,
  disabled,
}: Props) {
  const update = (patch: Partial<Behavior>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <>
      <UnconnectedField
        name="idleTimeoutMinutes"
        label="Auto-lock after"
        hint="How long the app may sit idle before automatically locking."
        component={SelectField}
        options={TIMEOUT_OPTIONS}
        value={String(value.idleTimeoutMinutes)}
        disabled={disabled}
        onChange={(v: string | number | undefined) =>
          update({ idleTimeoutMinutes: parseIdleTimeout(v) })
        }
      />
      <UnconnectedField
        name="requireUnlockOnResume"
        label="Require unlock before resuming an interview"
        inline
        component={ToggleField}
        value={value.requireUnlockOnResume}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnResume: v === true })
        }
      />
      <UnconnectedField
        name="requireUnlockOnExport"
        label="Require unlock before exporting data"
        inline
        component={ToggleField}
        value={value.requireUnlockOnExport}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnExport: v === true })
        }
      />
    </>
  );
}
