'use client';

import { createId } from '@paralleldrive/cuid2';
import { HelpCircle, WandSparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useState,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { z } from 'zod/mini';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { createParticipant, updateParticipant } from '~/actions/participants';
import ActionError from '~/components/ActionError';
import FormDialog from '~/components/FormDialog';
import InfoTooltip from '~/components/InfoTooltip';
import type { Participant } from '~/lib/db/generated/client';
import { createParticipantSchemas } from '~/schemas/participant';

const messages = defineMessages({
  error: {
    id: 'fresco.ParticipantModal.error',
    defaultMessage: 'Error',
    description:
      'Title of the red error box at the top of the add/edit participant dialog, shown above the message when saving the participant failed. A noun.',
  },

  copyEditParticipant: {
    id: 'fresco.participants.ParticipantModal.copyEditParticipant',
    defaultMessage: 'Edit Participant',
    description:
      "Title of the dialog for changing an existing study participant's identifier and label, opened from the participants table. Edit is a verb.",
  },
  copyAddParticipant: {
    id: 'fresco.participants.ParticipantModal.copyAddParticipant',
    defaultMessage: 'Add Participant',
    description:
      'Title of the dialog for adding one new study participant, opened from the participants page. Add is a verb.',
  },
  copyUpdate: {
    id: 'fresco.participants.ParticipantModal.copyUpdate',
    defaultMessage: 'Update',
    description:
      'Label of the submit button of the participant dialog when editing an existing participant; saves the changes. A verb.',
  },
  copySubmit: {
    id: 'fresco.participants.ParticipantModal.copySubmit',
    defaultMessage: 'Submit',
    description:
      'Label of the submit button of the participant dialog when adding a new participant; creates the participant. A verb.',
  },
  label: {
    id: 'fresco.participants.ParticipantModal.label',
    defaultMessage: 'Label',
    description:
      'Label of the optional field in the participant dialog for a human-readable name or project label for the participant. A noun.',
  },
  thisOptionalFieldAllowsYouToProvide: {
    id: 'fresco.participants.ParticipantModal.thisOptionalFieldAllowsYouToProvide',
    defaultMessage:
      'This optional field allows you to provide a human readable label. This could be a name, or an internal project label for this participant. It does not need to be unique, and will not be exposed to participants.',
    description:
      "Hint under the Label field in the participant dialog. Explains that the label is optional, only for the researcher's use, and not shown to the participant.",
  },
  enterOptionalLabel: {
    id: 'fresco.participants.ParticipantModal.enterOptionalLabel',
    defaultMessage: 'Enter optional label...',
    description:
      'Placeholder inside the empty Label field of the participant dialog. Enter is a verb.',
  },
  optionalHumanReadableLabel: {
    id: 'fresco.participants.ParticipantModal.optionalHumanReadableLabel',
    defaultMessage: 'Optional human-readable label',
    description:
      'Short hint passed to the Label field of the participant dialog describing what to enter in it.',
  },
  thisIdentifierIsAlreadyInUse: {
    id: 'fresco.participants.ParticipantModal.thisIdentifierIsAlreadyInUse',
    defaultMessage: 'This identifier is already in use.',
    description:
      'Validation error under the Participant Identifier field of the participant dialog when another participant already has the same identifier.',
  },
  thisCouldBeAStudyIDA: {
    id: 'fresco.participants.ParticipantModal.thisCouldBeAStudyIDA',
    defaultMessage:
      'This could be a study ID, a number, or any other unique identifier. It should be unique for each participant, and should not be easy to guess',
    description:
      'Hint under the Participant Identifier field of the participant dialog, followed by a help icon that opens an explanation. Says what to use as identifier and that it must be unique and hard to guess.',
  },
  participantIdentifiers: {
    id: 'fresco.participants.ParticipantModal.participantIdentifiers',
    defaultMessage: 'Participant Identifiers',
    description:
      'Title of the help popover opened from the help icon beside the Participant Identifier field in the participant dialog. Plural noun.',
  },
  participantIdentifiersAreUsedByFrescoTo: {
    id: 'fresco.participants.ParticipantModal.participantIdentifiersAreUsedByFrescoTo',
    defaultMessage:
      'Participant identifiers are used by Fresco to onboard participants. They might be exposed to the participant during this process via the participation URL, and so must <tag1>not</tag1> contain any sensitive information, and must not be easy for other participants to guess (e.g. sequential numbers, or easily guessable strings).',
    description:
      'Body of the help popover for the Participant Identifier field in the participant dialog. Warns that identifiers can appear in the participation URL. The tag1 element makes the word "not" bold; keep it.',
  },
  participantIdentifier: {
    id: 'fresco.participants.ParticipantModal.participantIdentifier',
    defaultMessage: 'Participant Identifier',
    description:
      'Label of the required field in the participant dialog for the unique identifier of the study participant.',
  },
  enterAnIdentifier: {
    id: 'fresco.participants.ParticipantModal.enterAnIdentifier',
    defaultMessage: 'Enter an identifier...',
    description:
      'Placeholder inside the empty Participant Identifier field of the participant dialog. Enter is a verb.',
  },
  uniqueIdentifierForThisParticipant: {
    id: 'fresco.participants.ParticipantModal.uniqueIdentifierForThisParticipant',
    defaultMessage: 'Unique identifier for this participant',
    description:
      'Short hint passed to the Participant Identifier field of the participant dialog describing what to enter in it.',
  },
  generate: {
    id: 'fresco.participants.ParticipantModal.generate',
    defaultMessage: 'Generate',
    description:
      'Button inside the Participant Identifier field of the participant dialog that fills the field with a randomly generated identifier. A verb.',
  },
});

type ParticipantModalProps = {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  editingParticipant?: Participant | null;
  setEditingParticipant?: Dispatch<SetStateAction<Participant | null>>;
  existingParticipants: Participant[];
};

function ParticipantModal({
  open,
  setOpen,
  editingParticipant,
  setEditingParticipant,
  existingParticipants,
}: ParticipantModalProps) {
  const intl = useAppIntl();
  const { participantLabelSchema } =
    createParticipantSchemas(createMessageError);

  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (data: unknown) => {
    setError(null);

    const result = editingParticipant
      ? await updateParticipant({
          existingIdentifier: editingParticipant.identifier,
          formData: data,
        })
      : await createParticipant([data]);

    if (result.error) {
      setError(result.error);
      return {
        success: false,
      };
    }

    router.refresh();
    setOpen(false);
    return { success: true };
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditingParticipant?.(null);
      setError(null);
    }
  };

  // Use initialValues to set values when editing
  const initialValues = editingParticipant
    ? {
        identifier: editingParticipant.identifier,
        label: editingParticipant.label ?? '',
      }
    : undefined;

  return (
    <FormStoreProvider>
      <FormDialog
        open={open}
        closeDialog={() => handleOpenChange(false)}
        title={
          editingParticipant
            ? intl.formatMessage(messages.copyEditParticipant)
            : intl.formatMessage(messages.copyAddParticipant)
        }
        renderFooter={(heldOpen) => (
          <>
            <Button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={heldOpen}
            >
              {intl.formatMessage(commonMessages.cancel)}
            </Button>
            <SubmitButton form="participantForm">
              {editingParticipant
                ? intl.formatMessage(messages.copyUpdate)
                : intl.formatMessage(messages.copySubmit)}
            </SubmitButton>
          </>
        )}
      >
        {error && (
          <div className="mb-6 flex flex-wrap">
            <ActionError
              errorTitle={intl.formatMessage(messages.error)}
              errorDescription={error}
            />
          </div>
        )}
        <FormWithoutProvider
          key={editingParticipant?.id ?? 'new'} // Force form reset when editing different participant
          onSubmit={handleSubmit}
          id="participantForm"
        >
          <IdentifierField
            existingParticipants={existingParticipants}
            editingParticipant={editingParticipant}
            initialValue={initialValues?.identifier}
          />
          <Field
            key="label"
            name="label"
            label={intl.formatMessage(messages.label)}
            hint={intl.formatMessage(
              messages.thisOptionalFieldAllowsYouToProvide,
            )}
            placeholder={intl.formatMessage(messages.enterOptionalLabel)}
            custom={{
              schema: participantLabelSchema,
              hint: intl.formatMessage(messages.optionalHumanReadableLabel),
            }}
            component={InputField}
            type="text"
            initialValue={initialValues?.label}
          />
        </FormWithoutProvider>
      </FormDialog>
    </FormStoreProvider>
  );
}

