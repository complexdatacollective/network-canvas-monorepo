import type { Meta, StoryObj } from '@storybook/react-vite';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import useDialog from './dialogs/useDialog';
import Field from './form/Field/Field';
import InputField from './form/fields/InputField';
import Form from './form/Form';
import SubmitButton from './form/SubmitButton';
import Section from './Section';
import { withDialogProvider } from './storybook-support/withDialogProvider';

const meta = {
  title: 'Components/Section',
  component: Section,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `A single-panel section for grouping related form fields.

\`Section\` composes Base UI Collapsible, Fresco UI Surface, and the existing Toggle control. Closing a toggleable section unregisters its Fresco form fields and clears their current values. They remain cleared if the section is reopened during the same form session. Use \`onOpenChange\` to confirm or block a requested change before data is discarded.

\`\`\`tsx
<Section
  title="Data source for map layers"
  description="Choose the GeoJSON resource and property used for map selection."
  toggleable
  defaultOpen
>
  <Field name="resource" label="GeoJSON resource" component={InputField} />
  <Field name="property" label="Selection label property" component={InputField} />
</Section>
\`\`\`

Props: \`title\`, \`description?\`, \`toggleable?\`, \`defaultOpen?\` and \`onOpenChange?\` (only accepted when \`toggleable\` is true), \`disabled?\`, and \`children\`.`,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    title: {
      control: 'text',
      description: 'The persistent section heading.',
    },
    description: {
      control: 'text',
      description: 'Supporting text shown beneath the heading.',
    },
    toggleable: {
      control: 'boolean',
      description: 'Whether the section can be opened and closed.',
    },
    defaultOpen: {
      control: 'boolean',
      description:
        'Whether a toggleable section starts open. Only accepted when toggleable is true.',
    },
    onOpenChange: {
      control: false,
      description:
        'Called before a toggleable section changes state. Return false, or a promise resolving to false, to block the change.',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the disclosure control and any visible fields.',
    },
    children: {
      control: false,
      description: 'Related fields or other section content.',
    },
  },
  args: {
    title: 'Data source for map layers',
    description:
      'Choose the GeoJSON resource and property used to identify selectable areas.',
    toggleable: true,
    defaultOpen: true,
    disabled: false,
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

function SectionPreview({
  title = 'Data source for map layers',
  description = 'Choose the GeoJSON resource and property used to identify selectable areas.',
  toggleable,
  defaultOpen,
  disabled,
}: NonNullable<Story['args']>) {
  const toggleProps = toggleable
    ? {
        toggleable: true as const,
        ...(defaultOpen === undefined ? {} : { defaultOpen }),
      }
    : {};

  return (
    <Form
      onSubmit={(values) => {
        action('form-submitted')(values);
        return Promise.resolve({ success: true });
      }}
      className="max-w-5xl"
    >
      <Section
        title={title}
        description={description}
        {...toggleProps}
        disabled={disabled}
        key={`${String(toggleable)}-${String(defaultOpen)}`}
      >
        <Field
          name="resource"
          label="GeoJSON resource"
          hint="Select the file containing the areas shown on the map."
          component={InputField}
          initialValue="World countries (boundaries)"
        />
        <Field
          name="selectionProperty"
          label="Selection label property"
          hint="Choose the property used to label selected areas."
          component={InputField}
          initialValue="name"
        />
        <SubmitButton>Save settings</SubmitButton>
      </Section>
    </Form>
  );
}

function NestedSectionsPreview() {
  return (
    <Form
      onSubmit={(values) => {
        action('nested-form-submitted')(values);
        return Promise.resolve({ success: true });
      }}
      className="max-w-5xl"
    >
      <Section
        title="Map configuration"
        description="Configure the map provider and the selectable areas shown to participants."
        toggleable
        defaultOpen
      >
        <div>
          <Section title="Map provider credentials">
            <Field
              name="mapboxApiKey"
              label="Mapbox API key"
              hint="Enter a public access token from your Mapbox account."
              component={InputField}
              initialValue="pk.example"
            />
          </Section>

          <Section
            title="Data source for map layers"
            description="Choose the GeoJSON resource and property used to identify selectable areas."
            toggleable
            defaultOpen={false}
          >
            <Field
              name="resource"
              label="GeoJSON resource"
              hint="Select the file containing the areas shown on the map."
              component={InputField}
              initialValue="World countries (boundaries)"
            />
            <Field
              name="selectionProperty"
              label="Selection label property"
              hint="Choose the property used to label selected areas."
              component={InputField}
              initialValue="name"
            />
          </Section>

          <SubmitButton>Save map configuration</SubmitButton>
        </div>
      </Section>
    </Form>
  );
}

function GuardedSectionPreview() {
  const { confirm } = useDialog();

  const confirmOpenChange = async (nextOpen: boolean) => {
    if (nextOpen) return true;

    const result = await confirm({
      title: 'Reset optional details?',
      description:
        'Closing this section will discard its current field values.',
      confirmLabel: 'Reset section',
      cancelLabel: 'Keep editing',
      intent: 'destructive',
      onConfirm: () => {},
    });
    return result === true;
  };

  return (
    <Form
      onSubmit={() => Promise.resolve({ success: true })}
      className="max-w-5xl"
    >
      <Section
        title="Optional details"
        description="Closing this section resets the field below."
        toggleable
        defaultOpen
        onOpenChange={confirmOpenChange}
      >
        <Field
          name="notes"
          label="Notes"
          component={InputField}
          initialValue="Initial note"
        />
      </Section>
    </Form>
  );
}

export const Default: Story = {
  render: (args) => <SectionPreview {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', {
      name: 'Data source for map layers',
    });

    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(canvas.getByLabelText('GeoJSON resource')).toBeVisible();
    await userEvent.clear(canvas.getByLabelText('GeoJSON resource'));
    await userEvent.type(canvas.getByLabelText('GeoJSON resource'), 'Edited');

    await userEvent.click(toggle);

    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await waitFor(() =>
      expect(
        canvas.queryByLabelText('GeoJSON resource'),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(toggle);
    await waitFor(() =>
      expect(canvas.getByLabelText('GeoJSON resource')).toBeVisible(),
    );
    await expect(canvas.getByLabelText('GeoJSON resource')).toHaveValue('');
  },
};

export const AlwaysOpen: Story = {
  args: {
    title: 'Mapbox API key',
    description:
      'Provide the API key used to load Mapbox maps in this interface.',
    toggleable: false,
  },
  render: (args) => <SectionPreview {...args} />,
};

export const InitiallyCollapsed: Story = {
  args: {
    defaultOpen: false,
  },
  render: (args) => <SectionPreview {...args} />,
};

export const Disabled: Story = {
  args: {
    defaultOpen: false,
    disabled: true,
  },
  render: (args) => <SectionPreview {...args} />,
};

export const GuardedReset: Story = {
  decorators: [withDialogProvider],
  render: () => <GuardedSectionPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Optional details' });
    const notes = canvas.getByLabelText('Notes');
    await userEvent.clear(notes);
    await userEvent.type(notes, 'Unsaved note');

    await userEvent.click(toggle);
    const dialog = within(document.body).getByRole('dialog', {
      name: 'Reset optional details?',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Keep editing' }),
    );
    await expect(canvas.getByDisplayValue('Unsaved note')).toBeVisible();

    await userEvent.click(toggle);
    const reopenedDialog = within(document.body).getByRole('dialog', {
      name: 'Reset optional details?',
    });
    await userEvent.click(
      within(reopenedDialog).getByRole('button', { name: 'Reset section' }),
    );
    await waitFor(() =>
      expect(canvas.queryByLabelText('Notes')).not.toBeInTheDocument(),
    );

    await userEvent.click(toggle);
    await expect(canvas.getByLabelText('Notes')).toHaveValue('');
  },
};

export const NestedSections: Story = {
  render: () => <NestedSectionsPreview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const parentToggle = canvas.getByRole('switch', {
      name: 'Map configuration',
    });
    const nestedToggle = canvas.getByRole('switch', {
      name: 'Data source for map layers',
    });
    const providerSection = canvas.getByRole('region', {
      name: 'Map provider credentials',
    });
    const dataSourceSection = canvas.getByRole('region', {
      name: 'Data source for map layers',
    });

    const providerBounds = providerSection.getBoundingClientRect();
    const dataSourceBounds = dataSourceSection.getBoundingClientRect();
    await expect(dataSourceBounds.top - providerBounds.bottom).toBeCloseTo(
      40,
      1,
    );

    await expect(
      canvas.getByRole('heading', { name: 'Map configuration', level: 3 }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('heading', {
        name: 'Map provider credentials',
        level: 4,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('textbox', { name: 'Mapbox API key' }),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText('GeoJSON resource'),
    ).not.toBeInTheDocument();

    await userEvent.click(nestedToggle);
    await waitFor(() =>
      expect(canvas.getByLabelText('GeoJSON resource')).toBeVisible(),
    );

    await userEvent.click(parentToggle);
    await waitFor(() =>
      expect(
        canvas.queryByRole('textbox', { name: 'Mapbox API key' }),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(parentToggle);
    await waitFor(() =>
      expect(
        canvas.getByRole('textbox', { name: 'Mapbox API key' }),
      ).toBeVisible(),
    );
    await expect(
      canvas.queryByLabelText('GeoJSON resource'),
    ).not.toBeInTheDocument();
  },
};
