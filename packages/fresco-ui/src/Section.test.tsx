import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Field from './form/Field/Field';
import InputField from './form/fields/InputField';
import Form from './form/Form';
import useFormStore from './form/hooks/useFormStore';
import SubmitButton from './form/SubmitButton';
import Section, { type SectionProps } from './Section';

function RegisteredFields() {
  const names = useFormStore((state) =>
    Array.from(state.fields.keys()).join(', '),
  );

  return <output aria-label="Registered fields">{names}</output>;
}

describe('Section', () => {
  it('unregisters fields while collapsed and restores them when reopened', async () => {
    const onSubmit = vi.fn(() => Promise.resolve({ success: true as const }));

    render(
      <Form onSubmit={onSubmit}>
        <Section
          title="Optional details"
          description="Add extra information when it is available."
          toggleable
          defaultOpen
        >
          <Field
            name="notes"
            label="Notes"
            component={InputField}
            initialValue="Remember this"
          />
        </Section>
        <RegisteredFields />
        <SubmitButton>Save</SubmitButton>
      </Form>,
    );

    const toggle = screen.getByRole('switch', { name: 'Optional details' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByLabelText('Notes')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Registered fields' }),
    ).toHaveTextContent('notes');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument();
      expect(
        screen.getByRole('status', { name: 'Registered fields' }),
      ).toHaveTextContent('');
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({}));

    fireEvent.click(toggle);

    expect(await screen.findByDisplayValue('Remember this')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'Registered fields' }),
    ).toHaveTextContent('notes');
  });

  it('keeps non-toggleable sections open without a disclosure control', async () => {
    render(
      <Form onSubmit={() => Promise.resolve({ success: true })}>
        <Section
          title="Always visible"
          description="This section has no disclosure control."
        >
          <Field name="name" label="Name" component={InputField} />
        </Section>
      </Form>,
    );

    expect(
      screen.getByRole('region', { name: 'Always visible' }),
    ).toHaveAccessibleDescription('This section has no disclosure control.');
    expect(await screen.findByLabelText('Name')).toBeVisible();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('accepts defaultOpen only for toggleable sections', () => {
    const toggleableProps = {
      title: 'Toggleable section',
      toggleable: true,
      defaultOpen: false,
    } satisfies SectionProps;

    // @ts-expect-error defaultOpen is invalid when toggleable is omitted.
    const alwaysOpenProps: SectionProps = {
      title: 'Always-open section',
      defaultOpen: false,
    };

    // @ts-expect-error defaultOpen is invalid when toggleable is false.
    const explicitlyAlwaysOpenProps: SectionProps = {
      title: 'Explicitly always-open section',
      toggleable: false,
      defaultOpen: false,
    };

    expect(toggleableProps).toMatchObject({
      toggleable: true,
      defaultOpen: false,
    });
    void alwaysOpenProps;
    void explicitlyAlwaysOpenProps;
  });

  it('opens and closes exactly once from the keyboard', async () => {
    const user = userEvent.setup();

    render(
      <Section
        title="Keyboard settings"
        description="Operate this section without a pointer."
        toggleable
        defaultOpen={false}
      >
        <div>Keyboard content</div>
      </Section>,
    );

    const toggle = screen.getByRole('switch', { name: 'Keyboard settings' });
    toggle.focus();

    await user.keyboard(' ');

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Keyboard content')).toBeVisible();

    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.queryByText('Keyboard content')).not.toBeInTheDocument(),
    );
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('prevents a disabled collapsed section from opening', () => {
    render(
      <Section
        title="Unavailable settings"
        description="Complete the preceding step first."
        toggleable
        defaultOpen={false}
        disabled
      >
        <div>Hidden settings</div>
      </Section>,
    );

    const toggle = screen.getByRole('switch', {
      name: 'Unavailable settings',
    });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(screen.queryByText('Hidden settings')).not.toBeInTheDocument();
  });

  it('dims and identifies the heading of a disabled section', () => {
    render(
      <Section
        title="Unavailable settings"
        description="Complete the preceding step first."
        disabled
      >
        <div>Disabled settings</div>
      </Section>,
    );

    const section = screen.getByRole('region', {
      name: 'Unavailable settings',
    });
    const heading = screen.getByRole('heading', {
      name: 'Unavailable settings',
    });

    expect(section).toHaveAttribute('aria-disabled', 'true');
    expect(heading.parentElement).toHaveClass('group-aria-disabled:opacity-50');
  });

  it('omits description markup and semantics when none is provided', () => {
    render(
      <Section title="Title only">
        <div>Section content</div>
      </Section>,
    );

    const section = screen.getByRole('region', { name: 'Title only' });

    expect(section).not.toHaveAttribute('aria-describedby');
    expect(section.querySelector('p')).not.toBeInTheDocument();
    expect(screen.getByText('Section content')).toBeVisible();
  });

  it('reduces heading level and typography when nested in another section', () => {
    render(
      <Section title="Parent section">
        <Section title="Nested section">
          <div>Nested content</div>
        </Section>
      </Section>,
    );

    const parentHeading = screen.getByRole('heading', {
      name: 'Parent section',
      level: 3,
    });
    const nestedHeading = screen.getByRole('heading', {
      name: 'Nested section',
      level: 4,
    });

    expect(parentHeading).toHaveClass('text-xl');
    expect(nestedHeading).toHaveClass('text-lg');
  });
});
