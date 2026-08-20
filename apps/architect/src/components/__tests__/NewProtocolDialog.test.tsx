import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_NAME_MAX_LENGTH,
  PROTOCOL_NAME_TOO_LONG_MESSAGE,
} from '~/config';

import NewProtocolDialog from '../NewProtocolDialog';

// 1 grapheme, 8 UTF-16 code units. fresco-ui's built-in `maxLength` validator
// measures `value.length`, so a cap wired to it would reject 13 of these while
// the editor's own control accepts 100 — a name a researcher could rename INTO
// but never create. These tests pin the two surfaces to one unit.
const FAMILY = '🧑‍🤝‍🧑';

const renderDialog = () => {
  const onSubmit = vi.fn();
  render(<NewProtocolDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />);
  return onSubmit;
};

const nameInput = () =>
  screen.getByRole('textbox', { name: /Protocol Name/i }) as HTMLInputElement;

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create Protocol' }));

describe('NewProtocolDialog', () => {
  it('states the limit before an error can happen', () => {
    renderDialog();
    expect(
      screen.getByText(
        `Use a short, recognizable name of up to ${PROTOCOL_NAME_MAX_LENGTH} characters. Include a version number or date when it helps distinguish drafts, but avoid long project notes.`,
      ),
    ).toBeInTheDocument();
  });

  it('lets an RTL name set its own base direction', () => {
    renderDialog();
    // `Field` strips validation props but forwards everything else to the
    // control, so this reaches the real <input>.
    expect(nameInput()).toHaveAttribute('dir', 'auto');
  });

  it('blocks creation of an over-limit name and explains why', async () => {
    const onSubmit = renderDialog();

    fireEvent.change(nameInput(), {
      target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH + 1) },
    });
    submit();

    expect(
      await screen.findByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('leaves an over-limit paste intact instead of truncating it', async () => {
    renderDialog();

    fireEvent.change(nameInput(), { target: { value: 'B'.repeat(300) } });
    submit();

    // A soft cap, because this surface has a submit gate: the researcher's
    // clipboard content stays on screen to be edited down, and nothing has been
    // silently cut to 100 behind their back.
    expect(
      await screen.findByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).toBeVisible();
    expect(nameInput()).toHaveValue('B'.repeat(300));
  });

  it('accepts a name at the limit', async () => {
    const onSubmit = renderDialog();

    fireEvent.change(nameInput(), {
      target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH) },
    });
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH),
      }),
    );
  });

  it('counts emoji the way the editor does, so a name it accepts can be created', async () => {
    const onSubmit = renderDialog();
    const atLimit = FAMILY.repeat(PROTOCOL_NAME_MAX_LENGTH);
    // 800 UTF-16 code units for 100 user-perceived characters. A cap wired to
    // fresco-ui's built-in `maxLength` would refuse this at the 13th emoji.
    expect(atLimit.length).toBe(PROTOCOL_NAME_MAX_LENGTH * 8);

    fireEvent.change(nameInput(), { target: { value: atLimit } });
    submit();

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: atLimit }),
    );
    expect(
      screen.queryByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).not.toBeInTheDocument();

    // The other half of the same claim, and the half that gives this test
    // teeth: acceptance alone also holds when there is no cap at all, so the
    // 101st emoji has to be refused for "counts in graphemes" to mean anything.
    fireEvent.change(nameInput(), { target: { value: atLimit + FAMILY } });
    submit();

    expect(
      await screen.findByText(PROTOCOL_NAME_TOO_LONG_MESSAGE),
    ).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('still requires a name', async () => {
    const onSubmit = renderDialog();
    submit();

    expect(
      await screen.findByText('Protocol name is required'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
