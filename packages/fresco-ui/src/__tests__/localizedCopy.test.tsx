// The copy the components supply themselves, for the strings with no
// caller-supplied alternative. Two rules hold it:
//
// - Text a person sees, such as the two failure messages they only meet when
//   something has already gone wrong, renders through @codaco/app-i18n.
// - Text only a screen reader reads (accessible names, value text, visually
//   hidden markers, live-region announcements) stays English in every
//   language, marked `lang="en"` where it does not share an element with
//   translated text (`@codaco/app-i18n`'s README).
//
// The oracle is the pseudo-locale rather than a per-string catalog. `en-XA`
// accents and brackets whatever `formatMessage` returns, so `[Sömé
// tëxt··]` is proof a string went through the formatter, and plain English
// under it is proof it did not.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { pseudoAppLocale, PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { Alert } from '../Alert';
import { DndStoreProvider } from '../dnd/DndStoreProvider';
import {
  getDropTargetDescription,
  getKeyboardDragAnnouncement,
} from '../dnd/useAccessibilityAnnouncements';
import { useDragSource } from '../dnd/useDragSource';
import { BaseField } from '../form/Field/BaseField';
import Field from '../form/Field/Field';
import { fieldElementIds } from '../form/Field/fieldElements';
import InputField from '../form/fields/InputField';
import LikertScaleField from '../form/fields/LikertScale';
import SegmentedCodeField from '../form/fields/SegmentedCodeField';
import VisualAnalogScaleField from '../form/fields/VisualAnalogScale';
import Form from '../form/Form';
import useFormStore from '../form/hooks/useFormStore';
import FormStoreProvider from '../form/store/formStoreProvider';
import SubmitButton from '../form/SubmitButton';
import ProgressBar from '../ProgressBar';
import { ResizableFlexPanel } from '../ResizableFlexPanel';
import { SplitButton } from '../SplitButton';

/** True only for a string the pseudo-locale formatter produced. */
const wentThroughTheFormatter = (value: string | null | undefined) =>
  value !== null && value !== undefined && /^\[.*\]$/.test(value);

function Pseudo({ children }: { children: ReactNode }) {
  return (
    <AppI18nProvider
      locale={PSEUDO_LOCALE}
      locales={[pseudoAppLocale]}
      manageDocument={false}
    >
      {children}
    </AppI18nProvider>
  );
}

describe('the accessible names the components supply themselves', () => {
  it('names an unlabelled progress bar in English, whatever the interface language', () => {
    render(
      <Pseudo>
        <ProgressBar percentProgress={40} />
      </Pseudo>,
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-label', 'Progress indicator');
    expect(bar).toHaveAttribute('lang', 'en');
  });

  it('names an unlabelled panel separator in English, whatever the interface language', () => {
    render(
      <Pseudo>
        <ResizableFlexPanel storageKey="localized-copy-test">
          <div>first</div>
          <div>second</div>
        </ResizableFlexPanel>
      </Pseudo>,
    );

    const handle = screen.getByRole('slider');
    expect(handle).toHaveAttribute('aria-label', 'Resize panels');
    expect(handle).toHaveAttribute('lang', 'en');
  });

  it('names the number steppers in English, whatever the interface language', () => {
    render(
      <Pseudo>
        <InputField type="number" name="count" value="1" step={1} />
      </Pseudo>,
    );

    for (const name of ['Decrease value', 'Increase value']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'lang',
        'en',
      );
    }
  });

  it('names an unlabelled analog scale thumb in English, whatever the interface language', () => {
    const { container } = render(
      <Pseudo>
        <VisualAnalogScaleField name="feeling" value={0.5} />
      </Pseudo>,
    );

    expect(container.querySelector('[aria-label]')).toHaveAttribute(
      'aria-label',
      'Visual analog scale value',
    );
  });

  it('names an unlabelled Likert thumb, and its empty value, in English, whatever the interface language', () => {
    const { container } = render(
      <Pseudo>
        <LikertScaleField
          name="agreement"
          options={[
            { label: 'Agree', value: 1 },
            { label: 'Disagree', value: 2 },
          ]}
        />
      </Pseudo>,
    );

    expect(container.querySelector('[aria-label]')).toHaveAttribute(
      'aria-label',
      'Select value on scale',
    );

    // Nothing is selected, so the announced value is the component's own
    // "No selection" rather than an option label.
    expect(container.querySelector('[aria-valuetext]')).toHaveAttribute(
      'aria-valuetext',
      'No selection',
    );
  });

  it('announces an unanswered analog scale in English, whatever the interface language', () => {
    const { container } = render(
      <Pseudo>
        <VisualAnalogScaleField name="feeling" />
      </Pseudo>,
    );

    // With no value the thumb rests on the midpoint, so what stops the scale
    // sounding answered is this string rather than a number.
    expect(container.querySelector('[aria-valuetext]')).toHaveAttribute(
      'aria-valuetext',
      'No value chosen yet',
    );
  });

  it('names a code field, and every box in it, in English, whatever the interface language', () => {
    const { container } = render(
      <Pseudo>
        <SegmentedCodeField name="pin" segments={3} sensitive />
      </Pseudo>,
    );

    expect(container.querySelector('fieldset')).toHaveAttribute(
      'aria-label',
      'Code input',
    );
    expect(
      Array.from(container.querySelectorAll('input')).map((input) =>
        input.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Digit 1 of 3, hidden',
      'Digit 2 of 3, hidden',
      'Digit 3 of 3, hidden',
    ]);
  });

  it('names the split button’s icon-only segment in English, whatever the interface language', () => {
    render(
      <Pseudo>
        <SplitButton
          popover={{ content: <div>options</div> }}
          segment={{ children: '', icon: <span aria-hidden="true">▾</span> }}
        >
          Save
        </SplitButton>
      </Pseudo>,
    );

    // The segment shows no text, so this fallback is the only name it has.
    const segment = screen.getByRole('button', { name: 'Open options' });
    expect(segment).toHaveAttribute('lang', 'en');
  });
});

