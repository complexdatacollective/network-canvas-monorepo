import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { ContractProvider } from '../../contract/context';
import type { FinishHandler, InterviewPayload } from '../../contract/types';
import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { store as createStore } from '../../store/store';
import { SyncFlushProvider } from '../../store/SyncFlushContext';
import FinishSession from '../FinishSession';

const payload = {
  session: {
    id: 'finish-locale-session',
    startTime: '2026-09-06T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-09-06T00:00:00.000Z',
    network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
  },
  protocol: {
    id: 'finish-locale-protocol',
    hash: 'literal-original-hash',
    importedAt: '2026-09-06T00:00:00.000Z',
    name: 'Literal protocol name',
    schemaVersion: 8,
    codebook: { ego: { variables: {} }, node: {}, edge: {} },
    assets: [],
    stages: [],
  },
} satisfies InterviewPayload;

const english =
  'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.';
const spanish =
  'No se ha podido finalizar la entrevista. Inténtalo de nuevo. Si el problema continúa, ponte en contacto con la persona que organiza el estudio.';
const diagnostic =
  'private host failure details that must stay out of the dialog';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

function makeView(flush: () => Promise<void>, onFinish: FinishHandler) {
  const store = createStore(payload, { onSync: () => Promise.resolve() });
  return (locale: string) => (
    <AnimationProvider disableAnimations reducedMotion="always">
      <InterviewI18nProvider requestedLocale={locale}>
        <Provider store={store}>
          <ContractProvider
            onFinish={onFinish}
            onRequestAsset={() => Promise.resolve('')}
          >
            <SyncFlushProvider flush={flush}>
              <DialogProvider>
                <FinishSession />
              </DialogProvider>
            </SyncFlushProvider>
          </ContractProvider>
        </Provider>
      </InterviewI18nProvider>
    </AnimationProvider>
  );
}

describe('FinishSession localized recoverable failures', () => {
  it.each(['flush', 'finish'] as const)(
    'keeps a %s failure in the real dialog, changes its language without resubmission, and retries in order',
    async (failure) => {
      const order: string[] = [];
      const abortStatesAtFinish: boolean[] = [];
      let rejected = false;
      const flush = vi.fn(async () => {
        order.push('flush');
        if (failure === 'flush' && !rejected) {
          rejected = true;
          throw new Error(diagnostic);
        }
      });
      const finish = vi.fn<FinishHandler>(async (_id, signal) => {
        order.push('finish');
        abortStatesAtFinish.push(signal.aborted);
        if (failure === 'finish' && !rejected) {
          rejected = true;
          throw new Error(diagnostic);
        }
      });
      const view = makeView(flush, finish);
      const { rerender } = render(view('en'));
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Finish' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(
        within(dialog).getByRole('button', {
          name: 'Finish Interview',
        }),
      );
      expect(
        await within(dialog).findByText(english, { exact: true }),
      ).toBeVisible();
      expect(within(dialog).queryByText(diagnostic)).not.toBeInTheDocument();
      expect(order).toEqual(
        failure === 'flush' ? ['flush'] : ['flush', 'finish'],
      );
      expect(finish).toHaveBeenCalledTimes(failure === 'flush' ? 0 : 1);

      rerender(view('es'));
      expect(within(dialog).getByText(spanish, { exact: true })).toBeVisible();
      expect(within(dialog).queryByText(english)).not.toBeInTheDocument();
      const retry = within(dialog).getByRole('button', {
        name: 'Finalizar entrevista',
      });
      expect(retry).toBeEnabled();
      expect(flush).toHaveBeenCalledTimes(1);
      expect(finish).toHaveBeenCalledTimes(failure === 'flush' ? 0 : 1);

      rerender(view('en-GB'));
      expect(
        within(dialog).getByText(
          'The interview could not be finished. Please try again. If the problem continues, contact the study organiser.',
          { exact: true },
        ),
      ).toBeVisible();
      rerender(view('es'));
      await user.click(retry);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(order).toEqual(
        failure === 'flush'
          ? ['flush', 'flush', 'finish']
          : ['flush', 'finish', 'flush', 'finish'],
      );
      expect(finish).toHaveBeenLastCalledWith(
        'finish-locale-session',
        expect.any(AbortSignal),
      );
      expect(abortStatesAtFinish).toEqual(
        failure === 'flush' ? [false] : [false, false],
      );
    },
  );

  it('still passes the cancellation signal to a pending host finish', async () => {
    const flush = vi.fn(() => Promise.resolve());
    const finish = vi.fn<FinishHandler>(
      (_id, signal) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        }),
    );
    render(makeView(flush, finish)('es'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Finalizar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Finalizar entrevista',
      }),
    );
    await waitFor(() => expect(finish).toHaveBeenCalledTimes(1));
    const signal = finish.mock.lastCall?.[1];
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    expect(flush).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(signal?.aborted).toBe(true);
    expect(finish).toHaveBeenCalledTimes(1);
  });
});
