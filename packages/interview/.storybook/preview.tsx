import addonA11y from '@storybook/addon-a11y';

import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
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

// This package's storybook only renders interview-themed stories, so apply
// `data-theme-interview` to <body> once at module load. The body's own
// `bg-background text-text publish-colors` (via the global `theme-base`
// utility in `tooling/tailwind/fresco/theme.css`) then resolves against the
// interview palette, so anything that shows the body backdrop — story
// padding when `layout` isn't "fullscreen", scrollbars, fixed/transformed
// descendants, transitions — matches the themed surface. The per-story
// decorator below still wraps each story in <ThemedRegion> for the portal
// container and to keep the contract identical to production usage via Shell.
if (typeof document !== 'undefined') {
  document.body.setAttribute('data-theme-interview', '');
}

// Wrap each docs page in <ThemedRegion theme="interview"> so chrome rendered
// outside the per-story decorator tree (notably `.sbdocs-preview`) inherits
// the interview palette and the portal container — e.g. `bg-background` on
// the docs preview container resolves to the interview --background instead
// of the default theme. This package's stories are interview-only, so the
// theme is hardcoded.
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
  },
  decorators: [
    (Story) => {
      // Disable Base UI animations whenever the browser is being driven by
      // automation (Playwright in vitest browser mode, or Storybook's
      // play-function runner). This makes Base UI dialog open/close flows
      // deterministic: they no longer wait on `getAnimations()` so sequences
      // like "click Cancel → confirm dialog opens → click Continue editing"
      // don't race the form store against CSS animation completion.
      //
      // Also togglable via `?disableAnimations=1` on the URL for interactive
      // debugging of the animation-disabled code path.
      //
      // Manual browsing has `navigator.webdriver === false`, so interactive
      // development still gets the full animations by default.
      const disableAnimationsFromAutomation =
        typeof navigator !== 'undefined' && navigator.webdriver;
      const disableAnimations =
        disableAnimationsFromAutomation || isChromatic();

      return (
        <StrictMode>
          {/*
           * Required by Base UI's portal-based dialogs/popovers:
           * https://base-ui.com/react/overview/quick-start#portals
           */}
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
