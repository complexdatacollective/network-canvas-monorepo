import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PresentationalText } from '../../../PresentationalText';
import BooleanField from '../../fields/Boolean';
import InputField from '../../fields/InputField';
import RadioGroupField from '../../fields/RadioGroup';
import Form from '../../Form';
import Field from '../Field';
import { fieldElementIds } from '../fieldElements';
import UnconnectedField from '../UnconnectedField';

const arabic = (text: string): PresentationalText => ({
  text,
  lang: 'ar',
  dir: 'rtl',
});
const spanish = (text: string): PresentationalText => ({
  text,
  lang: 'es',
  dir: 'ltr',
});

const renderInForm = (field: React.ReactNode) =>
  render(<Form onSubmit={() => ({ success: true })}>{field}</Form>);

describe('Field with PresentationalText copy', () => {
  it('marks the label element with the text’s language and direction, keeping its Markdown and the control’s name', () => {
    renderInForm(
      <Field
        name="relationship"
        label={arabic('ما **علاقتك** بهذا الشخص؟')}
        component={RadioGroupField}
        options={[
          { value: 'friend', label: arabic('صديق') },
          { value: 'family', label: arabic('عائلة') },
        ]}
      />,
    );

    const group = screen.getByRole('radiogroup', {
      name: 'ما علاقتك بهذا الشخص؟',
    });
    const label = document.getElementById(
      group.getAttribute('aria-labelledby') ?? '',
    );
    expect(label?.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('lang', 'ar');
    expect(label).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('علاقتك').tagName).toBe('STRONG');
    expect(screen.getByText('علاقتك').closest('label')).toBe(label);
  });

  it('marks the hint with its own language, apart from the label', () => {
    renderInForm(
      <Field
        name="nickname"
        label={arabic('اللقب')}
        hint={spanish('Escribe el nombre **que usas**')}
        component={InputField}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'اللقب' });
    const hintId = fieldElementIds(input.id).hint;
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(
      hintId,
    );
    const hint = document.getElementById(hintId);
    expect(hint).not.toBeNull();

    const hintText = screen.getByText('que usas');
    expect(hintText.tagName).toBe('STRONG');
    const marked = hintText.closest('[lang]');
    expect(marked).toHaveAttribute('lang', 'es');
    expect(marked).toHaveAttribute('dir', 'ltr');
    expect(hint?.contains(marked ?? null)).toBe(true);
    expect(hint).not.toHaveAttribute('lang');
  });

  it('accepts PresentationalText as the label of a field whose control declares its own label', () => {
    renderInForm(
      <Field
        name="consent"
        label={spanish('¿Estás de acuerdo?')}
        component={BooleanField}
        options={[
          { label: spanish('Sí'), value: true },
          { label: spanish('No'), value: false },
        ]}
      />,
    );

    expect(screen.getByText('¿Estás de acuerdo?')).toHaveAttribute(
      'lang',
      'es',
    );
    expect(screen.getByText('Sí').closest('[lang]')).toHaveAttribute(
      'lang',
      'es',
    );
  });

  it('leaves plain-string copy in the page’s language', () => {
    renderInForm(
      <Field
        name="nickname"
        label="Nickname"
        hint="The name you **go by**"
        component={InputField}
      />,
    );

    expect(screen.getByText('Nickname').closest('[lang]')).toBeNull();
    expect(screen.getByText('go by').tagName).toBe('STRONG');
    expect(screen.getByText('go by').closest('[lang]')).toBeNull();
  });
});

describe('UnconnectedField with PresentationalText copy', () => {
  it('marks its label and hint the same way', () => {
    render(
      <UnconnectedField
        name="age"
        label={arabic('العمر')}
        hint={arabic('بالسنوات')}
        component={InputField}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'العمر' });
    const label = document.getElementById(fieldElementIds(input.id).label);
    expect(label).toHaveAttribute('lang', 'ar');
    expect(label).toHaveAttribute('dir', 'rtl');
    expect(screen.getByText('بالسنوات')).toHaveAttribute('dir', 'rtl');
  });
});
