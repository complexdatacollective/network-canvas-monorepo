'use client';
import { type Route } from 'next';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { SuperJSON } from 'superjson';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import type { Participant, Protocol } from '~/lib/db/generated/client';
import {
  type GetParticipantsForSelectQuery,
  type GetParticipantsForSelectReturnType,
} from '~/queries/participants';
import {
  type GetProtocolsQuery,
  type GetProtocolsReturnType,
} from '~/queries/protocols';

const messages = defineMessages({
  selectAProtocol: {
    id: 'fresco.RecruitmentTestSection.selectAProtocol',
    defaultMessage: 'Select a Protocol...',
    description:
      'Researcher-facing RecruitmentTestSection: Select a Protocol...',
  },
  selectAParticipant: {
    id: 'fresco.RecruitmentTestSection.selectAParticipant',
    defaultMessage: 'Select a Participant...',
    description:
      'Researcher-facing RecruitmentTestSection: Select a Participant...',
  },
  startInterviewWithGET: {
    id: 'fresco.RecruitmentTestSection.startInterviewWithGET',
    defaultMessage: 'Start Interview with GET',
    description:
      'Researcher-facing RecruitmentTestSection: Start Interview with GET',
  },
  startInterviewWithPOST: {
    id: 'fresco.RecruitmentTestSection.startInterviewWithPOST',
    defaultMessage: 'Start Interview with POST',
    description:
      'Researcher-facing RecruitmentTestSection: Start Interview with POST',
  },
});

export default function RecruitmentTestSection({
  protocolsPromise,
  participantsPromise,
  allowAnonymousRecruitmentPromise,
}: {
  protocolsPromise: GetProtocolsReturnType;
  participantsPromise: GetParticipantsForSelectReturnType;
  allowAnonymousRecruitmentPromise: Promise<boolean>;
}) {
  const intl = useAppIntl();

  const rawProtocols = use(protocolsPromise);
  const protocols = SuperJSON.parse<GetProtocolsQuery>(rawProtocols);
  const rawParticipants = use(participantsPromise);
  const participants =
    SuperJSON.parse<GetParticipantsForSelectQuery>(rawParticipants);
  const allowAnonymousRecruitment = use(allowAnonymousRecruitmentPromise);

  const [selectedProtocol, setSelectedProtocol] = useState<Partial<Protocol>>();
  const [selectedParticipant, setSelectedParticipant] = useState<Participant>();

  const router = useRouter();

  useEffect(() => {
    if (allowAnonymousRecruitment) {
      setSelectedParticipant(undefined);
    }
  }, [allowAnonymousRecruitment]);

  const buttonDisabled =
    !selectedProtocol || (!allowAnonymousRecruitment && !selectedParticipant);

  const getInterviewURL = (): Route => {
    if (!selectedParticipant) {
      return `/onboard/${selectedProtocol?.id}` as Route;
    }

    return `/onboard/${selectedProtocol?.id}/?participantIdentifier=${encodeURIComponent(
      selectedParticipant.identifier,
    )}` as Route;
  };

  return (
    <>
      <div className="tablet-landscape:flex-row flex flex-col gap-4">
        <SelectField
          aria-label={intl.formatMessage(messages.selectAProtocol)}
          name="Protocol"
          options={protocols.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(value) => {
            const protocol = protocols.find(
              (candidate) => candidate.id === value,
            ) as Protocol;

            setSelectedProtocol(protocol);
          }}
          value={selectedProtocol?.id}
          placeholder={intl.formatMessage(messages.selectAProtocol)}
        />
        <SelectField
          aria-label={intl.formatMessage(messages.selectAParticipant)}
          name="Participant"
          options={participants.map((p) => ({
            value: p.id,
            label: p.identifier,
          }))}
          onChange={(value) => {
            const participant = participants?.find(
              (candidate) => candidate.id === value,
            );

            setSelectedParticipant(participant);
          }}
          value={selectedParticipant?.id}
          placeholder={intl.formatMessage(messages.selectAParticipant)}
        />
      </div>
      <div className="tablet-landscape:flex-row mt-4 flex flex-col gap-2">
        <Button
          disabled={buttonDisabled}
          onClick={() => router.push(getInterviewURL())}
        >
          {intl.formatMessage(messages.startInterviewWithGET)}
        </Button>
        <Button
          disabled={buttonDisabled}
          onClick={async () =>
            await fetch(window.location.origin + getInterviewURL(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                participantIdentifier: selectedParticipant?.identifier,
              }),
            }).then((response) => {
              if (response.redirected) {
                window.location.href = response.url;
              }
            })
          }
        >
          {intl.formatMessage(messages.startInterviewWithPOST)}
        </Button>
      </div>
    </>
  );
}
