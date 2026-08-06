import { Outlet, createFileRoute } from '@tanstack/react-router';

import { ExportProgressProvider } from '~/components/ExportProgressProvider';
import { StartInterviewActions } from '~/src/components/StartInterviewActions';

/**
 * `app/dashboard/layout.tsx`, reduced to what the Phase B slice needs. The
 * navigation bar, the UploadThing token gate and the Netlify badge belong to
 * routes the slice deliberately excludes; `ExportProgressProvider` does not,
 * because the interviews table renders the export dialog that consumes it.
 */
export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [
      { title: 'Network Canvas Fresco - Dashboard' },
      { name: 'description', content: 'Fresco.' },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <div
      data-testid="dashboard-layout"
      className="tablet-landscape:gap-16 tablet-landscape:px-6 laptop:px-12 flex h-dvh scrollbar-gutter-both flex-col gap-10 overflow-y-auto px-2 pb-10"
    >
      <StartInterviewActions>
        <ExportProgressProvider>
          <Outlet />
        </ExportProgressProvider>
      </StartInterviewActions>
    </div>
  );
}
