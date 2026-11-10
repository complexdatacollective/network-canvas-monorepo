import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { CurrentProtocol } from '@codaco/protocol-validation';
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

const renderTable = (
  protocol: CurrentProtocol = largeTranslationProtocol(STAGES),
) => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(setActiveProtocol(protocol));
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

/**
 * A ResizeObserver that tells nothing until a test says a row has a height, as
 * a browser does once it has laid the row out. jsdom lays nothing out.
 */
class ControlledResizeObserver implements ResizeObserver {
  static all = new Set<ControlledResizeObserver>();
  private targets = new Set<Element>();

  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ControlledResizeObserver.all.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    ControlledResizeObserver.all.delete(this);
  }

  static notify(target: Element, height: number) {
    for (const observer of ControlledResizeObserver.all) {
      if (!observer.targets.has(target)) continue;
      observer.callback(
        [
          {
            target,
            borderBoxSize: [{ blockSize: height, inlineSize: 800 }],
            contentBoxSize: [{ blockSize: height, inlineSize: 800 }],
            contentRect: new DOMRect(0, 0, 800, height),
            devicePixelContentBoxSize: [],
          },
        ],
        observer,
      );
    }
  }
}

/** Tells the table that a drawn row has been laid out at `height`. */
const laidOutAt = (row: Element, height: number) =>
  act(() => ControlledResizeObserver.notify(row, height));

