import Image from 'next/image';
import { type SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { DataTableSkeleton } from '@codaco/fresco-ui/DataTable/DataTableSkeleton';
import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import Heading from '@codaco/fresco-ui/typography/Heading';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getServerIntl } from '~/i18n/server';
import { requirePageAuth } from '~/lib/auth/guards';
import { fetchActivities } from '~/queries/activityFeed';
import { requireAppNotExpired } from '~/queries/appSettings';
import { getSummaryStatistics } from '~/queries/summaryStatistics';

import ActivityFeed from './_components/ActivityFeed/ActivityFeed';
import { searchParamsCache } from './_components/ActivityFeed/SearchParams';
import {
  InterviewIcon,
  ProtocolIcon,
} from './_components/SummaryStatistics/Icons';
import { StatCardSkeleton } from './_components/SummaryStatistics/StatCard';
import SummaryStatistics from './_components/SummaryStatistics/SummaryStatistics';
import UpdateUploadThingTokenAlert from './_components/UpdateUploadThingTokenAlert';
import AnonymousRecruitmentWarning from './protocols/_components/AnonymousRecruitmentWarning';

const messages = defineMessages({
  dashboard: {
    id: 'fresco.page.dashboard',
    defaultMessage: 'Dashboard',
    description: 'Researcher-facing page: Dashboard',
  },
  welcomeToFrescoThisPageProvidesAn: {
    id: 'fresco.page.welcomeToFrescoThisPageProvidesAn',
    defaultMessage:
      'Welcome to Fresco! This page provides an overview of your recent activity and key metrics.',
    description:
      'Researcher-facing page: Welcome to Fresco! This page provides an overview of your recent activity and key metrics.',
  },
  protocols: {
    id: 'fresco.page.protocols',
    defaultMessage: 'Protocols',
    description: 'Researcher-facing page: Protocols',
  },
  participants: {
    id: 'fresco.page.participants',
    defaultMessage: 'Participants',
    description: 'Researcher-facing page: Participants',
  },
  participantIcon: {
    id: 'fresco.page.participantIcon',
    defaultMessage: 'Participant icon',
    description: 'Researcher-facing page: Participant icon',
  },
  interviews: {
    id: 'fresco.page.interviews',
    defaultMessage: 'Interviews',
    description: 'Researcher-facing page: Interviews',
  },
  recentActivity: {
    id: 'fresco.page.recentActivity',
    defaultMessage: 'Recent Activity',
    description: 'Researcher-facing page: Recent Activity',
  },
  thisTableSummarizesTheMostRecentActivity: {
    id: 'fresco.page.thisTableSummarizesTheMostRecentActivity',
    defaultMessage:
      'This table summarizes the most recent activity within Fresco. Use it to keep track of new protocols, interviews, and participants.',
    description:
      'Researcher-facing page: This table summarizes the most recent activity within Fresco. Use it to keep track of new protocols, interviews, and par',
  },
});

export default async function Home(props: {
  searchParams: Promise<SearchParams>;
}) {
  const intl = await getServerIntl();

  return (
    <>
      <PageHeader
        headerText={intl.formatMessage(messages.dashboard)}
        subHeaderText={intl.formatMessage(
          messages.welcomeToFrescoThisPageProvidesAn,
        )}
        data-testid="dashboard-page-header"
      />
      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function DashboardContentSkeleton() {
  const intl = await getServerIntl();

  return (
    <>
      <ResponsiveContainer
        className="tablet-landscape:grid-cols-3 desktop:gap-6 grid grid-cols-1 gap-4"
        maxWidth="6xl"
      >
        <StatCardSkeleton
          title={intl.formatMessage(messages.protocols)}
          icon={<ProtocolIcon />}
        />
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
        <StatCardSkeleton
          title={intl.formatMessage(messages.interviews)}
          icon={<InterviewIcon />}
        />
      </ResponsiveContainer>

      <ResponsiveContainer maxWidth="3xl">
        <Heading level="h2">
          {intl.formatMessage(messages.recentActivity)}
        </Heading>
        <Paragraph>
          {intl.formatMessage(
            messages.thisTableSummarizesTheMostRecentActivity,
          )}
        </Paragraph>
      </ResponsiveContainer>
      <ResponsiveContainer maxWidth="6xl" baseSize="100%" container={false}>
        <DataTableSkeleton columnCount={3} filterableColumnCount={1} />
      </ResponsiveContainer>
    </>
  );
}

async function DashboardContent({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const intl = await getServerIntl();

  await requireAppNotExpired();
  await requirePageAuth();

  const cache = await searchParamsCache.parse(searchParamsPromise);

  const summaryPromise = getSummaryStatistics();
  const activitiesPromise = fetchActivities(cache, intl.locale);

  return (
    <>
      <Suspense fallback={null}>
        <AnonymousRecruitmentWarning />
      </Suspense>

      <Suspense fallback={null}>
        <UpdateUploadThingTokenAlert />
      </Suspense>

      <SummaryStatistics dataPromise={summaryPromise} />

      <ResponsiveContainer maxWidth="3xl">
        <Heading level="h2">
          {intl.formatMessage(messages.recentActivity)}
        </Heading>
        <Paragraph>
          {intl.formatMessage(
            messages.thisTableSummarizesTheMostRecentActivity,
          )}
        </Paragraph>
      </ResponsiveContainer>
      <ResponsiveContainer maxWidth="6xl" baseSize="100%" container={false}>
        <ActivityFeed activitiesPromise={activitiesPromise} />
      </ResponsiveContainer>
    </>
  );
}
