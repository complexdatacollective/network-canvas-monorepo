import { Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { IconButton } from '../../Button';
import ProgressBar from '../../ProgressBar';
import { cx } from '../../utils/cva';
import { getPasswordStrength } from './getPasswordStrength';
import InputField from './InputField';

const messages = defineMessages({
  placeholder: {
    id: 'frescoUi.passwordField.placeholder',
    defaultMessage: 'Enter password',
    description: 'Default placeholder of a password input.',
  },
  toggleVisibility: {
    id: 'frescoUi.passwordField.toggleVisibility',
    defaultMessage:
      '{visible, select, true {Hide password} other {Show password}}',
    description:
      'Accessible name of the visibility toggle; says what pressing it will do.',
  },
  strengthMeterLabel: {
    id: 'frescoUi.passwordField.strengthMeterLabel',
    defaultMessage: 'Password strength',
    description: 'Accessible name of the password strength meter.',
  },
  strengthWeak: {
    id: 'frescoUi.passwordField.strengthWeak',
    defaultMessage: 'Weak',
    description: 'Password strength rating shown beside the meter.',
  },
  strengthFair: {
    id: 'frescoUi.passwordField.strengthFair',
    defaultMessage: 'Fair',
    description: 'Password strength rating shown beside the meter.',
  },
  strengthGood: {
    id: 'frescoUi.passwordField.strengthGood',
    defaultMessage: 'Good',
    description: 'Password strength rating shown beside the meter.',
  },
  strengthStrong: {
    id: 'frescoUi.passwordField.strengthStrong',
    defaultMessage: 'Strong',
    description: 'Password strength rating shown beside the meter.',
  },
});

// Presentation for getPasswordStrength's stable API labels: the function keeps
// returning its literal English `label` (a public contract), and the rendered
// text is looked up from the score here instead.
const strengthLabelMessages: Record<1 | 2 | 3 | 4, MessageDescriptor> = {
  1: messages.strengthWeak,
  2: messages.strengthFair,
  3: messages.strengthGood,
  4: messages.strengthStrong,
};

type PasswordFieldProps = Omit<
  React.ComponentProps<typeof InputField>,
  'type'
> & {
  showStrengthMeter?: boolean;
  /**
   * Render the masked value as a text input using `-webkit-text-security`
   * instead of `type="password"`, so browser password managers never treat it
   * as a website credential — no save prompts, no username association, no
   * autofill. For app-internal secrets (device PINs, vault passphrases) that
   * must not end up in a password manager. Where the CSS property is
   * unsupported (e.g. Firefox) the field falls back to a real password input,
   * which may re-enable manager prompts there.
   */
  suppressPasswordManager?: boolean;
};

// -webkit-text-security ships in every WebKit/Blink browser; Firefox has no
// equivalent, so suppression falls back to type="password" there rather than
// showing the secret in clear text.
const supportsTextSecurity =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('-webkit-text-security', 'disc');

export default function PasswordField({
  showStrengthMeter,
  suppressPasswordManager,
  ...props
}: PasswordFieldProps) {
  const intl = useAppIntl();
  const [showPassword, setShowPassword] = useState(false);
  const masked = Boolean(suppressPasswordManager) && supportsTextSecurity;

  const strength = useMemo(
    () => (showStrengthMeter ? getPasswordStrength(props.value ?? '') : null),
    [showStrengthMeter, props.value],
  );

  return (
    <div className="flex flex-col gap-1">
      <InputField
        placeholder={intl.formatMessage(messages.placeholder)}
        suffixComponent={
          <IconButton
            variant="text"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={intl.formatMessage(messages.toggleVisibility, {
              visible: String(showPassword),
            })}
            icon={showPassword ? <EyeOff /> : <Eye />}
          />
        }
        {...props}
        type={showPassword || masked ? 'text' : 'password'}
        autoComplete={suppressPasswordManager ? 'off' : props.autoComplete}
        className={props.className}
        inputClassName={cx(
          masked && !showPassword && '[-webkit-text-security:disc]',
          props.inputClassName,
        )}
      />
      {showStrengthMeter && strength && strength.score !== 0 && (
        <div
          className={cx(
            'flex items-center gap-2 transition-colors duration-200',
            strength.colorClass,
          )}
          aria-live="polite"
        >
          <ProgressBar
            orientation="horizontal"
            percentProgress={strength.percent}
            nudge={false}
            label={intl.formatMessage(messages.strengthMeterLabel)}
          />
          <span className="text-xs font-medium">
            {intl.formatMessage(strengthLabelMessages[strength.score])}
          </span>
        </div>
      )}
    </div>
  );
}
