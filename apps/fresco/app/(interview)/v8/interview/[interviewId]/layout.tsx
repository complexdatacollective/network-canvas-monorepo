import { type ReactNode, Suspense } from 'react';

import SmallScreenOverlay from '~/app/(interview)/interview/_components/SmallScreenOverlay';

export default function InterviewSessionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <SmallScreenOverlay />
      </Suspense>
      {children}
    </>
  );
}
