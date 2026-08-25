import { act, render, screen, waitFor } from '@testing-library/react';
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

/**
 * A control whose button opens a portalled picker, as a real one does.
 *
 * Two knobs, each standing for a real arrangement:
 *
 * - `surfaceRole` is what the surface announces itself as. `''` renders a
 *   portal carrying no overlay role at all, which a library is free to do —
 *   and which is how the field's deferral is shown to rest on the PORTAL
 *   boundary rather than on a recognised role.
 * - `quiet` keeps the OPENING focus move inside the control, exactly as
 *   Architect's attribute picker does. Without a role to recognise, that move
 *   is the field's own control losing focus and would blur it — so a surface
 *   that spells itself differently has to keep its own opening quiet, and the
 *   moves made INSIDE it are what the field must still defer on.
 */
function PickerControl({
  value,
  onChange,
  surfaceRole = 'dialog',
  quiet = false,
}: {
  value?: string;
  onChange?: (value: string) => void;
  surfaceRole?: string;
  quiet?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onBlur={(event) => {
          if (quiet && open) event.stopPropagation();
        }}
      >
        <button type="button" onClick={() => setOpen(true)}>
          {value ? 'Change attribute' : 'Select attribute'}
        </button>
      </div>
      {open &&
        createPortal(
          <div
            {...(surfaceRole === '' ? {} : { role: surfaceRole })}
            aria-label="Attribute library"
          >
            <input aria-label="Find an attribute" autoFocus />
            <button
              type="button"
              onClick={(event) => {
                onChange?.('close');
                setOpen(false);
                // A real popup emits a final focusout as it unmounts, with
                // nothing to hand focus to. React has not re-rendered yet, so
                // the surface is still mounted and jsdom sees the same
                // answered-and-left boundary a browser produces.
                event.currentTarget.blur();
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

const setup = (controlProps: Record<string, unknown> = {}) =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <Field
        name="variable"
        label="Attribute"
        component={PickerControl}
        minLength={10}
        {...controlProps}
      />
      <button type="button">Elsewhere</button>
    </Form>,
  );

/**
 * Let anything the last interaction started finish.
 *
 * Every assertion here that something did NOT happen needs this: validation is
 * asynchronous, so querying immediately — or through a `waitFor` whose first
 * attempt succeeds — passes against a field that validates a tick later, which
 * is the failure these tests exist to catch.
 */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

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
    await settle();
    expect(screen.queryByText(TOO_SHORT_MESSAGE)).toBeNull();

    // Moving around inside the picker is not leaving the field either.
    screen.getByRole('button', { name: 'Pick' }).focus();
    await settle();
    expect(screen.queryByText(TOO_SHORT_MESSAGE)).toBeNull();
  });

  it('still validates when focus really leaves the field', async () => {
    setup();
    await pick();

    screen.getByRole('button', { name: 'Change attribute' }).focus();
    screen.getByRole('button', { name: 'Elsewhere' }).focus();

    expect(await screen.findByText(TOO_SHORT_MESSAGE)).toBeInTheDocument();
  });

  it('defers on a portalled surface that announces no overlay role', async () => {
    // Nothing here is a `dialog`, a `menu` or a `listbox` — just a portal —
    // and it is still the researcher's place to be. Recognising a surface by
    // role alone would validate the field the moment they moved around inside
    // one that spells itself differently, which is the same defect in a
    // different suit.
    setup({ surfaceRole: '', quiet: true });

    // Answer it once, so the field is dirty and has something to say.
    const trigger = screen.getByRole('button', { name: 'Select attribute' });
    trigger.focus();
    trigger.click();
    await screen.findByLabelText('Find an attribute');
    screen.getByRole('button', { name: 'Pick' }).click();
    await screen.findByRole('button', { name: 'Change attribute' });
    expect(screen.queryByText(TOO_SHORT_MESSAGE)).toBeNull();

    // Back in, and moving from one part of the surface to another.
    const reopen = screen.getByRole('button', { name: 'Change attribute' });
    reopen.focus();
    reopen.click();
    const search = await screen.findByLabelText('Find an attribute');
    await waitFor(() => expect(search).toHaveFocus());
    screen.getByRole('button', { name: 'Pick' }).focus();

    // Settled, not merely early: validation is asynchronous, so an absence
    // asserted straight away would pass against a field that validated a tick
    // later. The flush is what makes the silence below an answer.
    await settle();
    expect(screen.queryByText(TOO_SHORT_MESSAGE)).toBeNull();
  });

  it('validates when focus goes straight from the overlay to another control', async () => {
    // The other way of leaving, and the one a deferral resting on "the event
    // came from a portal" swallowed whole: focus never returns to the field,
    // so no later blur repairs the omission and a dirty, invalid field stayed
    // unvalidated until the save.
    setup();
    await pick();

    const trigger = screen.getByRole('button', { name: 'Change attribute' });
    trigger.focus();
    trigger.click();
    const search = await screen.findByLabelText('Find an attribute');
    await waitFor(() => expect(search).toHaveFocus());

    screen.getByRole('button', { name: 'Elsewhere' }).focus();

    expect(await screen.findByText(TOO_SHORT_MESSAGE)).toBeInTheDocument();
  });

  it('validates on that move out of a surface announcing no role either', async () => {
    setup({ surfaceRole: '', quiet: true });

    const trigger = screen.getByRole('button', { name: 'Select attribute' });
    trigger.focus();
    trigger.click();
    await screen.findByLabelText('Find an attribute');
    screen.getByRole('button', { name: 'Pick' }).click();
    await screen.findByRole('button', { name: 'Change attribute' });

    const reopen = screen.getByRole('button', { name: 'Change attribute' });
    reopen.focus();
    reopen.click();
    const search = await screen.findByLabelText('Find an attribute');
    await waitFor(() => expect(search).toHaveFocus());

    screen.getByRole('button', { name: 'Elsewhere' }).focus();

    expect(await screen.findByText(TOO_SHORT_MESSAGE)).toBeInTheDocument();
  });

  /**
   * The overlay closing is the researcher LEAVING, and the only focusout the
   * field will ever get for it: focus was released rather than handed
   * anywhere, so nothing will later blur from inside the field. Deferring this
   * one alongside the moves made inside the overlay would leave a field the
   * researcher answered and walked away from permanently unblurred — never
   * showing what it thinks of the value they committed until the save.
   */
  it('validates once the overlay closes having released focus', async () => {
    setup();

    const trigger = screen.getByRole('button', { name: 'Select attribute' });
    trigger.focus();
    trigger.click();
    await screen.findByRole('dialog', { name: 'Attribute library' });

    const confirm = screen.getByRole('button', { name: 'Pick' });
    confirm.focus();
    confirm.click();

    await screen.findByRole('button', { name: 'Change attribute' });
    expect(await screen.findByText(TOO_SHORT_MESSAGE)).toBeInTheDocument();
  });
});
