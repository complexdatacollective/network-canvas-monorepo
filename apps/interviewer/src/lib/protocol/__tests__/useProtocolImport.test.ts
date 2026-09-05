import { act, render, renderHook, within } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import { interviewerProductionLocales } from '~/i18n/locales';
import { interviewerCatalogs } from '~/locales/catalogs';
import { renderedMessage } from '~/testUtils/renderedMessage';

import { useProtocolImport } from '../useProtocolImport';

const { dialogOpen, toastAdd } = vi.hoisted(() => ({
  dialogOpen: vi.fn(),
  toastAdd: vi.fn<(options: ToastCall) => void>(),
}));

vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: dialogOpen, closeDialog: vi.fn() }),
}));
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));
vi.mock('~/lib/db/api', () => ({
  updateSettings: vi.fn(),
}));
vi.mock('../importProtocol', () => ({
  importProtocolFromFile: vi.fn(() => new Promise(() => {})),
  peekProtocolName: vi.fn(async () => null),
}));

import { importProtocolFromFile } from '../importProtocol';

type ToastCall = {
  title?: ReactNode;
  description?: ReactNode;
  cancelLabel?: ReactNode;
  onCancel?: () => void;
};

describe('useProtocolImport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(importProtocolFromFile).mockImplementation(
      () => new Promise(() => {}),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('shows Spanish guidance for an unreadable file and allows reselection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = new File([new Uint8Array()], 'study.netcanvas');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValueOnce(
      new DOMException('The file is no longer readable.', 'NotReadableError'),
    );
    const onInstalled = vi.fn();
    const { result } = renderHook(() => useProtocolImport({ onInstalled }));
    let outcomes: PromiseSettledResult<void>[] = [];

    await act(async () => {
      outcomes = await Promise.allSettled([
        result.current.startImport({ source: 'file', file, label: file.name }),
      ]);
    });

    const toast = toastAdd.mock.lastCall?.[0];
    const { container } = render(
      createElement(AppI18nProvider, {
        locale: 'es',
        locales: interviewerProductionLocales,
        messages: interviewerCatalogs.es,
        manageDocument: false,
        // oxlint-disable-next-line react/no-children-prop -- The provider requires children in its props; this .ts hook test uses createElement rather than JSX.
        children: createElement(
          Fragment,
          null,
          createElement('h2', null, toast?.title),
          createElement('p', null, toast?.description),
        ),
      }),
    );
    expect(
      within(container).getByText(
        'No se pudo leer este archivo de protocolo. Comprueba que siga disponible y selecciónalo de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(outcomes[0]?.status).toBe('fulfilled');
    expect(result.current.pendingImports).toEqual([]);
    expect(importProtocolFromFile).not.toHaveBeenCalled();
    expect(onInstalled).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.startImport({
        source: 'file',
        file,
        label: file.name,
      });
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(result.current.pendingImports).toHaveLength(1);
    expect(importProtocolFromFile).toHaveBeenCalledTimes(1);
  });

  it('shows the pending card immediately but delays the import work', async () => {
    const { result } = renderHook(() =>
      useProtocolImport({ onInstalled: () => {} }),
    );

    await act(async () => {
      await result.current.startImport({
        source: 'file',
        file: new File([new Uint8Array()], 'study.netcanvas'),
        label: 'study.netcanvas',
      });
    });

    expect(result.current.pendingImports).toHaveLength(1);
    expect(importProtocolFromFile).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(importProtocolFromFile).toHaveBeenCalledTimes(1);
  });

  it('adds a details action to validation failure toasts', async () => {
    vi.mocked(importProtocolFromFile).mockResolvedValueOnce({
      success: false,
      error: 'validation-failed',
      message: 'Protocol failed schema validation.',
      localizedMessage: {
        descriptor: {
          id: 'interviewer.protocolImport.invalidProtocol',
          defaultMessage: 'Protocol failed schema validation.',
        },
      },
      issues: [
        {
          path: 'stages.0.label',
          message: 'Required',
        },
      ],
    });

    const { result } = renderHook(() =>
      useProtocolImport({ onInstalled: () => {} }),
    );

    await act(async () => {
      await result.current.startImport({
        source: 'file',
        file: new File([new Uint8Array()], 'study.netcanvas'),
        label: 'study.netcanvas',
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: renderedMessage('Import failed'),
        description: renderedMessage('Protocol failed schema validation.'),
        variant: 'destructive',
        cancelLabel: renderedMessage('View details'),
      }),
    );

    const toastCall = toastAdd.mock.calls[0]?.[0] as ToastCall | undefined;
    expect(toastCall?.onCancel).toEqual(expect.any(Function));

    toastCall?.onCancel?.();

    expect(dialogOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'custom',
        title: renderedMessage('Protocol validation failed'),
        description: renderedMessage(
          'Details of the validation errors can be found below:',
        ),
        intent: 'destructive',
      }),
    );
  });
});
