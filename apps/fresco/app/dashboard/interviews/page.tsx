import { type SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { DataTableSkeleton } from '@codaco/fresco-ui/DataTable/DataTableSkeleton';
import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import { getServerIntl } from '~/i18n/server';
import { requirePageAuth } from '~/lib/auth/guards';
import { requireAppNotExpired } from '~/queries/appSettings';

import InterviewsTableServer from '../_components/InterviewsTable/InterviewsTableServer';
import { searchParamsCache } from '../_components/InterviewsTable/searchParams';

const messages = defineMessages({
  interviews: {
    id: 'fresco.interviews.page.interviews',
    defaultMessage: 'Interviews',
    description: 'Researcher-facing interviews / page: Interviews',
  },
  viewAndManageYourInterviewData: {
    id: 'fresco.interviews.page.viewAndManageYourInterviewData',
    defaultMessage: 'View and manage your interview data.',
    description:
      'Researcher-facing interviews / page: View and manage your interview data.',
  },
});

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const intl = await getServerIntl();

  return (
    <>
      <PageHeader
        headerText={intl.formatMessage(messages.interviews)}
        subHeaderText={intl.formatMessage(
          messages.viewAndManageYourInterviewData,
        )}
        data-testid="interviews-page-header"
      />
      <ResponsiveContainer maxWidth="full" baseSize="content" container={false}>
        <Suspense
          fallback={
            <DataTableSkeleton
              columnCount={7}
              searchableColumnCount={1}
              headerItemsCount={2}
            />
          }
        >
          <AuthenticatedInterviews searchParams={searchParams} />
        </Suspense>
      </ResponsiveContainer>
    </>
  );
}

async function AuthenticatedInterviews({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAppNotExpired();
  await requirePageAuth();
  const parsed = await searchParamsCache.parse(searchParams);
  return <InterviewsTableServer searchParams={parsed} />;
}
