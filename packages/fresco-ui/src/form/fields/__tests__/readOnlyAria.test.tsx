import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import Field from '../../Field/Field';
import FormStoreProvider from '../../store/formStoreProvider';
import ArrayField, { type ArrayFieldItemProps } from '../ArrayField/ArrayField';
import CheckboxGroupField from '../CheckboxGroup';
import InputField from '../InputField';
import LikertScaleField from '../LikertScale';
import ToggleButtonGroupField from '../ToggleButtonGroup';
import VisualAnalogScaleField from '../VisualAnalogScale';

type Option = { label: string };

function OptionItem({ item }: ArrayFieldItemProps<Option>) {
  return <span>{item.label}</span>;
}

/**
 * `useField` injects `aria-readonly` into the prop bag every field spreads
 * onto its element. WAI-ARIA only allows the attribute on widget roles
 * (`textbox`, `checkbox`, `slider`, …), so a field whose outer element is a
 * container — `role="list"`, a `<fieldset>`'s implicit `group`, a layout
 * `<div>` — has to drop it there and keep it on the control it wraps. axe
 * reports the leak as `aria-allowed-attr` (critical) whatever the value, so
 * these assertions hold for a field that is not read-only too.
 */
describe('read-only ARIA placement', () => {
  it('keeps aria-readonly off list and group containers', () => {
    render(
      <FormStoreProvider>
        <DialogProvider>
          <Field
            name="options"
            label="Options"
            component={ArrayField}
            itemComponent={OptionItem}
            itemTemplate={() => ({ label: '' })}
            initialValue={[{ label: 'One' }]}
            readOnly
          />
          <Field
            name="edges"
            label="Edge types"
            component={CheckboxGroupField}
            options={[{ value: 'knows', label: 'Knows' }]}
            initialValue={[]}
            readOnly
          />
          <Field
            name="tags"
            label="Tags"
            component={ToggleButtonGroupField}
            options={[{ value: 'one', label: 'One' }]}
            initialValue={[]}
            readOnly
          />
          <Field
            name="title"
            label="Title"
            component={InputField}
            initialValue="Wave 1"
            readOnly
          />
        </DialogProvider>
      </FormStoreProvider>,
    );

    expect(screen.getByRole('list', { name: 'Options' })).not.toHaveAttribute(
      'aria-readonly',
    );
    expect(
      screen.getByRole('group', { name: 'Edge types' }),
    ).not.toHaveAttribute('aria-readonly');
    expect(screen.getByRole('group', { name: 'Tags' })).not.toHaveAttribute(
      'aria-readonly',
    );

    // The state still reaches the controls whose role does allow it.
    expect(screen.getByRole('checkbox', { name: 'Knows' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'One' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
  });

  it('keeps aria-readonly off the layout wrapper a scale field renders', () => {
    const { container } = render(
      <FormStoreProvider>
        <Field
          name="rating"
          label="Agreement"
          component={LikertScaleField}
          options={[
            { value: 1, label: 'Disagree' },
            { value: 2, label: 'Agree' },
          ]}
          initialValue={2}
          readOnly
        />
        <Field
          name="intensity"
          label="Intensity"
          component={VisualAnalogScaleField}
          initialValue={0.5}
          readOnly
        />
      </FormStoreProvider>,
    );

    // An element with no role at all accepts only the global ARIA attributes,
    // which `aria-readonly` is not. Both scales used to spread the injected
    // attribute straight onto the positioning `<div>` they wrap the slider in.
    const roleless = Array.from(
      container.querySelectorAll('[aria-readonly]'),
    ).filter((element) => !element.hasAttribute('role'));
    expect(roleless).toHaveLength(0);
  });
});
