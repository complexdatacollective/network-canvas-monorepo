import { type ReactNode, Suspense } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import SetupLoading from '~/components/SetupLoading';
import LanguageSetting from '~/i18n/LanguageSetting';
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
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="mx-auto w-full max-w-lg px-6">
        <Surface noContainer>
          <LanguageSetting compact />
        </Surface>
      </div>
      {children}
    </div>
  );
}
