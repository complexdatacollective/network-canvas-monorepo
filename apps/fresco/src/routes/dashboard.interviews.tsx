import { createFileRoute, redirect } from '@tanstack/react-router';

import ResponsiveContainer from '@codaco/fresco-ui/layout/ResponsiveContainer';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import { InterviewsTable } from '~/app/dashboard/_components/InterviewsTable/InterviewsTable';
import { loadInterviewsSearchParams } from '~/lib/searchParams/interviews';
import { fetchInterviewsPage } from '~/src/server/interviews';
import { getSessionState } from '~/src/server/sessionState';

/**
 * `app/dashboard/interviews/page.tsx`.
 *
 * `validateSearch` is the identity function on purpose. nuqs owns these URL
 * keys — the client filter tree in `components/DataTable/nuqs` writes `iv_*`
 * params directly — so the router must round-trip whatever is there rather
 * than narrowing it to a typed subset and stripping the rest. The typed values
 * are derived in `loaderDeps` with the same parsers, which is also what makes
 * the loader re-run when a filter changes.
 */
export const Route = createFileRoute('/dashboard/interviews')({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: async () => {
    const { signedIn } = await getSessionState();
    if (!signedIn) throw redirect({ to: '/signin' });
  },
  loaderDeps: ({ search }) => loadInterviewsSearchParams(search),
  loader: ({ deps }) => fetchInterviewsPage({ data: deps }),
  component: InterviewsPage,
});

function InterviewsPage() {
  const { interviews, filterOptions, protocols } = Route.useLoaderData();
  const searchParams = Route.useLoaderDeps();

  return (
    <>
      <PageHeader
        headerText="Interviews"
        subHeaderText="View and manage your interview data."
        data-testid="interviews-page-header"
      />
      <ResponsiveContainer maxWidth="full" baseSize="content" container={false}>
        <InterviewsTable
          interviewsPromise={Promise.resolve(interviews)}
          filterOptionsPromise={Promise.resolve(filterOptions)}
          protocolsPromise={Promise.resolve(protocols)}
          searchParams={searchParams}
        />
      </ResponsiveContainer>
    </>
  );
}
