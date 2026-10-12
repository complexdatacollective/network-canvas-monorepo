import { type ReactNode, useEffect, useRef } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { DEFAULT_SKIP_TARGET_ID } from '@codaco/fresco-ui/layout/AppFrame';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useInsideAreaMain } from './AreaMain.tsx';

const CENTRED = 'flex h-full items-center justify-center p-4';

/**
 * The landmark this screen contributes, which depends on where the router put
 * it (§7.1).
 *
 * The error component replaces the match that failed and nothing else, so an
 * error thrown below an area layout renders inside the `<main>` that layout is
 * still supplying, while an error thrown BY an area layout — or by the app
 * layout, or on a focused, site or participant route — renders where no
 * `<main>` exists at all. A landmark of its own is right in the second case and
 * wrong in the first: nested mains give the skip link two candidates and it
 * takes the outer one.
 *
 * The id is the skip link's target, not decoration. Without it an area layout
 * that fails takes the shell's only bypass target away with it, leaving a
 * header the keyboard has to walk through with nothing to skip to.
 */
function ErrorLandmark({ children }: { children: ReactNode }) {
  const insideAreaMain = useInsideAreaMain();

  if (insideAreaMain) return <div className={CENTRED}>{children}</div>;
  return (
    <main id={DEFAULT_SKIP_TARGET_ID} className={CENTRED}>
      {children}
    </main>
  );
}

export type StatusScreenAction = {
  readonly label: string;
  readonly onPress: () => void;
};

export default function StatusScreen({
  heading,
  message,
  action,
  focusOnMount = false,
}: {
  heading: string;
  message: string;
  action?: StatusScreenAction | undefined;
  focusOnMount?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <ErrorLandmark>
      <Surface maxWidth="xl" spacing="lg">
        {/*
          A route that fails is still a route change, and this heading is what
          §7.2's landing lands on. Without it the researcher who navigated into
          a failure keeps focus on `<body>` and their screen reader is told
          nothing at all — the one arrival where saying nothing is worst.
        */}
        <Heading level="h1" ref={headingRef} {...routeFocusTargetProps}>
          {heading}
        </Heading>
        <Paragraph role="alert">{message}</Paragraph>
        {action === undefined ? null : (
          <Button onClick={action.onPress}>{action.label}</Button>
        )}
      </Surface>
    </ErrorLandmark>
  );
}
