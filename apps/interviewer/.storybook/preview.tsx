import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import {
  DocsContainer,
  type DocsContainerProps,
} from '@storybook/addon-docs/blocks';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/react-vite';
import isChromatic from 'chromatic/isChromatic';
import { type PropsWithChildren, StrictMode } from 'react';

import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import './preview.css';
import Providers from './Providers';

// Interviewer v8 renders its entire UI inside a single
// `<ThemedRegion theme="interview">` (see `src/App.tsx`), so the storybook is
// hardcoded to the interview theme too. Apply `data-theme-interview` to <body>
// once at module load so anything that shows the body backdrop — story padding
// when `layout` isn't "fullscreen", scrollbars, fixed/transformed descendants —
// resolves `bg-background` against the interview palette. The per-story
// decorator still wraps each story in <ThemedRegion> for the portal container.
if (typeof document !== 'undefined') {
  document.body.setAttribute('data-theme-interview', '');
}

// Wrap each docs page in <ThemedRegion theme="interview"> so chrome rendered
// outside the per-story decorator tree (notably `.sbdocs-preview`) inherits the
// interview palette and the portal container — e.g. `bg-background` on the docs
// preview container resolves to the interview --background.
const ThemedDocsContainer = ({
  children,
  context,
}: PropsWithChildren<DocsContainerProps>) => (
  <ThemedRegion
    theme="interview"
    className="bg-background text-text publish-colors"
  >
    <DocsContainer context={context}>{children}</DocsContainer>
  </ThemedRegion>
);

export default definePreview({
  addons: [addonDocs(), addonA11y(), addonVitest()],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      container: ThemedDocsContainer,
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  decorators: [
    (Story) => {
      // Disable Base UI / motion animations whenever the browser is being
      // driven by automation (Playwright in vitest browser mode, or
      // Storybook's play-function runner) or under Chromatic, so visual
      // snapshots and interaction tests are deterministic. Manual browsing has
      // `navigator.webdriver === false`, so interactive development keeps the
      // full animations.
      const disableAnimationsFromAutomation =
        typeof navigator !== 'undefined' && navigator.webdriver;
      const disableAnimations =
        disableAnimationsFromAutomation || isChromatic();

      return (
        <StrictMode>
          <ThemedRegion theme="interview" className="root h-full">
            <Providers disableAnimations={disableAnimations}>
              <Story />
            </Providers>
          </ThemedRegion>
        </StrictMode>
      );
    },
  ],
});
