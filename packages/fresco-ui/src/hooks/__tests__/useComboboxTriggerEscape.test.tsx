import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectSourceFiles } from '@codaco/app-i18n/catalog-guards';

import Dialog from '../../dialogs/Dialog';
import ComboboxField from '../../form/fields/Combobox/Combobox';
import IconPicker from '../../form/fields/IconPicker';
import LocaleSwitcher from '../../navigation/LocaleSwitcher';
import { PortalContainerProvider } from '../../PortalContainer';

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 400));
});

/**
 * Every combobox whose popup opens from a `Combobox.Trigger`, each inside a
 * dialog. Escape pressed while the trigger holds focus and the popup is open
 * used to reach the dialog's own dismiss listener and close the dialog, popup
 * and all. See `useComboboxTriggerEscape`.
 */
const comboboxes: { name: string; trigger: RegExp; control: ReactNode }[] = [
  {
    name: 'ComboboxField',
    trigger: /^Translators$/,
    control: (
      <ComboboxField
        name="translators"
        aria-label="Translators"
        options={[
          { value: 'p1', label: 'Alice Johnson' },
          { value: 'p2', label: 'Bob Smith' },
        ]}
        value={[]}
      />
    ),
  },
  {
    name: 'IconPicker',
    trigger: /^Node icon$/,
    control: <IconPicker name="icon" aria-label="Node icon" />,
  },
  {
    name: 'LocaleSwitcher',
    trigger: /^Interface language/,
    control: (
      <LocaleSwitcher
        options={[
          { locale: 'en', label: 'English', direction: 'ltr' },
          { locale: 'es', label: 'Español', direction: 'ltr' },
        ]}
        value={null}
        automaticLocale="en"
        onChange={() => undefined}
        searchable
      />
    ),
  },
];

describe.each(comboboxes)('$name inside a dialog', ({ trigger, control }) => {
  it('closes its own popup, not the dialog, on Escape from its trigger', async () => {
    const user = userEvent.setup();
    const closeDialog = vi.fn();

    render(
      <PortalContainerProvider>
        <Dialog open title="Edit this label" closeDialog={closeDialog}>
          {control}
        </Dialog>
      </PortalContainerProvider>,
    );

    const button = await screen.findByRole('combobox', { name: trigger });
    await user.click(button);
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-expanded', 'true'),
    );

    // Base UI moves focus into the popup on the next frame; wait for it, so
    // focusing the trigger below is not undone by that queued move.
    const popup = document.getElementById(
      button.getAttribute('aria-controls') ?? '',
    );
    await waitFor(() =>
      expect(popup).toContainElement(
        document.activeElement as HTMLElement | null,
      ),
    );

    // Where Shift+Tab out of the popup puts focus, with the popup still open.
    button.focus();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(button).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(closeDialog).not.toHaveBeenCalled();

    // With nothing open in front of it, Escape belongs to the dialog again.
    await user.keyboard('{Escape}');
    expect(closeDialog).toHaveBeenCalledTimes(1);
  });
});

const src = join(import.meta.dirname, '../..');

describe('a Combobox.Trigger', () => {
  /**
   * Base UI gives `Combobox.Trigger` no Escape handling of its own, so one
   * that skips `useComboboxTriggerEscape` brings the bug above back. A file
   * may render more than one trigger (`LocaleSwitcher` picks one by
   * `display`), so the counts have to match, not just the presence.
   */
  it('is wired to useComboboxTriggerEscape wherever one is rendered', () => {
    const count = (text: string, needle: string) =>
      text.split(needle).length - 1;

    const offenders = collectSourceFiles(src)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        const triggers = count(text, '<Combobox.Trigger');
        return (
          triggers > 0 &&
          (!text.includes('useComboboxTriggerEscape(') ||
            count(text, 'onKeyDown={onTriggerKeyDown}') !== triggers)
        );
      })
      .map((file) => relative(src, file));

    expect(offenders).toEqual([]);
  });
});
