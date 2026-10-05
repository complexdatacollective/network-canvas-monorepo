import addonA11y from '@storybook/addon-a11y';
import addonDocs from '@storybook/addon-docs';
import addonVitest from '@storybook/addon-vitest';
import { definePreview } from '@storybook/react-vite';
import { configure } from 'storybook/test';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';

import './preview.css';
import { globalTypes, initialGlobals, withAppI18n } from './i18n.ts';

/**
 * How long a play function's `waitFor`/`findBy*` may poll before giving up.
 *
 * Testing Library's default is 1000ms, and these stories mount whole stage
 * editors — a form store, a section outline, a validation pass over the entire
 * all-interfaces protocol — inside a browser tab that shares a runner with
 * thirty other files. A second is not a budget for that; it is a coin toss
 * under load, which is the shape every flake in this repo's Storybook suites
 * has taken.
 *
 * Not a sleep, and it cannot make a wrong assertion pass: `waitFor` polls a
 * real condition and still fails when the condition never holds. The only cost
 * is how long a genuinely broken story takes to go red. It lives in the
 * preview rather than a vitest setup file so that Chromatic's interaction runs
 * get the same budget.
 */
configure({ asyncUtilTimeout: 10_000 });

export default definePreview({
  addons: [addonDocs(), addonA11y(), addonVitest()],
  parameters: {
    // Every rule axe ships, at error level: no rule is turned off here, and a
    // story that opens a dialog is checked with the dialog open.
    a11y: { test: 'error' },
    layout: 'fullscreen',
  },
  decorators: [
    withAppI18n,
    /**
     * Outermost inside the locale, and the reason it exists is the a11y check
     * rather than the look of a story.
     *
     * Every dialog in this package fades in. The a11y addon runs axe the
     * moment a play function returns, so a play that opens a dialog and
     * asserts on what is inside it is measured while that fade is still
     * running — and axe reads the composited colour of a half-transparent
     * element. That is reported as `color-contrast`, on a control whose
     * contrast is fine: 1.01 between `#f1f0fb` text and `#efeef9` behind it is
     * not a palette, it is an element at opacity 0. Four stories failed that
     * way, and which four varied between runs.
     *
     * `disableAnimationsForAutomation` is fresco-ui's own detection of a
     * driven browser — WebDriver, Chromatic, `?disableAnimations=1` — and it
     * turns off both Motion and Base UI's animation bookkeeping. A person
     * reading this Storybook sees every animation as before.
     */
    (Story) => (
      <AnimationProvider disableAnimationsForAutomation>
        <Story />
      </AnimationProvider>
    ),
  ],
  globalTypes,
  initialGlobals,
});
