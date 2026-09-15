import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { egoFormStageEditor } from '../../editors/ego-form/EgoFormStageEditor.ts';
import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';

/**
 * The two panes, as a browser lays them out.
 *
 * jsdom gives every Tailwind class a zero box, so where the panes actually SIT
 * cannot be asserted in the unit suite at all — which is the whole reason this
 * story exists. Everything else about the preview (what it renders, what it
 * reads, what it refuses to write) is held in `FieldPreviewPane.test.tsx` and
 * `__tests__/FormFieldsSection.test.tsx`.
 *
 * The rule under test is a CONTAINER query on the dialog's own width
 * (`DialogForm`'s `@min-[60rem]`), not a viewport media query — so the lever
 * here is the viewport only because the dialog is as wide as the viewport
 * allows it to be. The workspace preset caps at 80rem, so a 1200px viewport
 * puts the dialog well above the breakpoint and a 700px one well below it.
 */
const meta = {
  title: 'Protocol Builder/Stage editors/Form field preview',
  component: StageEditorStoryHost,
  args: {
    stageId: 'ego-form-1',
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={egoFormStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Editing a form field is a two-pane dialog: the field’s settings on the left, and on the right the question as the participant will meet it, in the interview’s own theme. Below the dialog’s breakpoint the two stack into one column and the divider between them goes away, because there is nothing left to divide.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Opens the dialog of a field this form already collects, and waits for it to
 * arrive.
 *
 * The popup fades and scales in, and while it is doing that every box in it is
 * a fraction of its final size and every colour is composited against what is
 * behind it. Both of the things these stories are about — where the panes sit,
 * and what axe makes of the contrast the moment the play returns — read the
 * wrong thing from a dialog still on its way. A precondition, not an oracle:
 * the assertions after it still fail when the layout is wrong.
 */
const openTheFieldDialog = async () => {
  await awaitPassiveEffects();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Edit field' }),
  );
  const dialog = await screen.findByRole('dialog', { name: 'Edit form field' });
  await waitFor(async () => {
    const style = getComputedStyle(dialog);
    await expect(style.opacity).toBe('1');
    await expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(
      style.transform,
    );
  });
  return within(dialog);
};

const panesOf = (dialog: ReturnType<typeof within>) => ({
  fields: dialog.getByRole('form', { name: 'Configuration' }),
  preview: dialog.getByRole('region', { name: 'Interactive preview' }),
  // `role="slider"`: the researcher adjusts how much of the dialog each pane
  // gets, which is a value rather than a boundary (`ResizableFlexPanel`).
  //
  // `hidden: true` and no name, so the SAME locator answers in both stories.
  // Stacked, the handle is `display: none`, and a hidden element has no
  // accessible name to match on — a named query would then find nothing and
  // the assertion below could not tell that from a misspelling. The name is
  // asserted where the handle is on screen.
  handle: dialog.getAllByRole('slider', { hidden: true })[0],
});

/** Wide enough for the split: the settings and the preview sit side by side. */
export const SideBySide: Story = {
  play: async () => {
    const dialog = await openTheFieldDialog();
    const { fields, preview, handle } = panesOf(dialog);

    await waitFor(async () => {
      const fieldsBox = fields.getBoundingClientRect();
      const previewBox = preview.getBoundingClientRect();
      // Two columns: the preview starts to the right of where the settings
      // end, and both start at the same height.
      await expect(previewBox.left).toBeGreaterThanOrEqual(fieldsBox.right);
      await expect(Math.abs(previewBox.top - fieldsBox.top)).toBeLessThan(2);
    });
    // There are two panes to divide, so the divider is on screen — and it says
    // what dragging it does.
    await expect(handle).toBeVisible();
    await expect(handle).toHaveAccessibleName('Resize form and preview panes');
  },
};

/**
 * Narrower than the dialog's breakpoint: one column, and no divider.
 *
 * 700px rather than a named preset so the number the assertion depends on is
 * the number written here — the dialog is the viewport less its own margins,
 * which at this width is comfortably under 60rem.
 */
export const StackedWhenNarrow: Story = {
  parameters: {
    viewport: {
      options: {
        narrowForTheSplit: {
          name: 'Narrower than the dialog’s split',
          type: 'desktop',
          styles: { width: '700px', height: '900px' },
        },
      },
      defaultViewport: 'narrowForTheSplit',
    },
  },
  play: async () => {
    const dialog = await openTheFieldDialog();
    const { fields, preview, handle } = panesOf(dialog);

    await waitFor(async () => {
      const fieldsBox = fields.getBoundingClientRect();
      const previewBox = preview.getBoundingClientRect();
      // One column: the preview begins below the settings rather than beside
      // them, and the two start at the same edge.
      await expect(previewBox.top).toBeGreaterThanOrEqual(fieldsBox.bottom);
      await expect(Math.abs(previewBox.left - fieldsBox.left)).toBeLessThan(2);
    });
    // Nothing to divide, so the divider is not offered.
    await expect(handle).not.toBeVisible();
  },
};
