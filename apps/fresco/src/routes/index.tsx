import { createFileRoute, redirect } from '@tanstack/react-router';

/** `app/page.tsx` — `/` redirects into the dashboard. */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard/interviews' });
  },
});
