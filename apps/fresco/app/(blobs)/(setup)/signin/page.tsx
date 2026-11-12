import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { defineMessages } from '@codaco/app-i18n/messages';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { containerClasses } from '~/components/ContainerClasses';
import { env } from '~/env';
import { getServerIntl } from '~/i18n/server';
import { getServerSession } from '~/lib/auth/guards';
import { TWO_FACTOR_SETUP_PATH } from '~/lib/auth/paths';
import { requiresTwoFactorSetup } from '~/lib/auth/twoFactorPolicy';

import SandboxCredentials from '../_components/SandboxCredentials';
import { SignInForm } from '../_components/SignInForm';

const messages = defineMessages({
  pageDescription: {
    id: 'fresco.signin.metadata.pageDescription',
    defaultMessage: 'Sign in to Fresco.',
    description:
      'Meta description of the sign-in page, used by search engines and link previews. Fresco is the product name; the sentence invites the researcher to sign in.',
  },

  pageTitle: {
    id: 'fresco.signin.metadata.pageTitle',
    defaultMessage: 'Fresco - Sign In',
    description:
      'Browser tab title of the sign-in page. Fresco is the product name; Sign In is the name of the page.',
  },

  signInToFresco: {
    id: 'fresco.signin.page.signInToFresco',
    defaultMessage: 'Sign In To Fresco',
    description:
      'Heading above the sign-in form on the page where a researcher signs in to the Fresco installation. It is a heading, not a button.',
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const intl = await getServerIntl();
  return {
    title: intl.formatMessage(messages.pageTitle),
    description: intl.formatMessage(messages.pageDescription),
  };
}

export default async function Page() {
  const intl = await getServerIntl();

  await connection();
  const session = await getServerSession();
  if (session) {
    redirect(
      (await requiresTwoFactorSetup(session.user.userId))
        ? TWO_FACTOR_SETUP_PATH
        : '/dashboard',
    );
  }
  return (
    <MotionSurface
      noContainer
      className={cx(
        containerClasses,
        'phone-landscape:w-md mx-auto w-full rounded shadow-none',
      )}
      baseSize="content"
    >
      <Heading level="h2">
        {intl.formatMessage(messages.signInToFresco)}
      </Heading>
      {env.SANDBOX_MODE && <SandboxCredentials />}
      <SignInForm />
    </MotionSurface>
  );
}
