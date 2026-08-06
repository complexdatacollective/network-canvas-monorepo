import { createFileRoute, redirect } from '@tanstack/react-router';

import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { containerClasses } from '~/components/ContainerClasses';
import { SignInForm } from '~/src/components/SignInForm';
import { getSessionState } from '~/src/server/sessionState';

/**
 * `app/(blobs)/(setup)/signin/page.tsx`. The Next page is an async server
 * component that calls `getServerSession()` directly; router loaders are
 * isomorphic, so the session read goes through a server function instead.
 */
export const Route = createFileRoute('/signin')({
  beforeLoad: async () => {
    const { signedIn } = await getSessionState();
    if (signedIn) throw redirect({ to: '/dashboard/interviews' });
  },
  head: () => ({
    meta: [
      { title: 'Fresco - Sign In' },
      { name: 'description', content: 'Sign in to Fresco.' },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  return (
    <MotionSurface
      noContainer
      className={cx(
        containerClasses,
        'phone-landscape:w-md mx-auto w-full rounded shadow-none',
      )}
      baseSize="content"
    >
      <Heading level="h2">Sign In To Fresco</Heading>
      <SignInForm />
    </MotionSurface>
  );
}
