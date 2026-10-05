import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PresentationalText } from '../../../PresentationalText';
import BooleanField from '../Boolean';
import CheckboxGroupField from '../CheckboxGroup';
import ComboboxField from '../Combobox/Combobox';
import LikertScaleField from '../LikertScale';
import LocaleSelect from '../LocaleSelect';
import RadioGroupField from '../RadioGroup';
import RadioMatrixField from '../RadioMatrixField';
import RichSelectGroupField from '../RichSelectGroup';
import NativeSelectField from '../Select/Native';
import StyledSelectField from '../Select/Styled';
import ToggleButtonGroupField from '../ToggleButtonGroup';
import VisualAnalogScaleField from '../VisualAnalogScale';

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

/**
 * The element nearest to `element` that declares a language — the one whose
 * `lang`/`dir` a browser and screen reader apply to it.
 */
const languageOf = (element: Element | null) => {
  const marked = element?.closest('[lang]');
  return marked
    ? { lang: marked.getAttribute('lang'), dir: marked.getAttribute('dir') }
    : null;
};

const ARABIC = { lang: 'ar', dir: 'rtl' };
const SPANISH = { lang: 'es', dir: 'ltr' };

const noop = () => undefined;

describe('option groups', () => {
  it('RadioGroup marks each option label, renders its Markdown, and names the radio with its text', () => {
    render(
      <RadioGroupField
        name="answer"
        aria-label="Answer"
        onChange={noop}
        options={[
          { value: 'yes', label: arabic('**نعم**') },
          { value: 'no', label: arabic('لا') },
          { value: 'skip', label: 'Skip' },
        ]}
      />,
    );

    expect(screen.getByText('نعم').tagName).toBe('STRONG');
    expect(languageOf(screen.getByText('نعم'))).toEqual(ARABIC);
    expect(languageOf(screen.getByText('لا'))).toEqual(ARABIC);
    expect(screen.getByRole('radio', { name: 'لا' })).toBeInTheDocument();
    expect(languageOf(screen.getByText('Skip'))).toBeNull();
  });

  it('CheckboxGroup marks each option label', () => {
    render(
      <CheckboxGroupField
        name="pets"
        aria-label="Pets"
        onChange={noop}
        options={[
          { value: 'dog', label: spanish('Perro') },
          { value: 'cat', label: spanish('Gato') },
        ]}
      />,
    );

    expect(languageOf(screen.getByText('Perro'))).toEqual(SPANISH);
    expect(screen.getByRole('checkbox', { name: 'Gato' })).toBeInTheDocument();
  });

  it('ToggleButtonGroup marks the toggle that carries the label as its accessible name', () => {
    render(
      <ToggleButtonGroupField
        name="days"
        aria-label="Days"
        onChange={noop}
        options={[
          { value: 'mon', label: arabic('الاثنين') },
          { value: 'tue', label: 'Tuesday' },
        ]}
      />,
    );

    const monday = screen.getByRole('checkbox', { name: 'الاثنين' });
    expect(monday).toHaveAttribute('lang', 'ar');
    expect(monday).toHaveAttribute('dir', 'rtl');
    expect(
      screen.getByRole('checkbox', { name: 'Tuesday' }),
    ).not.toHaveAttribute('lang');
  });

  it('Boolean marks each option label', () => {
    render(
      <BooleanField
        aria-label="Agree"
        onChange={noop}
        options={[
          { label: arabic('نعم'), value: true },
          { label: arabic('لا'), value: false, negative: true },
        ]}
      />,
    );

    expect(languageOf(screen.getByText('نعم'))).toEqual(ARABIC);
    expect(screen.getByRole('radio', { name: 'لا' })).toBeInTheDocument();
  });

  it('RichSelectGroup marks the label and the description separately', () => {
    render(
      <RichSelectGroupField
        aria-label="Strength"
        onChange={noop}
        options={[
          {
            value: 1,
            label: spanish('Fuerte'),
            description: arabic('علاقة قوية'),
          },
        ]}
      />,
    );

    expect(languageOf(screen.getByText('Fuerte'))).toEqual(SPANISH);
    expect(languageOf(screen.getByText('علاقة قوية'))).toEqual(ARABIC);
  });

  it('RadioMatrixField marks row labels, column headers and each radio label', () => {
    render(
      <RadioMatrixField
        name="matrix"
        aria-label="Matrix"
        onChange={noop}
        rowHeader={arabic('الشخص')}
        rows={[{ id: 'a', label: arabic('أحمد') }]}
        options={[{ value: 'close', label: arabic('قريب') }]}
      />,
    );

    expect(languageOf(screen.getByText('الشخص'))).toEqual(ARABIC);
    expect(languageOf(screen.getByText('أحمد'))).toEqual(ARABIC);
    for (const optionLabel of screen.getAllByText('قريب')) {
      expect(languageOf(optionLabel)).toEqual(ARABIC);
    }
  });
});