// jsdom lays nothing out, so the scroller has no height unless it is given one.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(
    function clientHeight(this: Element) {
      return this.tagName === 'SECTION' ? SCREEN_HEIGHT : 0;
    },
  );
  drewCell.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  describe('what is drawn is held while focus is in it', () => {
    it('keeps a row drawn while focus is in a popup its editor opened', async () => {
      const { user } = renderTable();
      await scrollTo(stageTop(10));

      const name = /^Stage 10 .*Item 1 › Content English$/;
      await user.click(screen.getByRole('button', { name }));
      const editor = await screen.findByRole('textbox', { name });
      await waitFor(() => expect(editor).toHaveFocus());
      const cell = editor.closest('td');
      if (!cell) throw new Error('The editor is in no cell');
      await user.click(within(cell).getByRole('button', { name: 'Add link' }));
      // The popup is drawn elsewhere in the page, outside the table.
      const url = await screen.findByRole('textbox', { name: 'Link URL' });
      expect(screen.getByRole('table')).not.toContainElement(url);
      await waitFor(() => expect(url).toHaveFocus());
      await user.type(url, 'https://example.com');

      await scrollTo(stageTop(300));
      expect(url).toBeInTheDocument();
      expect(url).toHaveFocus();
      expect(url).toHaveValue('https://example.com');

      // Held only while focus is there: it goes when focus does.
      await leaveTable(user);
      await scrollTo(stageTop(300) + 1);
      expect(url).not.toBeInTheDocument();
      expect(editor).not.toBeInTheDocument();
    });

    it('keeps a row drawn while focus is in the menu of values its editor opened', async () => {
      const protocol = largeTranslationProtocol(STAGES);
      const [firstName] = [{ name: 'first_name', type: 'text' as const }];
      protocol.codebook = {
        ...protocol.codebook,
        ego: { variables: { firstName } },
      };
      protocol.stages = protocol.stages.map((stage, index) =>
        index === 9 && stage.type === 'Information'
          ? {
              ...stage,
              title: { en: 'Hello{name, select, missing {} other {, {name}}}' },
              dynamicValues: { name: { path: 'ego.firstName' } },
            }
          : stage,
      );
      const { user } = renderTable(protocol);
      await scrollTo(stageTop(10));

      const name = /^Stage 10 .*Page heading English$/;
      await user.click(screen.getByRole('button', { name }));
      const editor = await screen.findByRole('textbox', { name });
      await waitFor(() => expect(editor).toHaveFocus());
      await user.click(
        screen.getByRole('button', {
          name: 'Inject piped text from interview metadata or a network attribute',
        }),
      );
      const [option] = await screen.findAllByRole('option', {
        name: /first_name/,
      });
      expect(screen.getByRole('table')).not.toContainElement(option ?? null);

      await scrollTo(stageTop(300));
      expect(option).toBeInTheDocument();
      expect(editor).toBeInTheDocument();
    });

    it('keeps a group drawn while focus is on its heading', async () => {
      renderTable();
      await scrollTo(stageTop(10));

      // Stage 10's heading names it by its name in the default language.
      const link = screen.getByRole('link', { name: 'Section 9 en' });
      act(() => link.focus());
      expect(link).toHaveFocus();

      await scrollTo(stageTop(300));
      expect(link).toBeInTheDocument();
      expect(link).toHaveFocus();

      await leaveTable(userEvent.setup());
      await scrollTo(stageTop(300) + 1);
      expect(link).not.toBeInTheDocument();
    });
  });

  describe('row heights', () => {
    const drawnKeys = () =>
      new Set(
        Array.from(document.querySelectorAll('tr[data-window-key]'), (row) =>
          row.getAttribute('data-window-key'),
        ),
      );
    const spacerHeight = () =>
      Array.from(document.querySelectorAll('tr[aria-hidden] td')).reduce(
        (sum, spacer) =>
          sum + Number.parseFloat((spacer as HTMLElement).style.height),
        0,
      );
    /** The row at item `index` of the table, which counts headings. */
    const item = (index: number) => {
      const row = document.querySelector(`tr[aria-rowindex="${index + 2}"]`);
      if (!row) throw new Error(`Item ${index} is not drawn`);
      return row;
    };

    it('stands in for a row not drawn at the height it was measured at', async () => {
      const { store } = renderTable();
      const groups = getTranslationGroups(store.getState());
      const rows = groups.reduce((sum, group) => sum + group.rows.length, 0);
      await scrollTo(stageTop(100));
      // The four texts of stage 100, which is on the screen.
      const measuredKeys = [496, 497, 498, 499].map((index) => {
        const row = item(index);
        laidOutAt(row, 200);
        return row.getAttribute('data-window-key');
      });

      await scrollTo(stageTop(300));

      const nowDrawn = drawnKeys();
      const measuredAway = measuredKeys.filter((key) => !nowDrawn.has(key));
      expect(measuredAway).toHaveLength(4);
      const rowsDrawn = Array.from(nowDrawn).filter((key) =>
        key?.startsWith('row:'),
      ).length;
      const headingsDrawn = nowDrawn.size - rowsDrawn;
      // What is not drawn is a heading of 40 or a row of 96, or what it was
      // measured at.
      expect(spacerHeight()).toBe(
        96 * (rows - rowsDrawn - measuredAway.length) +
          200 * measuredAway.length +
          40 * (groups.length - headingsDrawn),
      );
    });

    it('moves the scroller by what a row above the screen turns out to differ by', async () => {
      renderTable();
      const top = stageTop(100);
      await scrollTo(top);
      expect(scroller().scrollTop).toBe(top);

      // Stage 98's last text ends above the top of the screen, in the rows
      // drawn beyond it.
      const above = item(97 * 5 + 4);
      laidOutAt(above, 150);
      expect(scroller().scrollTop).toBe(top + 54);

      // A row on the screen is not above it, so nothing moves for it.
      laidOutAt(item(99 * 5 + 1), 150);
      expect(scroller().scrollTop).toBe(top + 54);

      // And it moves back when the row above is shorter again.
      laidOutAt(above, 96);
      expect(scroller().scrollTop).toBe(top);
    });

    it('goes by the height the row is laid out at, not the size it is drawn at', async () => {
      renderTable();
      const top = stageTop(100);
      await scrollTo(top);
      // The dialog opens by scaling up, which makes every row look taller.
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 800, 180),
      );

      laidOutAt(item(97 * 5 + 4), 150);

      expect(scroller().scrollTop).toBe(top + 54);
    });
  });

  describe('a table small enough to draw whole', () => {
    it('is drawn as it always was', () => {
      renderTable(largeTranslationProtocol(15));

      expect(screen.getByRole('table')).not.toHaveAttribute('aria-rowcount');
      expect(document.querySelector('[data-window-key]')).toBeNull();
      expect(document.querySelector('[aria-rowindex]')).toBeNull();
      expect(document.querySelector('tr[aria-hidden]')).toBeNull();
      // The browser keeps what is being read where it is, as nothing else does.
      expect(scroller().className).not.toContain('overflow-anchor');
    });

    it('turns the browser’s own scroll anchoring off only once it is windowed', () => {
      renderTable();

      expect(scroller().className).toContain('overflow-anchor:none');
    });
  });
});