const renderStrongChunks = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

// Rendered through base-ui's `render` prop, which merges the popover
// description props into the returned element.
const renderIdentifierDescription = (props: ComponentProps<'p'>) => (
  <Paragraph {...props}>
    <AppMessage
      message={messages.participantIdentifiersAreUsedByFrescoTo}
      values={{ tag1: renderStrongChunks }}
    />
  </Paragraph>
);

// Separate component to handle the identifier field with generate button
function IdentifierField({
  existingParticipants,
  editingParticipant,
  initialValue,
}: {
  existingParticipants: Participant[];
  editingParticipant?: Participant | null;
  initialValue?: string;
}) {
  const intl = useAppIntl();
  const { participantIdentifierSchema } =
    createParticipantSchemas(createMessageError);

  const setFieldValue = useFormStore((state) => state.setFieldValue);

  // Create validation that includes the uniqueness check
  const identifierValidation = participantIdentifierSchema.check(
    z.refine(
      (data) => {
        const existingParticipant = existingParticipants.find(
          (p) => p.identifier === data,
        );
        // Allow the current identifier if editing
        return (
          !existingParticipant ||
          existingParticipant.id === editingParticipant?.id
        );
      },
      {
        message: createMessageError(messages.thisIdentifierIsAlreadyInUse),
      },
    ),
  );

  const hint = (
    <>
      {intl.formatMessage(messages.thisCouldBeAStudyIDA)}{' '}
      <InfoTooltip
        trigger={<HelpCircle className="inline-block size-4" />}
        title={intl.formatMessage(messages.participantIdentifiers)}
        description={renderIdentifierDescription}
      />
    </>
  );

  return (
    <Field
      key="identifier"
      name="identifier"
      label={intl.formatMessage(messages.participantIdentifier)}
      hint={hint}
      placeholder={intl.formatMessage(messages.enterAnIdentifier)}
      custom={{
        schema: identifierValidation,
        hint: intl.formatMessage(messages.uniqueIdentifierForThisParticipant),
      }}
      type="text"
      component={InputField}
      suffixComponent={
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => {
            setFieldValue('identifier', `p-${createId()}`);
          }}
          icon={<WandSparkles />}
        >
          {intl.formatMessage(messages.generate)}
        </Button>
      }
      initialValue={initialValue}
    />
  );
}

export default ParticipantModal;
