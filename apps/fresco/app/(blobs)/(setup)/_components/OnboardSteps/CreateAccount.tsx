'use client';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { SignUpForm } from '~/app/(blobs)/(setup)/_components/SignUpForm';

const messages = defineMessages({
  createAnAdminAccount: {
    id: 'fresco.OnboardSteps.CreateAccount.createAnAdminAccount',
    defaultMessage: 'Create an Admin Account',
    description:
      'Researcher-facing OnboardSteps / CreateAccount: Create an Admin Account',
  },
});

function CreateAccount() {
  const intl = useAppIntl();

  return (
    <div className="w-full">
      <Heading level="h2">
        {intl.formatMessage(messages.createAnAdminAccount)}
      </Heading>
      {/* <Alert variant="warning">
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          It is not possible to recover the account details if they are lost.
          Make sure to store the account details in a safe place, such as a
          password manager.
        </AlertDescription>
      </Alert> */}
      <SignUpForm />
    </div>
  );
}

export default CreateAccount;
