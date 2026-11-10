import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { setActiveProtocol } from '~/ducks/modules/activeProtocol';
import { rootReducer } from '~/ducks/modules/root';
import { getTranslationGroups } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';

import TranslationTable from '../TranslationTable';
import { largeTranslationProtocol } from './largeTranslationProtocol';

const drewCell = vi.hoisted(() => vi.fn());

// Counts every cell the table draws, so a test can say how many a change draws.
vi.mock('../TranslationCell', async (importOriginal) => {
  const original = await importOriginal<typeof import('../TranslationCell')>();
  const Counted = (props: ComponentProps<typeof original.default>) => {
    drewCell();
    return <original.default {...props} />;
  };
  return { ...original, default: Counted };
});

const STAGES = 400;
const SCREEN_HEIGHT = 600;
// What the table expects a stage to take: its heading and four rows.
const STAGE_HEIGHT = 40 + 4 * 96;

const ONLY_ENGLISH =
  'This is the only translation, and it is in English. Add a translation in another language before clearing it.';

const renderTable = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(largeTranslationProtocol(STAGES)));
  const onSaved = vi.fn();
  render(
    <Provider store={store}>
      <FormStoreProvider>
        <TranslationTable onSaved={onSaved} onCancel={vi.fn()} />
      </FormStoreProvider>
    </Provider>,
  );
  return { store, onSaved, user: userEvent.setup() };
};

// jsdom lays nothing out, so the scroller has no height unless it is given one.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(
    function clientHeight(this: Element) {
      return this.tagName === 'SECTION' ? SCREEN_HEIGHT : 0;
    },
  );
  drewCell.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const scroller = () => {
  const element = screen.getByRole('table').parentElement;
  if (!element) throw new Error('The table has no scroller');
  return element;
};

/** Scrolls the table's scroller, and waits for the rows to follow. */
const scrollTo = async (top: number) => {
  await act(async () => {
    scroller().scrollTop = top;
    fireEvent.scroll(scroller());
  });
};

/** Focus leaves the table, so no row is held for it. */
const leaveTable = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(document.body);
  await act(async () => {});
};

/** The scroll position that brings stage `number` (counted from 1) to the top. */
const stageTop = (number: number) => (number - 1) * STAGE_HEIGHT;

const drawnRows = () =>
  screen
    .getAllByRole('rowheader')
    .filter((header) => header.getAttribute('scope') === 'row');

const stageHeading = (number: number) =>
  screen.queryByRole('rowheader', { name: new RegExp(`^Stage ${number} ·`) });

const rowNumbers = () =>
  Array.from(document.querySelectorAll('[data-row]'), (element) =>
    Number(element.getAttribute('data-row')),
  );

const titleCell = (stage: number, language: string) =>
  screen.queryByRole('textbox', {
    name: new RegExp(`^Stage ${stage} .*Page heading ${language}$`),
  });