describe('selects', () => {
  it('native select puts lang and dir on each <option> and <optgroup>, with the bare text inside', () => {
    render(
      <NativeSelectField
        aria-label="Language"
        onChange={noop}
        options={[
          {
            label: spanish('Idiomas'),
            options: [
              { value: 'ar', label: arabic('العربية') },
              { value: 'es', label: spanish('Español') },
            ],
          },
          { value: 'en', label: 'English' },
        ]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Language' });
    const arabicOption = within(select).getByRole('option', {
      name: 'العربية',
    });
    expect(arabicOption).toHaveAttribute('lang', 'ar');
    expect(arabicOption).toHaveAttribute('dir', 'rtl');
    expect(arabicOption).toHaveTextContent(/^العربية$/);

    const group = select.querySelector('optgroup');
    expect(group).toHaveAttribute('label', 'Idiomas');
    expect(group).toHaveAttribute('lang', 'es');

    expect(
      within(select).getByRole('option', { name: 'English' }),
    ).not.toHaveAttribute('lang');
  });

  it('LocaleSelect gives each autonym the language and direction it names', () => {
    render(
      <LocaleSelect
        aria-label="Language"
        value={null}
        onChange={noop}
        options={[
          { locale: 'ar', label: 'العربية', direction: 'rtl' },
          { locale: 'es', label: 'Español', direction: 'ltr' },
        ]}
      />,
    );

    const option = screen.getByRole('option', { name: 'العربية' });
    expect(option).toHaveAttribute('lang', 'ar');
    expect(option).toHaveAttribute('dir', 'rtl');
  });

  it('styled select marks the selected value and each listed item', async () => {
    const user = userEvent.setup();
    render(
      <StyledSelectField
        aria-label="Language"
        value="ar"
        onChange={noop}
        options={[
          { value: 'ar', label: arabic('العربية') },
          { value: 'en', label: 'English' },
        ]}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Language' });
    expect(languageOf(within(trigger).getByText('العربية'))).toEqual(ARABIC);

    await user.click(trigger);
    const listed = await screen.findByRole('option', { name: 'العربية' });
    expect(languageOf(within(listed).getByText('العربية'))).toEqual(ARABIC);
    expect(
      languageOf(
        within(screen.getByRole('option', { name: 'English' })).getByText(
          'English',
        ),
      ),
    ).toBeNull();
  });

  it('combobox filters on the bare text and marks each item', async () => {
    const user = userEvent.setup();
    render(
      <ComboboxField
        aria-label="Languages"
        value={[]}
        onChange={noop}
        options={[
          { value: 'es', label: spanish('Español') },
          { value: 'ar', label: arabic('العربية') },
          { value: 'en', label: 'English' },
        ]}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Languages' }));
    const spanishItem = await screen.findByRole('option', { name: 'Español' });
    expect(spanishItem).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('option', { name: 'العربية' })).toHaveAttribute(
      'dir',
      'rtl',
    );

    await user.type(screen.getByRole('combobox', { name: '' }), 'Esp');
    expect(
      await screen.findByRole('option', { name: 'Español' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'العربية' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'English' }),
    ).not.toBeInTheDocument();
  });
});

describe('scale endpoint labels', () => {
  it('LikertScale marks every rendering of each option label, and announces the bare text', () => {
    render(
      <LikertScaleField
        aria-label="Agreement"
        value="agree"
        onChange={noop}
        options={[
          { value: 'disagree', label: arabic('لا أوافق') },
          { value: 'neutral', label: arabic('محايد') },
          { value: 'agree', label: arabic('أوافق') },
        ]}
      />,
    );

    for (const text of ['لا أوافق', 'محايد', 'أوافق']) {
      const renderings = screen.getAllByText(text);
      expect(renderings.length).toBeGreaterThan(0);
      for (const rendering of renderings) {
        expect(languageOf(rendering)).toEqual(ARABIC);
      }
    }
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'أوافق',
    );
  });

  it('VisualAnalogScale marks its endpoint labels', () => {
    render(
      <VisualAnalogScaleField
        aria-label="Closeness"
        onChange={noop}
        minLabel={arabic('ليس قريبا')}
        maxLabel={spanish('Muy cerca')}
      />,
    );

    expect(languageOf(screen.getByText('ليس قريبا'))).toEqual(ARABIC);
    expect(languageOf(screen.getByText('Muy cerca'))).toEqual(SPANISH);
  });
});