describe('the markers a field renders around its control', () => {
  it('marks a required field in English, whatever the interface language', () => {
    const { container } = render(
      <Pseudo>
        <BaseField id="pet" label="Pet" required>
          <input id="pet" />
        </BaseField>
      </Pseudo>,
    );

    const marker = container.querySelector(
      `#${fieldElementIds('pet').required}`,
    );
    expect(marker?.textContent).toBe('Required');
    expect(marker).toHaveAttribute('lang', 'en');
  });
});

describe('the kind an alert announces before its content', () => {
  it('names the variant in English, whatever the interface language', () => {
    const { container } = render(
      <Pseudo>
        <Alert variant="warning">Careful</Alert>
      </Pseudo>,
    );

    // Sighted readers get this from the colour and icon; the visually hidden
    // prefix is where a screen-reader user gets it, separator and all.
    const prefix = container.querySelector('.sr-only');
    expect(prefix?.textContent).toBe('Warning: ');
    expect(prefix).toHaveAttribute('lang', 'en');
  });
});

describe('the failure messages the form layer supplies itself', () => {
  it('reports a throwing submit handler through the formatter', async () => {
    render(
      <Pseudo>
        <Form
          onSubmit={() => {
            throw new Error('boom');
          }}
        >
          <Field name="name" label="Name" component={InputField} />
          <SubmitButton>Go</SubmitButton>
        </Form>
      </Pseudo>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    // `Form` renders its form-level errors itself, at the top of the form.
    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(wentThroughTheFormatter(alert.textContent)).toBe(true);
    });
  });

  it('reports a throwing validation rule through the formatter', async () => {
    // Registered on the store rather than through a `Field`: the catch-all
    // exists for a validation function that throws, and every rule reachable
    // from a field's props returns a message of its own.
    function ThrowingField() {
      const registerField = useFormStore((store) => store.registerField);
      const validateField = useFormStore((store) => store.validateField);
      const errors = useFormStore((store) => store.getFieldErrors('name'));

      useEffect(() => {
        registerField({
          name: 'name',
          validation: () => {
            throw new Error('boom');
          },
        });
      }, [registerField]);

      return (
        <>
          <button type="button" onClick={() => void validateField('name')}>
            validate
          </button>
          <output>{errors?.join(' ')}</output>
        </>
      );
    }

    render(
      <Pseudo>
        <FormStoreProvider>
          <ThrowingField />
        </FormStoreProvider>
      </Pseudo>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'validate' }));

    await waitFor(() => {
      expect(
        wentThroughTheFormatter(screen.getByRole('status').textContent),
      ).toBe(true);
    });
  });
});

describe('the drag-and-drop live-region announcements', () => {
  it('describes a drop target in English', () => {
    expect(getDropTargetDescription(0, 3)).toBe('Drop target 1 of 3');
    expect(getDropTargetDescription(1, 3, 'Bin')).toBe(
      'Drop target 2 of 3: Bin',
    );
  });

  it('announces each keyboard drag step in English', () => {
    expect(getKeyboardDragAnnouncement('cancel')).toBe('Drag cancelled');
    expect(getKeyboardDragAnnouncement('drop', 'somewhere')).toBe(
      'Dropped item. somewhere',
    );
    expect(getKeyboardDragAnnouncement('navigate')).toBe(
      'Navigated to drop target',
    );
    expect(getKeyboardDragAnnouncement('start', 'a thing')).toBe(
      'Started dragging. a thing Use arrow keys to navigate between drop targets. Press Space or Enter to drop. Press Escape to cancel.',
    );
  });

  it('announces a keyboard grab in English, in a region marked English', async () => {
    function Draggable() {
      const { dragProps } = useDragSource({ type: 'thing' });
      return <div {...dragProps}>a thing</div>;
    }

    render(
      <Pseudo>
        <DndStoreProvider>
          <Draggable />
        </DndStoreProvider>
      </Pseudo>,
    );

    // Ctrl+D is what starts a keyboard drag; the announcement lands in the
    // live region the hook appends to the document.
    const source = screen.getByText('a thing');
    fireEvent.keyDown(source, { key: 'd', ctrlKey: true });

    await waitFor(() => {
      const region = document.querySelector('[role="status"]');
      expect(region?.textContent).toBe(
        'Item grabbed, use arrow keys to navigate to drop targets, press Escape to cancel',
      );
      expect(region).toHaveAttribute('lang', 'en');
      expect(region).toHaveAttribute('dir', 'ltr');
    });

    fireEvent.keyDown(source, { key: 'Escape' });

    await waitFor(() => {
      const region = document.querySelector('[role="status"]');
      expect(region?.textContent).toBe(
        'Drop cancelled, Item returned to original position',
      );
    });
  });
});
