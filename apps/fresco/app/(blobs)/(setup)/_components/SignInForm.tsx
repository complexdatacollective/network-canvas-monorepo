'use client';

import { useRouter } from 'next/navigation';

import { login, recoveryCodeLogin } from '~/actions/auth';
import { verifyTwoFactor } from '~/actions/twoFactor';
import {
  generateAuthenticationOptions,
  verifyAuthentication,
} from '~/actions/webauthn';
import { SignInFormView } from '~/components/auth/SignInFormView';

/** Binds `SignInFormView` to the Next.js Server Actions and router. */
export const SignInForm = () => {
  const router = useRouter();

  return (
    <SignInFormView
      login={login}
      recoveryCodeLogin={recoveryCodeLogin}
      verifyTwoFactor={verifyTwoFactor}
      generateAuthenticationOptions={generateAuthenticationOptions}
      verifyAuthentication={verifyAuthentication}
      onSignedIn={() => router.push('/dashboard')}
    />
  );
};
