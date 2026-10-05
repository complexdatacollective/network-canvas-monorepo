import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';
import Field from '../../Field/Field';
import FormStoreProvider from '../../store/formStoreProvider';
import ArrayField, { type ArrayFieldItemProps } from '../ArrayField/ArrayField';
import CheckboxGroupField from '../CheckboxGroup';
import InputField from '../InputField';
import LikertScaleField from '../LikertScale';
import RadioMatrixField from '../RadioMatrixField';
import ToggleButtonGroupField from '../ToggleButtonGroup';
import VisualAnalogScaleField from '../VisualAnalogScale';

type Option = { label: string };

function OptionItem({ item }: ArrayFieldItemProps<Option>) {
  return <span>{item.label}</span>;
}

/**
 * How an element that carries one of these attributes identifies itself, for
 * an assertion that names the carriers rather than counting them: a relocated
 * attribute then fails with the role it moved to.
 */
function carriersOf(container: HTMLElement, attribute: string) {
  return Array.from(container.querySelectorAll(`[${attribute}]`)).map(
    (element) =>
      element.getAttribute('role') ??
      `${element.tagName.toLowerCase()}[type=${
        element.getAttribute('type') ?? 'none'
      }]`,
  );
}

/**
 * `useField` injects `aria-readonly` and `aria-required` into the prop bag
 * every field spreads onto its element. ARIA 1.2 made `aria-disabled` and
 * `aria-invalid` global attributes — valid anywhere, so they stay — but these
 * two are allowed only on the roles that list them as supported:
 * `aria-readonly` on `textbox`, `checkbox`, `combobox`, `grid`, `gridcell`,
 * `listbox`, `radiogroup`, `slider` and `spinbutton`; `aria-required` on
 * `combobox`, `gridcell`, `listbox`, `radiogroup`, `spinbutton`, `textbox` and
 * `tree`, plus roles inheriting it such as `checkbox`.
 *
 * So a field whose outer element is a container — `role="list"`, a
 * `<fieldset>`'s implicit `group`, a layout `<div>` — has to drop both there
 * and keep them on the control it wraps. axe reports the leak as
 * `aria-allowed-attr` (critical) whatever the value, so these assertions hold
 * for a field that is neither read-only nor required too.
 */
describe('widget-only ARIA placement', () => {
  it('keeps aria-readonly and aria-required off list and group containers', () => {
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
            required
          />
          <Field
            name="edges"
            label="Edge types"
            component={CheckboxGroupField}
            options={[{ value: 'knows', label: 'Knows' }]}
            initialValue={[]}
            readOnly
            required
          />
          <Field
            name="tags"
            label="Tags"
            component={ToggleButtonGroupField}
            options={[{ value: 'one', label: 'One' }]}
            initialValue={[]}
            readOnly
            required
          />
          <Field
            name="title"
            label="Title"
            component={InputField}
            initialValue="Wave 1"
            readOnly
            required
          />
        </DialogProvider>
      </FormStoreProvider>,
    );

    for (const container of [
      screen.getByRole('list', { name: 'Options' }),
      screen.getByRole('group', { name: 'Edge types' }),
      screen.getByRole('group', { name: 'Tags' }),
    ]) {
      expect(container).not.toHaveAttribute('aria-readonly');
      expect(container).not.toHaveAttribute('aria-required');
      // Neither container role can say it, so the state has to survive
      // somewhere a screen reader still reads: the visually hidden "Required"
      // marker `BaseField` renders and `aria-describedby` names.
      expect(container).toHaveAccessibleDescription(/Required/);
    }

    // The read-only state still reaches the controls whose role does allow it.
    expect(screen.getByRole('checkbox', { name: 'Knows' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'One' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    // Required-ness does NOT move onto the individual options: it is the
    // group's answer that is required, not any one checkbox or toggle.
    expect(screen.getByRole('checkbox', { name: 'Knows' })).not.toHaveAttribute(
      'aria-required',
    );
    expect(screen.getByRole('checkbox', { name: 'One' })).not.toHaveAttribute(
      'aria-required',
    );

    // A single-control field spreads the bag straight onto its widget, whose
    // `textbox` role allows both. Nothing here changes for those.
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'aria-required',
      'true',
    );
  });

  it('keeps both attributes off the fieldset a radio matrix renders', () => {
    const { container } = render(
      <FormStoreProvider>
        <Field
          name="matrix"
          label="Closeness"
          component={RadioMatrixField}
          rows={[{ id: 'alex', label: 'Alex' }]}
          options={[
            { value: 'near', label: 'Near' },
            { value: 'far', label: 'Far' },
          ]}
          initialValue={[]}
          readOnly
          required
        />
      </FormStoreProvider>,
    );

    expect(
      screen.getByRole('group', { name: 'Closeness' }),
    ).not.toHaveAttribute('aria-readonly');
    expect(
      screen.getByRole('group', { name: 'Closeness' }),
    ).not.toHaveAttribute('aria-required');

    // Every remaining carrier is a row's `radiogroup`, a role that allows
    // `aria-readonly` — and the rows are not independently required.
    expect(carriersOf(container, 'aria-readonly')).toEqual(['radiogroup']);
    expect(carriersOf(container, 'aria-required')).toEqual([]);
  });

  it('keeps both attributes off every element a scale field renders', () => {
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
          required
        />
        <Field
          name="intensity"
          label="Intensity"
          component={VisualAnalogScaleField}
          initialValue={0.5}
          readOnly
          required
        />
      </FormStoreProvider>,
    );

    // A scale renders three candidates and not one of them may carry these:
    // its own positioning `<div>` has no role at all, Base UI's `Slider.Root`
    // is a `role="group"` wrapper, and the thumb's outer element is another
    // roleless `<div>`. The only `slider` in the tree is the
    // `<input type="range">` nested inside the thumb, and Base UI forwards
    // only naming attributes to it — so there is nowhere valid to put them,
    // and both scales drop them entirely. Required-ness still reaches that
    // input through its `aria-describedby`.
    expect(carriersOf(container, 'aria-readonly')).toEqual([]);
    expect(carriersOf(container, 'aria-required')).toEqual([]);
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAccessibleDescription(/Required/);
    }
  });
});
