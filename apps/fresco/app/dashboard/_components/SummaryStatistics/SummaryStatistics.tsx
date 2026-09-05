'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import { type getSummaryStatistics } from '~/queries/summaryStatistics';

import { InterviewIcon, ProtocolIcon } from './Icons';
import StatCard, { StatCardSkeleton } from './StatCard';

const messages = defineMessages({
  protocols: {
    id: 'fresco.SummaryStatistics.SummaryStatistics.protocols',
    defaultMessage: 'Protocols',
    description:
      'Researcher-facing SummaryStatistics / SummaryStatistics: Protocols',
  },
  participants: {
    id: 'fresco.SummaryStatistics.SummaryStatistics.participants',
    defaultMessage: 'Participants',
    description:
      'Researcher-facing SummaryStatistics / SummaryStatistics: Participants',
  },
  participantIcon: {
    id: 'fresco.SummaryStatistics.SummaryStatistics.participantIcon',
    defaultMessage: 'Participant icon',
    description:
      'Researcher-facing SummaryStatistics / SummaryStatistics: Participant icon',
  },
  interviews: {
    id: 'fresco.SummaryStatistics.SummaryStatistics.interviews',
    defaultMessage: 'Interviews',
    description:
      'Researcher-facing SummaryStatistics / SummaryStatistics: Interviews',
  },
});

type SummaryStatisticsProps = {
  dataPromise: ReturnType<typeof getSummaryStatistics>;
};

export default function SummaryStatistics({
  dataPromise,
}: SummaryStatisticsProps) {
  const intl = useAppIntl();

  return (
    <ResponsiveContainer
      className="tablet-landscape:grid-cols-3 desktop:gap-6 grid grid-cols-1 gap-4"
      maxWidth="6xl"
    >
      <Link
        className="focusable @container rounded"
        href="/dashboard/protocols"
        data-testid="stat-card-protocols"
      >
        <Suspense
          fallback={
            <StatCardSkeleton
              title={intl.formatMessage(messages.protocols)}
              icon={<ProtocolIcon />}
            />
          }
        >
          <StatCard
            title={intl.formatMessage(messages.protocols)}
            dataPromise={dataPromise}
            render="protocolCount"
            icon={<ProtocolIcon />}
          />
        </Suspense>
      </Link>
      <Link
        className="focusable @container rounded"
        href="/dashboard/participants"
        data-testid="stat-card-participants"
      >
        <Suspense
          fallback={
            <StatCardSkeleton
              title={intl.formatMessage(messages.participants)}
              icon={
                <Image
                  src="/images/participant.svg"
                  width={50}
                  height={50}
                  alt={intl.formatMessage(messages.participantIcon)}
                  className="max-w-none"
                />
              }
            />
          }
        >
          <StatCard
            title={intl.formatMessage(messages.participants)}
            dataPromise={dataPromise}
            render="participantCount"
            icon={
              <Image
                src="/images/participant.svg"
                width={50}
                height={50}
                alt={intl.formatMessage(messages.participantIcon)}
                className="max-w-none"
              />
            }
          />
        </Suspense>
      </Link>
      <Link
        className="focusable @container rounded"
        href="/dashboard/interviews"
        data-testid="stat-card-interviews"
      >
        <Suspense
          fallback={
            <StatCardSkeleton
              title={intl.formatMessage(messages.interviews)}
              icon={<InterviewIcon />}
            />
          }
        >
          <StatCard
            title={intl.formatMessage(messages.interviews)}
            dataPromise={dataPromise}
            render="interviewCount"
            icon={<InterviewIcon />}
          />
        </Suspense>
      </Link>
    </ResponsiveContainer>
  );
}
