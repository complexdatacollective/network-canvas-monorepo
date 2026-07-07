import { Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import { IconButton } from '../../Button';
import ProgressBar from '../../ProgressBar';
import { cx } from '../../utils/cva';
import { getPasswordStrength } from './getPasswordStrength';
import InputField from './InputField';

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
  const [showPassword, setShowPassword] = useState(false);
  const masked = Boolean(suppressPasswordManager) && supportsTextSecurity;

  const strength = useMemo(
    () =>
      showStrengthMeter ? getPasswordStrength(String(props.value ?? '')) : null,
    [showStrengthMeter, props.value],
  );

  return (
    <div className="flex flex-col gap-1">
      <InputField
        placeholder="Enter password"
        suffixComponent={
          <IconButton
            variant="text"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            icon={showPassword ? <EyeOff /> : <Eye />}
          />
        }
        {...props}
        type={showPassword || masked ? 'text' : 'password'}
        autoComplete={suppressPasswordManager ? 'off' : props.autoComplete}
        className={cx(
          masked && !showPassword && '[-webkit-text-security:disc]',
          props.className,
        )}
      />
      {showStrengthMeter && strength && strength.score > 0 && (
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
            label="Password strength"
          />
          <span className="text-xs font-medium">{strength.label}</span>
        </div>
      )}
    </div>
  );
}
