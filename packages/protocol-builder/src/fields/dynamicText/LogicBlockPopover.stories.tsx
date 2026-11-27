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
  const settings = await body.findByRole('dialog', { name: 'Logic block' });
  return { editor, settings: within(settings) };
};

/** The settings show the block's logic and the rules of its “If”. */
export const ItsLogicAndRules: Story = {
  play: async ({ canvasElement }) => {
    const { settings } = await openSettings(canvasElement);
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
