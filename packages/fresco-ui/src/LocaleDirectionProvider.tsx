'use client';

import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { ReactNode } from 'react';

import { useAppDirection } from '@codaco/app-i18n/react';

/**
 * Gives Base UI the writing direction of the app's language.
 *
 * Base UI reads direction from context, never from the DOM: it decides which
 * arrow key moves where in a menu, a slider or a set of tabs, and which side a
 * popup opens on. `AppI18nProvider` writes `<html dir>`, which mirrors the CSS,
 * so a host that mounts no direction provider under it shows a right-to-left
 * layout whose controls still behave left to right.
 *
 * Mount it once, inside the host's `AppI18nProvider` and outside everything
 * that renders a Base UI component. Without an `AppI18nProvider` above it the
 * direction is left to right, which is the direction of the English every
 * message then renders in.
 */
export default function LocaleDirectionProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <DirectionProvider direction={useAppDirection()}>
      {children}
    </DirectionProvider>
  );
}
