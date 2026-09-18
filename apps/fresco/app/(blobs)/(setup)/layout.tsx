import { type ReactNode, Suspense } from 'react';

import SetupLoading from '~/components/SetupLoading';
import { requireAppNotExpired } from '~/queries/appSettings';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<SetupLoading />}>
      <SetupLayoutContent>{children}</SetupLayoutContent>
    </Suspense>
  );
}

async function SetupLayoutContent({ children }: { children: ReactNode }) {
  await requireAppNotExpired(true);
  return children;
}
