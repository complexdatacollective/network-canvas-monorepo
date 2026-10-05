import { type Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

import { defineMessages } from '@codaco/app-i18n/messages';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { containerClasses } from '~/components/ContainerClasses';
import { getServerIntl } from '~/i18n/server';
import { getServerSession } from '~/lib/auth/guards';
import { requiresTwoFactorSetup } from '~/lib/auth/twoFactorPolicy';
import { prisma } from '~/lib/db';

import TwoFactorSetupPrompt from '../../_components/TwoFactorSetupPrompt';

const messages = defineMessages({
  pageDescription: {
    id: 'fresco.signin.twoFactorSetup.metadata.pageDescription',
    defaultMessage: 'Set up two-factor authentication to continue to Fresco.',
    description:
      'Browser metadata description for the page that makes a researcher set up mandatory two-factor authentication after signing in.',
  },
  pageTitle: {
    id: 'fresco.signin.twoFactorSetup.metadata.pageTitle',
    defaultMessage: 'Fresco - Set Up Two-Factor Authentication',
    description:
      'Browser tab title for the page that makes a researcher set up mandatory two-factor authentication after signing in.',
  },
  setUpTwoFactorAuthentication: {
    id: 'fresco.signin.twoFactorSetup.page.setUpTwoFactorAuthentication',
    defaultMessage: 'Set Up Two-Factor Authentication',
    description:
      'Heading of the page that makes a researcher set up mandatory two-factor authentication after signing in.',
  },
  thisInstallationRequiresTwoFactor: {
    id: 'fresco.signin.twoFactorSetup.page.thisInstallationRequiresTwoFactor',
    defaultMessage:
      'This installation of Fresco requires two-factor authentication for every account that signs in with a password.',
    description:
      'Explains why the researcher is being asked to set up two-factor authentication before they can reach the dashboard.',
  },
  setItUpNowToContinue: {
    id: 'fresco.signin.twoFactorSetup.page.setItUpNowToContinue',
    defaultMessage:
      'Set it up now with an authenticator app to continue to the dashboard. You will be given recovery codes to keep somewhere safe in case you lose the app.',
    description:
      'Tells the researcher what setting up two-factor authentication involves and that the dashboard opens once it is done.',
  },
});

export async function generateMetadata(): Promise<Metadata> {
  const intl = await getServerIntl();
  return {
    title: intl.formatMessage(messages.pageTitle),
    description: intl.formatMessage(messages.pageDescription),
  };
}

/**
 * The one page an account held at the mandatory two-factor gate may use. It
 * does not use `requirePageAuth`, which would redirect straight back here; an
 * account the gate does not hold has no business on it and goes to the
 * dashboard instead.
 */
export default async function Page() {
  const intl = await getServerIntl();

  await connection();
  const session = await getServerSession();
  if (!session) redirect('/signin');
  if (!(await requiresTwoFactorSetup(session.user.userId))) {
    redirect('/dashboard');
  }

  const userCount = await prisma.user.count();

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
        {intl.formatMessage(messages.setUpTwoFactorAuthentication)}
      </Heading>
      <Paragraph intent="lead">
        {intl.formatMessage(messages.thisInstallationRequiresTwoFactor)}
      </Paragraph>
      <Paragraph>{intl.formatMessage(messages.setItUpNowToContinue)}</Paragraph>
      <TwoFactorSetupPrompt
        username={session.user.username}
        userCount={userCount}
      />
    </MotionSurface>
  );
}
