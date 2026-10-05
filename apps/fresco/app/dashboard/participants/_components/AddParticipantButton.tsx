'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import ParticipantModal from '~/app/dashboard/participants/_components/ParticipantModal';
import { type Participant } from '~/lib/db/generated/client';

const messages = defineMessages({
  addParticipant: {
    id: 'fresco.participants.AddParticipantButton.addParticipant',
    defaultMessage: 'Add Participant',
    description:
      'Researcher-facing participants / AddParticipantButton: Add Participant',
  },
});

type AddParticipantButtonProps = {
  existingParticipants: Participant[];
};

function AddParticipantButton({
  existingParticipants,
}: AddParticipantButtonProps) {
  const intl = useAppIntl();

  const [isOpen, setOpen] = useState(false);

  return (
    <>
      <ParticipantModal
        open={isOpen}
        setOpen={setOpen}
        existingParticipants={existingParticipants}
      />
      <Button onClick={() => setOpen(true)} icon={<Plus />}>
        {intl.formatMessage(messages.addParticipant)}
      </Button>
    </>
  );
}

export default AddParticipantButton;
