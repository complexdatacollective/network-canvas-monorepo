import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';

import Form from '../../Form';
import Field from '../Field';

/**
 * Validate-on-blur and the overlays a field's own controls open.
 *
 * React delivers a portal's events to the tree that RENDERED it rather than
 * the one that contains it, so a control that opens a picker hands its field
 * every focus move made inside that picker — including the one that opened it.
 * The field then validated while the researcher was on their way to answering
 * it: Architect's "assign additional attributes" row went red the moment its
 * own attribute picker opened, and the re-render that followed could swallow
 * the click that was about to fill it in.
 */

/**
 * A rule the picked value breaks, so the field is both DIRTY and invalid — the
 * state a half-finished row is in while the researcher is still filling it.
 * fresco-ui never shows a field its errors before it has been interacted with,
 * so a rule an untouched field breaks would prove nothing either way.
 */
const TOO_SHORT_MESSAGE = 'Too short. Enter at least 10 characters.';

/** A control whose button opens a portalled picker, as a real one does. */
function PickerControl({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {value ? 'Change attribute' : 'Select attribute'}
      </button>
      {open &&
        createPortal(
          <div role="dialog" aria-label="Attribute library">
            <input aria-label="Find an attribute" autoFocus />
            <button
              type="button"
              onClick={() => {
                onChange?.('close');
                setOpen(false);
              }}
            >
              Pick
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

const setup = () =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <Field
        name="variable"
        label="Attribute"
        component={PickerControl}
        minLength={10}
      />
      <button type="button">Elsewhere</button>
    </Form>,
  );

/** Opens the picker, picks, and closes it — the field is now dirty. */
const pick = async () => {
  const trigger = screen.getByRole('button', { name: 'Select attribute' });
  trigger.focus();
  trigger.click();
  await screen.findByRole('dialog', { name: 'Attribute library' });
  screen.getByRole('button', { name: 'Pick' }).click();
  await screen.findByRole('button', { name: 'Change attribute' });
};

describe('a field whose control opens an overlay', () => {
  it('does not validate while the researcher is inside it', async () => {
    setup();
    await pick();

    const trigger = screen.getByRole('button', { name: 'Change attribute' });
    trigger.focus();
    trigger.click();

    // Focus is now in the picker's search box, which is where the researcher
    // is — not somewhere they went instead of finishing.
    await screen.findByRole('dialog', { name: 'Attribute library' });
    await waitFor(() =>
      expect(screen.queryByText(TOO_SHORT_MESSAGE)).toBeNull(),
    );

    // Moving around inside the picker is not leaving the field either.
    screen.getByRole('button', { name: 'Pick' }).focus();
    await waitFor(() =>
      expect(screen.queryByText(TOO_SHORT_MESSAGE)).toBeNull(),
    );
  });

  it('still validates when focus really leaves the field', async () => {
    setup();
    await pick();

    screen.getByRole('button', { name: 'Change attribute' }).focus();
    screen.getByRole('button', { name: 'Elsewhere' }).focus();

    expect(await screen.findByText(TOO_SHORT_MESSAGE)).toBeInTheDocument();
  });
});
