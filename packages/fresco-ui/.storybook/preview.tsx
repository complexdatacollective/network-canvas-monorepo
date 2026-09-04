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
import { type PropsWithChildren, StrictMode } from 'react';
import { configure } from 'storybook/test';

import './preview.css';
import { directionGlobalTypes, withDirection } from './direction-switcher';
import Providers from './Providers';
import {
  getInitialColorScheme,
  getInitialTheme,
  globalTypes,
  StoryTheme,
  THEME_KEY,
  type ThemeKey,
  withTheme,
} from './theme-switcher';

/**
 * How long a play function's `waitFor`/`findBy*` may poll before giving up.
 *
 * Testing Library's default is 1000ms, which is marginal for a suite whose
 * stories run in parallel chromium and firefox instances: a starved tab can
 * take longer than that just to mount a portal or finish a 0.5s entrance
 * transition. `Toast.stories` `LongDescription` failed exactly that way in
 * September 2026 — flaky under a full `test:storybook` run, green on re-run
 * and in isolation.
 *
 * This is not a sleep and cannot make a wrong assertion pass: `waitFor` polls
 * a real condition and still fails when the condition never holds. The only
 * cost of the larger budget is how long a genuinely broken story takes to go
 * red. Same mechanism as the 5s budget in `apps/architect/src/test-setup.ts`,
 * with more headroom because real browser tabs under full-suite contention
 * starve harder than that jsdom suite's workers; it lives in the preview
 * (rather than a vitest setup file) so Chromatic's interaction runs get the
 * same budget. Story-level `{ timeout: n }` options
 * override this default *downwards* too, so don't add per-query timeouts for
 * slowness — they would reintroduce the tighter budget this removes.
 */
configure({ asyncUtilTimeout: 10_000 });

// Wrap each docs page in the same themed region the story decorator uses, so
// chrome rendered outside the per-story decorator tree (notably
// `.sbdocs-preview`) inherits the selected palette and the portal container —
// e.g. `bg-background` on the docs preview container resolves to the
// interview / studio --background instead of the default theme. Light/dark
// needs no handling here: it lives on the document element, above both trees.
const ThemedDocsContainer = ({
  children,
  context,
}: PropsWithChildren<DocsContainerProps>) => {
  const story = context.storyById();
  const storyContext = context.getStoryContext(story);
  const theme =
    (storyContext.globals[THEME_KEY] as ThemeKey | undefined) ?? 'dashboard';

  return (
    <StoryTheme theme={theme}>
      <DocsContainer context={context}>{children}</DocsContainer>
    </StoryTheme>
  );
};

// @chromatic-com/storybook is not included here because it doesn't export a
// CSF Next compatible preview addon. It only provides server-side preset
// functionality and manager UI, so it's configured in main.ts only.
// See: https://github.com/chromaui/addon-visual-tests/pull/404

export default definePreview({
  addons: [addonDocs(), addonA11y(), addonVitest()],
  parameters: {
    options: {
      storySort: {
        order: [
          'Design System',
          ['Colors', 'Elevation', 'Type Scale', 'Typography'],
          'UI',
          'Systems',
          ['Form', 'Dialogs', 'DragAndDrop'],
          '*',
        ],
      },
    },
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
      /**
       * base-ui dialog adds focus guards which are picked up by a11y tests
       * but are necessary for proper focus management within the dialog,
       * and compatible with WCAG guidelines, so we disable this rule here.
       */
      config: {
        rules: [
          {
            id: 'aria-hidden-focus',
            selector: '[data-base-ui-focus-guard]',
            enabled: false,
          },
        ],
      },
    },
  },

  decorators: [
    withTheme,
    withDirection,
    (Story) => (
      <StrictMode>
        {/**
         * required by base-ui: https://base-ui.com/react/overview/quick-start#portals
         */}
        <div className="root h-full">
          <Providers>
            <Story />
          </Providers>
        </div>
      </StrictMode>
    ),
  ],

  globalTypes: { ...globalTypes, ...directionGlobalTypes },

  initialGlobals: {
    theme: getInitialTheme(),
    colorScheme: getInitialColorScheme(),
    direction: 'ltr',
  },
});
