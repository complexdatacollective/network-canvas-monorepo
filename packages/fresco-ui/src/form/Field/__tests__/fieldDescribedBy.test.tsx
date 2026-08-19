import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { findDanglingIdReferences } from '../../../utils/ariaIdReferences';
import InputField from '../../fields/InputField';
import Form from '../../Form';
import { useField } from '../../hooks/useField';
import { BaseField } from '../BaseField';
import Field from '../Field';
import {
  BASE_FIELD_ELEMENTS,
  fieldDescribedBy,
  type FieldElements,
} from '../fieldElements';
import UnconnectedField from '../UnconnectedField';

function describedByIds(control: HTMLElement): string[] {
  return (control.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean);
}

/**
 * The shape of a caller that spreads `fieldProps` onto markup of its own
 * instead of rendering through BaseField (interview's QuickAddField and its
 * NetworkComposer sibling): whatever it does not render, it must not name.
 */
function BareCaller({
  renderedElements,
  renderErrorRegion = false,
}: {
  renderedElements?: FieldElements;
  renderErrorRegion?: boolean;
}) {
  const { id, fieldProps } = useField({
    name: 'name',
    required: true,
    renderedElements,
  });

  return (
    <>
      <InputField
        {...fieldProps}
        id={id}
        name="name"
        aria-label="Name"
        data-testid="bare-input"
        value={fieldProps.value as string}
      />
      {/*
        Written out rather than taken from `fieldElementIds`, because that is
        the mistake being guarded against: a caller that hand-writes an ID has
        to have rendered the element it names.
      */}
      {renderErrorRegion && <div id={`${id}-error`} aria-live="polite" />}
    </>
  );
}

function renderBareCaller(props: {
  renderedElements?: FieldElements;
  renderErrorRegion?: boolean;
}) {
  const { container } = render(
    <Form onSubmit={() => ({ success: true })}>
      <BareCaller {...props} />
    </Form>,
  );
  return { control: screen.getByTestId('bare-input'), container };
}

describe('field ARIA references have one owner', () => {
  it('names nothing when the caller declares nothing', () => {
    // The default. A required field whose caller renders no label, no required
    // marker, no hint and no error region: naming them would be four IDREFs
    // pointing at nothing, and the dangling `aria-labelledby` would displace
    // the control's own `aria-label` in the accessible-name computation.
    const { control, container } = renderBareCaller({});

    expect(describedByIds(control)).toEqual([]);
    expect(control).not.toHaveAttribute('aria-labelledby');
    expect(findDanglingIdReferences(container)).toEqual([]);
    // The name survives, which is the whole point of not naming a label.
    expect(screen.getByRole('textbox', { name: 'Name' })).toBe(control);
  });

  it('names only the error region a caller renders itself', () => {
    const { control, container } = renderBareCaller({
      renderedElements: { error: true },
      renderErrorRegion: true,
    });

    expect(describedByIds(control)).toEqual([`${control.id}-error`]);
    expect(control).not.toHaveAttribute('aria-labelledby');
    expect(findDanglingIdReferences(container)).toEqual([]);
  });

  it('names every element BaseField renders for a connected field', () => {
    const { container } = render(
      <Form onSubmit={() => ({ success: true })}>
        <Field
          name="name"
          label="Name"
          hint="As it appears on your ID"
          required
          component={InputField}
        />
      </Form>,
    );
    const control = screen.getByRole('textbox', { name: 'Name' });

    expect(control).toHaveAttribute('aria-labelledby', `${control.id}-label`);
    expect(describedByIds(control)).toEqual([
      `${control.id}-required`,
      `${control.id}-hint`,
      `${control.id}-error`,
    ]);
    expect(findDanglingIdReferences(container)).toEqual([]);
  });

  it('names the same elements for an unconnected field', () => {
    const { container } = render(
      <UnconnectedField
        name="name"
        label="Name"
        hint="As it appears on your ID"
        required
        errors={['Too short']}
        showErrors
        component={InputField}
      />,
    );
    const control = screen.getByRole('textbox', { name: 'Name' });

    expect(control).toHaveAttribute('aria-labelledby', `${control.id}-label`);
    expect(describedByIds(control)).toEqual([
      `${control.id}-required`,
      `${control.id}-hint`,
      `${control.id}-error`,
    ]);
    expect(findDanglingIdReferences(container)).toEqual([]);
  });

  it('renders an element for everything the owner can name', () => {
    // The guard that keeps the declarations and the markup from drifting
    // apart: every element `BASE_FIELD_ELEMENTS` claims has to be one BaseField
    // actually rendered, since Field passes that set verbatim.
    const { container } = render(
      <BaseField
        id="field"
        name="name"
        label="Name"
        hint="As it appears on your ID"
        required
        errors={['Too short']}
        showErrors
      >
        <input
          id="field"
          aria-labelledby="field-label"
          aria-describedby={fieldDescribedBy('field', BASE_FIELD_ELEMENTS)}
        />
      </BaseField>,
    );

    expect(fieldDescribedBy('field', BASE_FIELD_ELEMENTS).split(' ')).toEqual([
      'field-required',
      'field-hint',
      'field-error',
    ]);
    expect(findDanglingIdReferences(container)).toEqual([]);
  });
});