describe('TranslationTable with a large protocol', () => {
  it('draws only the rows near the screen, whatever the protocol holds', () => {
    const { store } = renderTable();
    const groups = getTranslationGroups(store.getState());
    const rows = groups.reduce((sum, group) => sum + group.rows.length, 0);
    expect(rows).toBeGreaterThan(4 * STAGES);

    expect(drawnRows().length).toBeGreaterThan(0);
    expect(drawnRows().length).toBeLessThan(40);
    expect(
      document.querySelectorAll('td[data-field-path]').length,
    ).toBeLessThan(40 * 4);
    // A row's place in the whole table is still said, so a screen reader
    // knows how much more there is.
    expect(screen.getByRole('table')).toHaveAttribute(
      'aria-rowcount',
      String(rows + groups.length + 1),
    );
    expect(stageHeading(1)).toBeInTheDocument();
    expect(stageHeading(STAGES)).not.toBeInTheDocument();
  });

  it('draws the rows it is scrolled to, and gives up those it has scrolled past', async () => {
    renderTable();
    expect(stageHeading(1)).toBeInTheDocument();

    await scrollTo(stageTop(200));

    expect(stageHeading(200)).toBeInTheDocument();
    expect(stageHeading(1)).not.toBeInTheDocument();
    expect(drawnRows().length).toBeLessThan(40);
    // The rows keep their numbers in the whole table.
    const firstRow = drawnRows()[0]?.closest('tr');
    expect(Number(firstRow?.getAttribute('aria-rowindex'))).toBeGreaterThan(
      500,
    );
  });

  it('keeps what was typed into a row that is scrolled away and back', async () => {
    const { store, onSaved, user } = renderTable();
    await scrollTo(stageTop(8));

    // Stage 8's heading has no French translation yet.
    const french = titleCell(8, 'French');
    if (!french) throw new Error('No cell for stage 8');
    await user.type(french, 'Bonjour');
    await user.tab();
    await leaveTable(user);

    await scrollTo(stageTop(300));
    expect(titleCell(8, 'French')).not.toBeInTheDocument();

    await scrollTo(stageTop(8));
    expect(titleCell(8, 'French')).toHaveValue('Bonjour');

    // And a row that is not drawn when the table is saved is saved with it.
    await scrollTo(stageTop(300));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const stage = getProtocol(store.getState())?.stages[7];
    expect(stage && 'title' in stage ? stage.title : undefined).toMatchObject({
      fr: 'Bonjour',
    });
  });

  it('keeps the reason a cell cannot be saved when it is scrolled away and back', async () => {
    const { user } = renderTable();
    await scrollTo(stageTop(4));

    // Stage 4's heading is in English only.
    const english = titleCell(4, 'English');
    if (!english) throw new Error('No cell for stage 4');
    await user.clear(english);
    await user.tab();
    expect(await screen.findByText(ONLY_ENGLISH)).toBeInTheDocument();
    await leaveTable(user);

    await scrollTo(stageTop(300));
    expect(titleCell(4, 'English')).not.toBeInTheDocument();

    await scrollTo(stageTop(4));
    expect(screen.getByText(ONLY_ENGLISH)).toBeInTheDocument();
    expect(titleCell(4, 'English')).toHaveAttribute('aria-invalid', 'true');
  });

  it('takes focus to the cell a refused save names, though its row is not drawn', async () => {
    const { store, onSaved, user } = renderTable();
    await scrollTo(stageTop(4));

    const english = titleCell(4, 'English');
    if (!english) throw new Error('No cell for stage 4');
    await user.clear(english);
    await user.tab();
    await leaveTable(user);
    await scrollTo(stageTop(350));
    expect(titleCell(4, 'English')).not.toBeInTheDocument();
    const before = getProtocol(store.getState());

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(titleCell(4, 'English')).toHaveFocus());
    expect(getProtocol(store.getState())).toBe(before);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByText(ONLY_ENGLISH)).toBeInTheDocument();
  });

  it('finds a text by search though its row is not drawn', async () => {
    const { user } = renderTable();
    expect(stageHeading(251)).not.toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search translations' }),
      'Section 250',
    );

    // Every text under the stage that names the section.
    await waitFor(() => expect(stageHeading(251)).toBeInTheDocument());
    expect(drawnRows()).toHaveLength(4);
    expect(screen.getByText(/^Showing 4 of /)).toBeInTheDocument();
  });

  it('moves to the next row with Enter from the last row drawn', async () => {
    const { user } = renderTable();

    // Scrolled until the last row drawn is one with a plain text cell, which
    // takes focus without an editor opening.
    let last: HTMLElement | undefined;
    for (let step = 0; step < 20 && last === undefined; step += 1) {
      await scrollTo(stageTop(20) + step * 50);
      const lastRow = Math.max(...rowNumbers());
      const candidate = document.querySelector<HTMLElement>(
        `textarea[data-row="${lastRow}"][data-col="0"]`,
      );
      if (candidate) last = candidate;
    }
    if (!last) throw new Error('The last row drawn is never a plain text');
    const lastRow = Number(last.getAttribute('data-row'));

    await user.click(last);
    await user.keyboard('{Enter}');

    const focusedRow = document.activeElement?.closest('tr');
    expect(focusedRow?.querySelector('th[scope="row"]')?.id).toMatch(
      new RegExp(`-row-${lastRow + 1}$`),
    );
    expect(Math.max(...rowNumbers())).toBeGreaterThanOrEqual(lastRow + 2);
  });

  it('draws no cell again for a search keystroke that leaves the rows as they were', async () => {
    const { user } = renderTable();
    const search = screen.getByRole('searchbox', {
      name: 'Search translations',
    });
    // Every row has an English text, and every English text names its section.
    await user.type(search, 'Se');
    await waitFor(() =>
      expect(screen.getByText(/^Showing [\d,]+ of /)).toBeInTheDocument(),
    );
    drewCell.mockClear();

    await user.type(search, 'c');
    await waitFor(() => expect(search).toHaveValue('Sec'));
    // The table follows the box a moment behind it.
    await act(async () => {});

    expect(drewCell).not.toHaveBeenCalled();
  });
});
