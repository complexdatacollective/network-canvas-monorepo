import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { IdleTimeoutMinutes } from '~/lib/auth/AuthContext';

const messages = defineMessages({
  autoLockAfter: {
    id: 'interviewer.securityBehaviorControls.autoLockAfter',
    defaultMessage: 'Auto-lock after',
    description:
      'Field label for a dropdown in the security settings: the idle time after which the app locks itself. Appears in Settings, Security section and in the setup wizard.',
  },
  howLongTheAppMaySitIdle: {
    id: 'interviewer.securityBehaviorControls.howLongTheAppMaySitIdle',
    defaultMessage:
      'How long the app may sit idle before automatically locking.',
    description:
      'Hint under the auto-lock dropdown; says how long the app can sit unused before it locks.',
  },
  requireUnlockWhenEnteringAnInterview: {
    id: 'interviewer.securityBehaviorControls.requireUnlockWhenEnteringAnInterview',
    defaultMessage: 'Require unlock when entering an interview',
    description:
      'Toggle label in the security settings; when on, the researcher must re-enter their unlock method before an interview opens.',
  },
  requireUnlockWhenExitingAnInterview: {
    id: 'interviewer.securityBehaviorControls.requireUnlockWhenExitingAnInterview',
    defaultMessage: 'Require unlock when exiting an interview',
    description:
      'Toggle label in the security settings; when on, the researcher must re-enter their unlock method before leaving an interview.',
  },
  requireUnlockBeforeExportingData: {
    id: 'interviewer.securityBehaviorControls.requireUnlockBeforeExportingData',
    defaultMessage: 'Require unlock before exporting data',
    description:
      'Toggle label in the security settings; when on, the researcher must re-enter their unlock method before exporting interview data.',
  },
  minutes: {
    id: 'interviewer.securityBehaviorControls.minutes',
    defaultMessage: '{count, plural, one {# minute} other {# minutes}}',
    description:
      'Option in the auto-lock dropdown, a duration in minutes; count is the number of minutes.',
  },
  hours: {
    id: 'interviewer.securityBehaviorControls.hours',
    defaultMessage: '{count, plural, one {# hour} other {# hours}}',
    description:
      'Option in the auto-lock dropdown, a duration in hours; count is the number of hours.',
  },
});

export type Behavior = {
  idleTimeoutMinutes: IdleTimeoutMinutes;
  requireUnlockOnEnter: boolean;
  requireUnlockOnExit: boolean;
  requireUnlockOnExport: boolean;
};

type Props = {
  value: Behavior;
  onChange: (next: Behavior) => void;
  disabled?: boolean;
};

const TIMEOUT_VALUES = ['1', '5', '15', '30', '60'];

function parseIdleTimeout(raw: unknown): IdleTimeoutMinutes {
  const n = Number(raw);
  return n === 1 || n === 5 || n === 15 || n === 30 || n === 60 ? n : 15;
}

export default function SecurityBehaviorControls({
  value,
  onChange,
  disabled,
}: Props) {
  const intl = useAppIntl();
  const update = (patch: Partial<Behavior>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <>
      <UnconnectedField
        name="idleTimeoutMinutes"
        label={intl.formatMessage(messages.autoLockAfter)}
        hint={intl.formatMessage(messages.howLongTheAppMaySitIdle)}
        component={SelectField}
        options={TIMEOUT_VALUES.map((minutes) => ({
          value: minutes,
          label: intl.formatMessage(
            minutes === '60' ? messages.hours : messages.minutes,
            { count: minutes === '60' ? 1 : Number(minutes) },
          ),
        }))}
        value={String(value.idleTimeoutMinutes)}
        disabled={disabled}
        onChange={(v: string | number | undefined) =>
          update({ idleTimeoutMinutes: parseIdleTimeout(v) })
        }
      />
      <UnconnectedField
        name="requireUnlockOnEnter"
        label={intl.formatMessage(
          messages.requireUnlockWhenEnteringAnInterview,
        )}
        inline
        component={ToggleField}
        value={value.requireUnlockOnEnter}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnEnter: v === true })
        }
      />
      <UnconnectedField
        name="requireUnlockOnExit"
        label={intl.formatMessage(messages.requireUnlockWhenExitingAnInterview)}
        inline
        component={ToggleField}
        value={value.requireUnlockOnExit}
        disabled={disabled}
        onChange={(v: boolean | undefined) =>
          update({ requireUnlockOnExit: v === true })
        }
      />
      <UnconnectedField
        name="requireUnlockOnExport"
        label={intl.formatMessage(messages.requireUnlockBeforeExportingData)}
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
