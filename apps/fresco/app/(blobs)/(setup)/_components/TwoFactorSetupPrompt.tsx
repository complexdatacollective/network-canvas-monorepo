'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import UserMenu from '~/app/dashboard/_components/UserMenu';
import { useTwoFactorSetup } from '~/components/TwoFactorSetup';

const messages = defineMessages({
  signedInAs: {
    id: 'fresco.TwoFactorSetupPrompt.signedInAs',
    defaultMessage: 'Signed in as {username}',
    description:
      'Names the account that is being asked to set up two-factor authentication. The username is literal data, not translated copy.',
  },
  setUpTwoFactorAuthentication: {
    id: 'fresco.TwoFactorSetupPrompt.setUpTwoFactorAuthentication',
    defaultMessage: 'Set up two-factor authentication',
    description:
      'Button that opens the two-factor authentication setup wizard on the mandatory setup page.',
  },
});

/**
 * The control side of the mandatory two-factor setup page: the same setup
 * wizard the settings page uses, and a way out for a researcher who would
 * rather sign out than enrol on this device.
 */
export default function TwoFactorSetupPrompt({
  username,
  userCount,
}: {
  username: string;
  userCount: number;
}) {
  const intl = useAppIntl();
  const router = useRouter();
  const startTwoFactorSetup = useTwoFactorSetup(userCount);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const handleSetUp = async () => {
    setIsSettingUp(true);
    try {
      const completed = await startTwoFactorSetup();
      if (completed) {
        router.push('/dashboard');
        return;
      }
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-6">
      <Button
        color="primary"
        onClick={() => void handleSetUp()}
        disabled={isSettingUp}
        icon={<ShieldCheck />}
      >
        {intl.formatMessage(messages.setUpTwoFactorAuthentication)}
      </Button>
      <div className="tablet-landscape:flex-row tablet-landscape:items-center tablet-landscape:justify-between flex flex-col gap-3">
        <Paragraph intent="smallText" margin="none">
          {intl.formatMessage(messages.signedInAs, { username })}
        </Paragraph>
        <UserMenu />
      </div>
    </div>
  );
}
