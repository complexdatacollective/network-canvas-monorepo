import { type SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { DataTableSkeleton } from '@codaco/fresco-ui/DataTable/DataTableSkeleton';
import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import ParticipantsTable from '~/app/dashboard/_components/ParticipantsTable/ParticipantsTable';
import { searchParamsCache } from '~/app/dashboard/_components/ParticipantsTable/searchParams';
import { getServerIntl } from '~/i18n/server';
import { requirePageAuth } from '~/lib/auth/guards';
import { requireAppNotExpired } from '~/queries/appSettings';

const messages = defineMessages({
  participants: {
    id: 'fresco.participants.page.participants',
    defaultMessage: 'Participants',
    description: 'Researcher-facing participants / page: Participants',
  },
  viewAndManageYourParticipants: {
    id: 'fresco.participants.page.viewAndManageYourParticipants',
    defaultMessage: 'View and manage your participants.',
    description:
      'Researcher-facing participants / page: View and manage your participants.',
  },
});

export default async function ParticipantPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const intl = await getServerIntl();

  return (
    <>
      <PageHeader
        headerText={intl.formatMessage(messages.participants)}
        subHeaderText={intl.formatMessage(
          messages.viewAndManageYourParticipants,
        )}
        data-testid="participants-page-header"
      />
      <Suspense
        fallback={
          <ResponsiveContainer
            maxWidth="6xl"
            baseSize="content"
            container={false}
          >
            <DataTableSkeleton
              columnCount={4}
              searchableColumnCount={1}
              headerItemsCount={3}
            />
          </ResponsiveContainer>
        }
      >
        <AuthenticatedParticipants searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AuthenticatedParticipants({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAppNotExpired();
  await requirePageAuth();
  const parsed = await searchParamsCache.parse(searchParams);
  return (
    <ResponsiveContainer maxWidth="6xl" baseSize="content" container={false}>
      <ParticipantsTable searchParams={parsed} />
    </ResponsiveContainer>
  );
}
