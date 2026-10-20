import { describe, expect, it, vi } from 'vitest';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';

import { showProtocolOpenResultDialog } from '../protocolOpenDialogs';

type OpenDialog = DialogContextType['openDialog'];

/** An `openDialog` whose dialog stays open until `dismiss` is called. */
const heldDialog = () => {
  let dismiss: () => void = () => {};
  const openDialog = vi.fn(
    () =>
      new Promise<true>((resolve) => {
        dismiss = () => resolve(true);
      }),
  );
  return {
    openDialog: openDialog as unknown as OpenDialog,
    shown: openDialog,
    dismiss: () => dismiss(),
  };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('showProtocolOpenResultDialog', () => {
  it.each([
    {
      name: 'an error',
      result: { status: 'error' as const, title: 'Not found', message: 'Gone' },
    },
    {
      name: 'a validation failure',
      result: { status: 'validation-error' as const, message: 'Invalid' },
    },
    {
      name: 'a protocol newer than this app',
      result: {
        status: 'app-upgrade-required' as const,
        protocolSchemaVersion: 9,
      },
    },
  ])(
    'resolves only once the dialog for $name is dismissed',
    async ({ result }) => {
      const { openDialog, shown, dismiss } = heldDialog();
      let settled = false;
      const done = showProtocolOpenResultDialog({ result, openDialog }).then(
        () => {
          settled = true;
        },
      );

      await flush();
      expect(shown).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      dismiss();
      await done;
      expect(settled).toBe(true);
    },
  );
});
