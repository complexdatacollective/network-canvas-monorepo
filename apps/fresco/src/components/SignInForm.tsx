import { useNavigate } from '@tanstack/react-router';

import { SignInFormView } from '~/components/auth/SignInFormView';
import { login, recoveryCodeLogin, verifyTwoFactor } from '~/src/server/auth';
import {
  generateAuthenticationOptions,
  verifyAuthentication,
} from '~/src/server/webauthn';

/**
 * Binds `SignInFormView` to the TanStack Start server functions and router.
 *
 * The only real difference from the Next.js binding is the argument shape:
 * `createServerFn(...).inputValidator(...)` is invoked as `fn({ data })`, so
 * each call gets a one-line wrapper.
 */
export const SignInForm = () => {
  const navigate = useNavigate();

  return (
    <SignInFormView
      login={(data) => login({ data })}
      recoveryCodeLogin={(data) => recoveryCodeLogin({ data })}
      verifyTwoFactor={(data) => verifyTwoFactor({ data })}
      generateAuthenticationOptions={() => generateAuthenticationOptions()}
      verifyAuthentication={(data) => verifyAuthentication({ data })}
      onSignedIn={() => void navigate({ to: '/dashboard/interviews' })}
    />
  );
};
