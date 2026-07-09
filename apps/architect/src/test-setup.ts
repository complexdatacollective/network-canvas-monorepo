import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';

const dialogMocks = vi.hoisted(() => ({
  closeAllDialogs: vi.fn(),
  closeDialog: vi.fn(),
  confirm: vi.fn(),
  openDialog: vi.fn(),
}));

declare global {
  var __architectDialogMocks: typeof dialogMocks;
}

globalThis.__architectDialogMocks = dialogMocks;

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => dialogMocks,
}));

beforeEach(() => {
  dialogMocks.closeAllDialogs.mockReset();
  dialogMocks.closeDialog.mockReset();
  dialogMocks.closeDialog.mockResolvedValue(undefined);
  dialogMocks.openDialog.mockReset();
  dialogMocks.openDialog.mockResolvedValue(true);
  dialogMocks.confirm.mockReset();
  dialogMocks.confirm.mockImplementation(
    async (options: Parameters<DialogContextType['confirm']>[0]) => {
      await options.onConfirm(new AbortController().signal);
      return true;
    },
  );
});
