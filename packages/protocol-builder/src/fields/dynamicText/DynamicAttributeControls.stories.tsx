import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import {
  CONTENT_LABEL,
  INFORMATION_STAGE,
  pageContentField,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Dynamic attribute settings',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The settings of a dynamic attribute, as the dialog that creates one and the popover of its pill both show them: its logic, the rules of each case or the attribute whose answers decide, and one version of the wording for each case.',
      },
    },
  },
  args: {
    stageId: INFORMATION_STAGE,
    sectionTitle: 'Content',
    children: pageContentField,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * With “If … else”, one version for when the rules are met and one for
 * otherwise. Each version that is written stops being pointed out.
 */
export const AVersionForEachCase: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('textbox', { name: CONTENT_LABEL }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    await userEvent.click(
      await body.findByRole('option', { name: 'Create dynamic attribute' }),
    );
    const dialog = within(
      await body.findByRole('dialog', { name: 'Create a dynamic attribute' }),
    );
    await expect(dialog.getByText('If … else')).toBeVisible();
    await expect(dialog.getByText('Wording for each case')).toBeVisible();
    const met = dialog.getByRole('textbox', { name: 'If: (no rules yet)' });
    const otherwise = dialog.getByRole('textbox', { name: 'Otherwise' });

    // A version left empty shows nothing, so it is not a problem.
    await expect(met).toHaveAttribute('aria-placeholder', 'Shows nothing');
    await expect(otherwise).toHaveAttribute(
      'aria-placeholder',
      'Shows nothing',
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Create dynamic attribute' }),
    );
    await expect(
      await dialog.findByText('Add at least one rule.'),
    ).toBeVisible();
    await userEvent.type(met, 'welcome back');
    await userEvent.type(otherwise, 'welcome');
    await expect(met).toHaveTextContent('welcome back');
    await expect(otherwise).toHaveTextContent('welcome');
  },
};

/**
 * Each field is spaced from the next by its own margin, and by nothing else:
 * the settings add no space between their fields.
 */
export const FieldsSpacedByTheirOwnMargins: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('textbox', { name: CONTENT_LABEL }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Attribute' }));
    await userEvent.click(
      await body.findByRole('option', { name: 'Create dynamic attribute' }),
    );
    const dialog = await body.findByRole('dialog', {
      name: 'Create a dynamic attribute',
    });
    const controls = dialog.querySelector('[data-dynamic-attribute-controls]');
    const [logic, next] = Array.from(controls?.children ?? []);
    if (logic === undefined || next === undefined) {
      throw new Error('The settings have fewer than two parts');
    }
    const margin = Number.parseFloat(getComputedStyle(logic).marginBottom);
    await expect(margin).toBeGreaterThan(0);
    await expect(
      next.getBoundingClientRect().top - logic.getBoundingClientRect().bottom,
    ).toBe(margin);
  },
};
