import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { ProtocolLocalizationProvider } from '../../localization/ProtocolLocalization.tsx';
import { buttonPaint, TRANSPARENT } from '../../testing/buttonPaint.ts';
import { ProtocolWithShapeImages } from '../../testing/ProtocolWithShapeImages.tsx';
import { codebookRefusalMessage } from '../compoundFailureCopy.ts';
import CodebookEntityEditor from './CodebookEntityEditor.tsx';

const PERSON: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle' },
  variables: {
    name: {
      name: 'Name',
      type: 'text',
      component: 'Text',
    },
    ethnicity: {
      name: 'Ethnicity',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: { en: 'Asian' }, value: 'asian' },
        { label: { en: 'White' }, value: 'white' },
      ],
    },
  },
};

/** The same type, already drawing itself from one of its own attributes. */
const PERSON_WITH_SHAPE_MAPPING: SectionDoc = {
  ...PERSON,
  shape: {
    default: 'circle',
    dynamic: {
      variable: 'ethnicity',
      type: 'discrete',
      map: [{ value: 'asian', shape: 'square' }],
    },
  },
};

/** A type that draws itself with the researcher's own SVG shapes. */
const PLACE_WITH_CUSTOM_SHAPES: SectionDoc = {
  ...PERSON,
  name: 'Place',
  customShapes: {
    home: { name: 'Home', asset: 'home-image' },
    school: { name: 'School', asset: 'school-image' },
  },
  shape: {
    default: 'custom:home',
    dynamic: {
      variable: 'ethnicity',
      type: 'discrete',
      map: [{ value: 'asian', shape: 'custom:school' }],
    },
  },
};

function ExistingNodeEditor() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <CodebookEntityEditor
        mode="update"
        sessionKey="storybook-person-open-1"
        subject={{ entity: 'node', type: 'person' }}
        initialDraft={PERSON}
        authoritativeDocument={PERSON}
        existingEntityNames={['Place']}
        // Present so the pair of footer buttons is the pair a researcher meets.
        onCancel={() => undefined}
        // Storybook has no host to save to, so every save is refused — which
        // is also what puts the refusal alert on screen to look at.
        onSubmit={() =>
          Promise.resolve({
            status: 'refused' as const,
            message: codebookRefusalMessage({ kind: 'unreachable' }),
            refusal: { kind: 'unreachable' } as const,
          })
        }
      />
    </main>
  );
}

