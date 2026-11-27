import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import {
  CONTENT_LABEL,
  INFORMATION_STAGE,
  pageContentField,
  seedPageWithLogic,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Logic block settings',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The settings of a logic block, opened from the button in its frame: its logic, and the rules or the attribute that decide which part is shown. A change that would delete a part with content asks first.',
      },
    },
  },
  args: {
    stageId: INFORMATION_STAGE,
    sectionTitle: 'Content',
    children: pageContentField,
    seedEdit: seedPageWithLogic,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

const openSettings = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await awaitPassiveEffects();
  const editor = await canvas.findByRole('textbox', { name: CONTENT_LABEL });
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Logic block settings' }),
  );
  const settings = await body.findByRole('dialog', {
    name: 'Logic block settings',
  });
  return { editor, settings: within(settings) };
};

/**
 * The settings show the block's logic and the rules of its “If”. They open
 * from the settings button in the block's header as every block's settings
 * open from its button: attached to it, on one side of it, with the button
 * drawn as pressed while they are open.
 */
export const ItsLogicAndRules: Story = {
  play: async ({ canvasElement }) => {
    const { settings } = await openSettings(canvasElement);
    const button = within(canvasElement).getByRole('button', {
      name: 'Logic block settings',
    });
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const popup = settings.getByText('Rules').closest('[role="dialog"]');
    if (!(popup instanceof HTMLElement)) throw new Error('No settings.');
    await waitFor(() => {
      const at = button.getBoundingClientRect();
      const shown = popup.getBoundingClientRect();
      const side = popup.getAttribute('data-side');
      const beside = {
        bottom: shown.top >= at.bottom,
        top: shown.bottom <= at.top,
        right: shown.left >= at.right,
        left: shown.right <= at.left,
      };
      expect(side !== null && side in beside).toBe(true);
      expect(beside[side as keyof typeof beside]).toBe(true);
    });
    await expect(settings.getByText('Logic')).toBeVisible();
    await expect(settings.getByText('Rules')).toBeVisible();
    await expect(
      settings.getByRole('button', { name: 'Delete logic block' }),
    ).toBeVisible();
  },
};

/**
 * Deleting the block takes it, and everything in it, out of the page. It
 * contains content, so it asks first.
 */
export const DeletingTheBlock: Story = {
  play: async ({ canvasElement }) => {
    const { editor, settings } = await openSettings(canvasElement);
    await userEvent.click(
      settings.getByRole('button', { name: 'Delete logic block' }),
    );
    const question = within(
      await within(canvasElement.ownerDocument.body).findByRole('dialog', {
        name: 'Delete logic block?',
      }),
    );
    await userEvent.click(
      question.getByRole('button', { name: 'Delete logic block' }),
    );
    await waitFor(async () => {
      await expect(editor.querySelector('[data-logic-block-view]')).toBeNull();
    });
  },
};

/**
 * The element the document draws on top at (`x`, `y`). The open dialog makes
 * everything outside it `inert`, and the hit test that `elementFromPoint`
 * runs passes through an inert element as if it were not drawn, so the
 * attribute is taken off for the question and put back straight after.
 */
const drawnAt = (document: Document, x: number, y: number) => {
  const inert = Array.from(document.querySelectorAll('[inert]'));
  for (const element of inert) element.removeAttribute('inert');
  try {
    return document.elementFromPoint(x, y);
  } finally {
    for (const element of inert) element.setAttribute('inert', '');
  }
};

/**
 * The dialog that a rule is written in opens over the settings it was opened
 * from, wherever the two overlap, so that every part of it can be seen.
 * Asked of what the document draws at each point, not of the accessibility
 * tree, which is right either way.
 */
export const TheRuleDialogOverTheSettings: Story = {
  play: async ({ canvasElement }) => {
    const { settings } = await openSettings(canvasElement);
    const popover = settings.getByText('Rules').closest('[role="dialog"]');
    if (!(popover instanceof HTMLElement)) throw new Error('No settings.');
    await userEvent.click(
      settings.getByRole('button', { name: 'Add new rule' }),
    );
    const document = canvasElement.ownerDocument;
    const rule = await within(document.body).findByRole('dialog', {
      name: 'Construct a Rule',
    });
    const overlap = () => {
      const over = popover.getBoundingClientRect();
      const under = rule.getBoundingClientRect();
      return {
        left: Math.max(over.left, under.left),
        right: Math.min(over.right, under.right),
        top: Math.max(over.top, under.top),
        bottom: Math.min(over.bottom, under.bottom),
      };
    };
    // Without an overlap there is nothing to cover.
    await waitFor(() => {
      const { left, right, top, bottom } = overlap();
      expect(right - left).toBeGreaterThan(20);
      expect(bottom - top).toBeGreaterThan(20);
    });
    // Asked once, outside `waitFor`: taking `inert` off and putting it back
    // are changes to the document, which would run its check again forever.
    const { left, right, top, bottom } = overlap();
    for (const [x, y] of [
      [(left + right) / 2, (top + bottom) / 2],
      [left + 10, top + 10],
      [right - 10, bottom - 10],
    ] as const) {
      await expect(rule.contains(drawnAt(document, x, y))).toBe(true);
    }
  },
};

/**
 * A version's problem is shown once its rules have been changed in the
 * settings, as a form shows a field's problem once it has been changed: a
 * new “Else if” has no rules, and is not met with an error, and the “If”
 * whose only rule is deleted says that it needs one.
 */
export const ProblemsOnceTheRulesAreChanged: Story = {
  play: async ({ canvasElement }) => {
    const { settings } = await openSettings(canvasElement);
    const noRules = 'Add at least one rule.';
    await expect(settings.queryByText(noRules)).toBeNull();

    await userEvent.click(
      settings.getByRole('button', { name: 'Add else if' }),
    );
    await expect(
      await settings.findByText('Rules for “Else if” 1'),
    ).toBeVisible();
    await expect(settings.queryByText(noRules)).toBeNull();

    await userEvent.click(
      settings.getByRole('button', { name: /^Delete rule:/ }),
    );
    // Asked first; the settings stay open behind the question.
    await userEvent.click(
      within(
        await within(canvasElement.ownerDocument.body).findByRole('dialog', {
          name: 'Are you sure?',
        }),
      ).getByRole('button', { name: 'Delete' }),
    );
    await expect(await settings.findByText(noRules)).toBeVisible();
    // Only the “If”, whose rules were changed.
    await expect(settings.getAllByText(noRules)).toHaveLength(1);
    // The question has gone, and the settings can be used again. The rule
    // that had focus has gone too, so the researcher carries on from the
    // first rule's button (Base UI takes the settings' controls out of the
    // tab order while focus is outside them).
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole('dialog', {
          name: 'Are you sure?',
        }),
      ).toBeNull(),
    );
    await userEvent.click(
      settings.getAllByRole('button', { name: 'Add new rule' })[0] ??
        settings.getByRole('button', { name: 'Add else if' }),
    );
  },
};
