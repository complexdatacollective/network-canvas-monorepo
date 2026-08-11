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
import mapboxgl from 'mapbox-gl';
// Serve mapbox-gl's worker as an untransformed asset (?url). Bundling
// mapbox-gl rewrites its embedded worker source into ESM (import.meta),
// which the classic blob worker it spawns can't execute — the worker dies
// with "Cannot use 'import.meta' outside a module" and maps render no
// tiles in the static storybook build. workerUrl is mapbox-gl's documented
// CSP escape hatch and sidesteps the bundler entirely.
import mapboxWorkerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url';
import { type PropsWithChildren, StrictMode } from 'react';

import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';

import './preview.css';
import Providers from './Providers';

(mapboxgl as unknown as { workerUrl: string }).workerUrl = mapboxWorkerUrl;

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
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo',
    },
  },
  decorators: [
    (Story) => (
      <StrictMode>
        {/*
         * Required by Base UI's portal-based dialogs/popovers:
         * https://base-ui.com/react/overview/quick-start#portals
         */}
        <ThemedRegion theme="interview" className="root h-full">
          <Providers>
            <Story />
          </Providers>
        </ThemedRegion>
      </StrictMode>
    ),
  ],
});
