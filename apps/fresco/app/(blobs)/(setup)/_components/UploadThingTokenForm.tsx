'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppErrorMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { Button } from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { setUploadThingToken } from '~/actions/appSettings';
import { setStorageProvider } from '~/actions/storageProvider';
import { captureClientException } from '~/lib/posthog-client';
import { createUploadThingSchemas } from '~/schemas/appSettings';

const messages = defineMessages({
  copyAnUnexpectedErrorOccurred: {
    id: 'fresco.UploadThingTokenForm.copyAnUnexpectedErrorOccurred',
    defaultMessage: 'An unexpected error occurred',
    description:
      'Generic error shown in the UploadThing storage step of the setup wizard when saving the token or continuing fails unexpectedly.',
  },
  copyFailedToSetStorageProvider: {
    id: 'fresco.UploadThingTokenForm.copyFailedToSetStorageProvider',
    defaultMessage: 'Failed to set storage provider.',
    description:
      'Error shown in the UploadThing storage step of the setup wizard when the token was saved but selecting UploadThing as the storage provider failed.',
  },
  copySaving: {
    id: 'fresco.UploadThingTokenForm.copySaving',
    defaultMessage: 'Saving...',
    description:
      'Label of the submit button in the UploadThing storage step of the setup wizard while the token is being saved.',
  },
  theUploadThingTokenIsConfiguredViaAn: {
    id: 'fresco.UploadThingTokenForm.theUploadThingTokenIsConfiguredViaAn',
    defaultMessage:
      'The UploadThing token is configured via an environment variable and cannot be changed here.',
    description:
      'Information banner at the top of the UploadThing storage step of the setup wizard when the installation already supplies the UploadThing API token through an environment variable.',
  },
  uPLOADTHINGTOKEN: {
    id: 'fresco.UploadThingTokenForm.uPLOADTHINGTOKEN',
    defaultMessage: 'UPLOADTHING_TOKEN',
    description:
      'Label of the field for the UploadThing API token in the setup wizard. It is the name of the environment variable; do not translate it.',
  },
  uPLOADTHINGTOKEN2: {
    id: 'fresco.UploadThingTokenForm.uPLOADTHINGTOKEN2',
    defaultMessage: 'UPLOADTHING_TOKEN=******************',
    description:
      'Placeholder inside the UploadThing API token field in the setup wizard, showing the shape of the value to paste. Do not translate.',
  },
  copyAndPasteTheFullTokenFrom: {
    id: 'fresco.UploadThingTokenForm.copyAndPasteTheFullTokenFrom',
    defaultMessage:
      'Copy and paste the full token from your UploadThing dashboard.',
    description:
      'Hint under the UploadThing API token field in the setup wizard, telling the researcher where to get the token. Copy and paste are actions, not buttons.',
  },
  pasteTheFullTokenIncludingTheUPLOADTHING: {
    id: 'fresco.UploadThingTokenForm.pasteTheFullTokenIncludingTheUPLOADTHING',
    defaultMessage:
      'Paste the full token including the UPLOADTHING_TOKEN= prefix',
    description:
      "Hint for the UploadThing API token field in the setup wizard, passed to the field's validation. Tells the researcher to paste the whole value including the UPLOADTHING_TOKEN= prefix.",
  },
  saveAndContinue: {
    id: 'fresco.UploadThingTokenForm.saveAndContinue',
    defaultMessage: 'Save and continue',
    description:
      'Label of the submit button in the UploadThing storage step of the setup wizard; saves the token and moves to the protocol upload step.',
  },
});

type UploadThingTokenFormProps = {
  disabled?: boolean;
};

export const UploadThingTokenForm = (props: UploadThingTokenFormProps) => (
  <FormStoreProvider>
    <UploadThingTokenFormWithoutProvider {...props} />
  </FormStoreProvider>
);

/**
 * The form without its store provider, for a host that needs to read the
 * store itself — a dialog that must stay open while the token is saved.
 */
export const UploadThingTokenFormWithoutProvider = ({
  disabled = false,
}: UploadThingTokenFormProps) => {
  const intl = useAppIntl();
  const { createUploadThingTokenSchema } =
    createUploadThingSchemas(createMessageError);

  const router = useRouter();
  const [isContinuing, setIsContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const handleContinue = async () => {
    setIsContinuing(true);
    setContinueError(null);
    try {
      const result = await setStorageProvider('uploadthing');
      if (!result.success) {
        setContinueError(result.error);
        return;
      }
      router.push('/setup?step=3');
    } catch (caught) {
      captureClientException(caught);
      setContinueError(
        createMessageError(messages.copyAnUnexpectedErrorOccurred),
      );
    } finally {
      setIsContinuing(false);
    }
  };

  const handleSubmit = async (rawData: unknown) => {
    if (disabled) {
      return { success: true as const };
    }

    try {
      const result = await setUploadThingToken(rawData);

      if (!result.success) {
        return {
          success: false as const,
          fieldErrors: result.fieldErrors,
        };
      }

      const providerResult = await setStorageProvider('uploadthing');
      if (!providerResult.success) {
        return {
          success: false as const,
          formErrors: [
            providerResult.error ??
              createMessageError(messages.copyFailedToSetStorageProvider),
          ],
        };
      }

      router.push('/setup?step=3');

      return {
        success: true as const,
      };
    } catch (error) {
      captureClientException(error);
      const message = createMessageError(
        messages.copyAnUnexpectedErrorOccurred,
      );
      return {
        success: false as const,
        formErrors: [message],
      };
    }
  };

  return (
    <FormWithoutProvider onSubmit={handleSubmit}>
      {disabled && (
        <Alert variant="info">
          <AlertDescription>
            {intl.formatMessage(messages.theUploadThingTokenIsConfiguredViaAn)}
          </AlertDescription>
        </Alert>
      )}
      <Field
        key="uploadThingToken"
        name="uploadThingToken"
        label={intl.formatMessage(messages.uPLOADTHINGTOKEN)}
        placeholder={intl.formatMessage(messages.uPLOADTHINGTOKEN2)}
        hint={intl.formatMessage(messages.copyAndPasteTheFullTokenFrom)}
        custom={{
          schema: createUploadThingTokenSchema,
          hint: intl.formatMessage(
            messages.pasteTheFullTokenIncludingTheUPLOADTHING,
          ),
        }}
        component={InputField}
        type="text"
        disabled={disabled}
        initialValue={disabled ? 'UPLOADTHING_TOKEN=••••••••' : undefined}
      />
      {disabled ? (
        <>
          {continueError && (
            <p className="text-destructive text-sm">
              <AppErrorMessage error={continueError} />
            </p>
          )}
          <Button
            onClick={handleContinue}
            color="primary"
            disabled={isContinuing}
            className="self-start"
          >
            {isContinuing
              ? intl.formatMessage(messages.copySaving)
              : intl.formatMessage(commonMessages.continue)}
          </Button>
        </>
      ) : (
        <SubmitButton key="submit" className="mt-6">
          {intl.formatMessage(messages.saveAndContinue)}
        </SubmitButton>
      )}
    </FormWithoutProvider>
  );
};
