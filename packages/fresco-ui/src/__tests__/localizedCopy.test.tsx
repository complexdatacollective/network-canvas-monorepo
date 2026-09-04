// The release note claims every piece of copy the components supply
// themselves renders through @codaco/app-i18n. This is what holds it to that
// for the strings with no caller-supplied alternative — accessible names,
// live-region announcements and the two failure messages a person only sees
// when something has already gone wrong, which are exactly the ones nobody
// notices staying English.
//
// The oracle is the pseudo-locale rather than a per-string catalog. `en-XA`
// accents and brackets whatever `formatMessage` returns, so `[Prögréss
// îñdîcåtör··]` is proof the string went through the formatter and `Progress
// indicator` is proof it did not — one assertion shape for every site, and
// one that cannot be satisfied by a literal that happens to match.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { pseudoAppLocale, PSEUDO_LOCALE } from '@codaco/app-i18n/locales';
import { createAppIntl } from '@codaco/app-i18n/messages';
import { AppI18nProvider } from '@codaco/app-i18n/react';

import { DndStoreProvider } from '../dnd/DndStoreProvider';
import {
  getDropTargetDescription,
  getKeyboardDragAnnouncement,
} from '../dnd/useAccessibilityAnnouncements';
import { useDragSource } from '../dnd/useDragSource';
import Field from '../form/Field/Field';
import InputField from '../form/fields/InputField';
import LikertScaleField from '../form/fields/LikertScale';
import VisualAnalogScaleField from '../form/fields/VisualAnalogScale';
import Form from '../form/Form';
import useFormStore from '../form/hooks/useFormStore';
import FormStoreProvider from '../form/store/formStoreProvider';
import SubmitButton from '../form/SubmitButton';
import ProgressBar from '../ProgressBar';
import { ResizableFlexPanel } from '../ResizableFlexPanel';

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
  it('names an unlabelled progress bar through the formatter', () => {
    render(
      <Pseudo>
        <ProgressBar percentProgress={40} />
      </Pseudo>,
    );

    const bar = screen.getByRole('progressbar');
    expect(wentThroughTheFormatter(bar.getAttribute('aria-label'))).toBe(true);
  });

  it('names an unlabelled panel separator through the formatter', () => {
    render(
      <Pseudo>
        <ResizableFlexPanel storageKey="localized-copy-test">
          <div>first</div>
          <div>second</div>
        </ResizableFlexPanel>
      </Pseudo>,
    );

    const handle = screen.getByRole('slider');
    expect(wentThroughTheFormatter(handle.getAttribute('aria-label'))).toBe(
      true,
    );
  });

  it('names the number steppers through the formatter', () => {
    const { container } = render(
      <Pseudo>
        <InputField type="number" name="count" value="1" step={1} />
      </Pseudo>,
    );

    const stepperLabels = Array.from(
      container.querySelectorAll('button[aria-label]'),
    ).map((button) => button.getAttribute('aria-label'));

    expect(stepperLabels.length).toBe(2);
    for (const label of stepperLabels) {
      expect(wentThroughTheFormatter(label)).toBe(true);
    }
  });

  it('names an unlabelled analog scale thumb through the formatter', () => {
    const { container } = render(
      <Pseudo>
        <VisualAnalogScaleField name="feeling" value={0.5} />
      </Pseudo>,
    );

    const thumb = container.querySelector('[aria-label]');
    expect(wentThroughTheFormatter(thumb?.getAttribute('aria-label'))).toBe(
      true,
    );
  });

  it('names an unlabelled Likert thumb, and its empty value, through the formatter', () => {
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

    const thumb = container.querySelector('[aria-label]');
    expect(wentThroughTheFormatter(thumb?.getAttribute('aria-label'))).toBe(
      true,
    );

    // Nothing is selected, so the announced value is the component's own
    // "No selection" rather than an option label.
    const slider = container.querySelector('[aria-valuetext]');
    expect(
      wentThroughTheFormatter(slider?.getAttribute('aria-valuetext')),
    ).toBe(true);
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
  // These are pure functions rather than components, so they take the host's
  // formatter as an argument. A catalog stands in for a translation here,
  // because the pseudo-locale wrapper lives in the provider.
  const TRANSLATED = 'ALGO EN OTRO IDIOMA';
  const translating = (id: string) =>
    createAppIntl({ locale: 'en', messages: { [id]: TRANSLATED } });

  it('formats a drop-target description through the supplied formatter', () => {
    expect(
      getDropTargetDescription(
        0,
        3,
        undefined,
        translating('frescoUi.dragAndDrop.dropTarget'),
      ),
    ).toBe(TRANSLATED);
  });

  it('formats a named drop-target description through the supplied formatter', () => {
    expect(
      getDropTargetDescription(
        0,
        3,
        'Bin',
        translating('frescoUi.dragAndDrop.namedDropTarget'),
      ),
    ).toBe(TRANSLATED);
  });

  it('formats a cancelled drag through the supplied formatter', () => {
    expect(
      getKeyboardDragAnnouncement(
        'cancel',
        undefined,
        translating('frescoUi.dragAndDrop.cancelled'),
      ),
    ).toBe(TRANSLATED);
  });

  it('formats a drop through the supplied formatter', () => {
    expect(
      getKeyboardDragAnnouncement(
        'drop',
        'somewhere',
        translating('frescoUi.dragAndDrop.dropped'),
      ),
    ).toBe(TRANSLATED);
  });

  it('formats a navigation with no description through the supplied formatter', () => {
    expect(
      getKeyboardDragAnnouncement(
        'navigate',
        undefined,
        translating('frescoUi.dragAndDrop.navigated'),
      ),
    ).toBe(TRANSLATED);
  });

  it('formats the start of a drag, and its instructions, through the supplied formatter', () => {
    const started = getKeyboardDragAnnouncement(
      'start',
      'a thing',
      translating('frescoUi.dragAndDrop.started'),
    );
    expect(started).toContain(TRANSLATED);

    const instructions = getKeyboardDragAnnouncement(
      'start',
      'a thing',
      translating('frescoUi.dragAndDrop.instructions'),
    );
    expect(instructions).toContain(TRANSLATED);
  });

  it('announces a keyboard grab through the formatter', async () => {
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
      expect(wentThroughTheFormatter(region?.textContent)).toBe(true);
    });

    // And abandoning it announces through the formatter too — its own
    // message, from its own call site.
    fireEvent.keyDown(source, { key: 'Escape' });

    await waitFor(() => {
      const region = document.querySelector('[role="status"]');
      expect(region?.textContent).not.toBe('');
      expect(wentThroughTheFormatter(region?.textContent)).toBe(true);
    });
  });
});