const meta = {
  title: 'Protocol Builder/Codebook/Entity editor',
  component: ExistingNodeEditor,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ProtocolWithShapeImages>
        <ProtocolLocalizationProvider
          localization={{ defaultLocale: 'en', locales: ['en'] }}
        >
          <Story />
        </ProtocolLocalizationProvider>
      </ProtocolWithShapeImages>
    ),
  ],
} satisfies Meta<typeof ExistingNodeEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ExistingNode: Story = {
  /**
   * Architect's dialog footer is a filled `color="default"` cancel beside a
   * filled `color="primary"` submit (`DialogForm.tsx:166,173`). The package
   * drew cancel as a hollow outline button, which is a style Architect has
   * nowhere — so the two controls read as different kinds of thing.
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const cancel = buttonPaint(canvas.getByRole('button', { name: 'Cancel' }));
    await expect(cancel.colour).toBe(cancel.token('neutral'));
    await expect(cancel.background).not.toBe(TRANSPARENT);
    await expect(cancel.borderWidth).toBe('0px');

    const submit = buttonPaint(
      canvas.getByRole('button', { name: 'Save entity' }),
    );
    await expect(submit.colour).toBe(submit.token('primary'));
    await expect(submit.background).not.toBe(TRANSPARENT);
    await expect(submit.borderWidth).toBe('0px');

    // The two are told apart by colour, which is the whole convention.
    await expect(cancel.background).not.toBe(submit.background);
  },
};

/**
 * The surface a researcher actually meets: the editor inside the dialog its
 * trigger opened, with Architect's four topic sections and no heading
 * restating the title above them, and with the two controls that commit it in
 * the dialog's own footer.
 */
export const InADialog: Story = {
  render: () => (
    <CodebookEntityEditor
      mode="update"
      sessionKey="storybook-person-dialog-1"
      dialog={{ title: 'Edit this node type', open: true }}
      subject={{ entity: 'node', type: 'person' }}
      initialDraft={PERSON}
      authoritativeDocument={PERSON}
      existingEntityNames={['Place']}
      onCancel={() => undefined}
      onSubmit={() =>
        Promise.resolve({
          status: 'refused' as const,
          message: codebookRefusalMessage({ kind: 'unreachable' }),
          refusal: { kind: 'unreachable' } as const,
        })
      }
    />
  ),
  play: async () => {
    const dialog = await screen.findByRole('dialog');

    await expect(
      within(dialog)
        .getAllByRole('heading')
        .map((heading) => heading.textContent),
    ).toEqual([
      'Edit this node type',
      'Type identity',
      'Type color',
      'Node appearance',
      'Interface icon',
    ]);

    // The dialog's own footer, which is what pins Cancel to the left of the
    // row: a control rendered anywhere else in here is part of the form.
    const footer = dialog.querySelector('footer');
    if (footer === null) throw new Error('expected a dialog footer');
    await expect(
      within(footer)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cancel', 'Save entity']);
  },
};

/**
 * A node type whose shape follows one of its attributes — Architect's shape
 * mapping, inside the "Node appearance" group. Opened on a mapping that is
 * already configured, which is the state a reviewer cannot reach by looking at
 * a fresh type.
 */
export const WithAShapeMapping: Story = {
  render: () => (
    <CodebookEntityEditor
      mode="update"
      sessionKey="storybook-person-mapping-1"
      dialog={{ title: 'Edit this node type', open: true }}
      subject={{ entity: 'node', type: 'person' }}
      initialDraft={PERSON_WITH_SHAPE_MAPPING}
      authoritativeDocument={PERSON_WITH_SHAPE_MAPPING}
      existingEntityNames={['Place']}
      onCancel={() => undefined}
      onSubmit={() =>
        Promise.resolve({
          status: 'refused' as const,
          message: codebookRefusalMessage({ kind: 'unreachable' }),
          refusal: { kind: 'unreachable' } as const,
        })
      }
    />
  ),
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'));

    await expect(
      dialog.getByRole('switch', { name: 'Map attribute to shape' }),
    ).toBeChecked();
    await expect(
      within(dialog.getByRole('radiogroup', { name: 'Asian' })).getByRole(
        'radio',
        { name: 'Select shape Square' },
      ),
    ).toHaveAttribute('aria-checked', 'true');
    // The other answer has no shape of its own yet, which the editor says
    // rather than leaving the researcher to notice.
    await expect(
      dialog.getByRole('radiogroup', { name: 'White' }),
    ).toHaveAccessibleDescription('Uses the default shape');
  },
};

/**
 * A node type with its own shapes: each is listed with a preview and a name,
 * offered in the default picker and in every mapping row after the built-in
 * shapes, and cannot be removed while the type still uses it.
 */
export const WithCustomShapes: Story = {
  render: () => (
    <CodebookEntityEditor
      mode="update"
      sessionKey="storybook-place-custom-shapes-1"
      dialog={{ title: 'Edit this node type', open: true }}
      subject={{ entity: 'node', type: 'place' }}
      initialDraft={PLACE_WITH_CUSTOM_SHAPES}
      authoritativeDocument={PLACE_WITH_CUSTOM_SHAPES}
      existingEntityNames={['Person']}
      onCancel={() => undefined}
      onSubmit={() =>
        Promise.resolve({
          status: 'refused' as const,
          message: codebookRefusalMessage({ kind: 'unreachable' }),
          refusal: { kind: 'unreachable' } as const,
        })
      }
    />
  ),
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'));

    await expect(
      within(dialog.getByRole('radiogroup', { name: /^Shape/ })).getByRole(
        'radio',
        { name: 'Select shape Home' },
      ),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      within(dialog.getByRole('radiogroup', { name: 'Asian' })).getByRole(
        'radio',
        { name: 'Select shape School' },
      ),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      dialog.getByRole('button', { name: 'Remove shape Home' }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Remove shape School' }),
    ).toBeDisabled();
  },
};

/**
 * A save refused because the image behind one custom shape has gone: the
 * refusal is shown under the custom shapes field and names the shape, and
 * focus moves to that field.
 */
export const ShapeImageUnavailable: Story = {
  render: () => (
    <CodebookEntityEditor
      mode="update"
      sessionKey="storybook-place-image-unavailable-1"
      dialog={{ title: 'Edit this node type', open: true }}
      subject={{ entity: 'node', type: 'place' }}
      initialDraft={PLACE_WITH_CUSTOM_SHAPES}
      authoritativeDocument={PLACE_WITH_CUSTOM_SHAPES}
      existingEntityNames={['Person']}
      onCancel={() => undefined}
      onSubmit={() =>
        Promise.resolve({
          status: 'refused' as const,
          message: codebookRefusalMessage({ kind: 'promotionFailed' }),
          refusal: {
            kind: 'promotionFailed',
            resourceId: 'school-image',
          } as const,
        })
      }
    />
  ),
  play: async () => {
    const dialog = within(await screen.findByRole('dialog'));

    await userEvent.type(
      dialog.getByRole('textbox', { name: /Node type name/ }),
      ' (changed)',
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Save entity' }));

    await expect(
      await dialog.findByText(
        'The image for the shape "School" is no longer available. Remove this shape and add it again.',
      ),
    ).toBeVisible();
  },
};

/**
 * Adding a shape: "Add a shape" opens a browser where the researcher imports
 * an SVG file or picks an SVG image the protocol already holds. Choosing one
 * adds a shape named after the image.
 */
export const AddingAShape: Story = {
  render: () => (
    <CodebookEntityEditor
      mode="update"
      sessionKey="storybook-person-add-shape-1"
      dialog={{ title: 'Edit this node type', open: true }}
      subject={{ entity: 'node', type: 'person' }}
      initialDraft={PERSON}
      authoritativeDocument={PERSON}
      existingEntityNames={['Place']}
      onCancel={() => undefined}
      onSubmit={() =>
        Promise.resolve({
          status: 'refused' as const,
          message: codebookRefusalMessage({ kind: 'unreachable' }),
          refusal: { kind: 'unreachable' } as const,
        })
      }
    />
  ),
  play: async () => {
    const editor = within(
      await screen.findByRole('dialog', { name: 'Edit this node type' }),
    );
    await userEvent.click(editor.getByRole('button', { name: 'Add a shape' }));

    const browser = within(
      await screen.findByRole('dialog', { name: 'Choose a node shape' }),
    );
    await expect(
      browser.getByText('Import a shape from an SVG file'),
    ).toBeVisible();
    await userEvent.click(
      await browser.findByRole('button', { name: 'school.svg' }),
    );

    await expect(await editor.findByDisplayValue('school')).toBeInTheDocument();
    await expect(
      within(editor.getByRole('radiogroup', { name: /^Shape/ })).getByRole(
        'radio',
        { name: 'Select shape school' },
      ),
    ).toBeInTheDocument();
  },
};
