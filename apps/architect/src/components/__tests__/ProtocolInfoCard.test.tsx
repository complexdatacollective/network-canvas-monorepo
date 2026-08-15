import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { PROTOCOL_NAME_MAX_LENGTH } from '~/config';
import createTimelineReducer from '~/ducks/middleware/timeline';
import activeProtocolReducer, {
  setActiveProtocol,
  updateProtocolDescription,
  updateProtocolName,
} from '~/ducks/modules/activeProtocol';

import ProtocolInfoCard from '../ProtocolInfoCard';

vi.mock('@codaco/art', () => ({
  Pattern: () => <div data-testid="protocol-pattern" />,
}));

type MockMotionProps = HTMLAttributes<HTMLDivElement> & {
  animate?: unknown;
  initial?: unknown;
  transition?: unknown;
  children?: ReactNode;
};

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: MockMotionProps) => <div {...props} />,
  },
  useReducedMotion: () => true,
}));

const protocol: CurrentProtocol = {
  name: 'Original protocol',
  description: 'Original description',
  schemaVersion: 8,
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

const createTestStore = () =>
  configureStore({
    reducer: {
      activeProtocol: createTimelineReducer(activeProtocolReducer),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

const renderCard = (initialName?: string) => {
  const store = createTestStore();
  store.dispatch(
    setActiveProtocol(
      initialName === undefined ? protocol : { ...protocol, name: initialName },
    ),
  );

  render(
    <Provider store={store}>
      <ProtocolInfoCard />
    </Provider>,
  );

  return store;
};

const nameControl = () =>
  screen.getByRole('textbox', { name: 'Protocol name' }) as HTMLTextAreaElement;

const allowanceElement = () => {
  const describedBy = nameControl().getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const element = document.getElementById(describedBy!);
  expect(element).toBeTruthy();
  return element!;
};

const allowanceText = () => allowanceElement().textContent;

// jsdom applies no stylesheet, so `sr-only` is asserted as the class it is.
// What it means in the browser — a 1x1 clipped box — is measured for real in
// `e2e/specs/responsive.spec.ts`, which reads the element's bounding box.
const SCREEN_READER_ONLY = 'sr-only';

const TOO_LONG_MESSAGE = `Protocol names are limited to ${PROTOCOL_NAME_MAX_LENGTH} characters.`;

// A ZWJ family emoji: 1 grapheme, 8 UTF-16 code units. Any cap that counts
// `value.length` charges 8 for it, which is exactly what #1397's emoji names
// must not be penalised by.
const FAMILY = '🧑‍🤝‍🧑';

describe('ProtocolInfoCard', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/protocol');
  });

  it('normalizes newlines and commits the protocol name on Enter or blur', () => {
    const store = renderCard();
    const name = screen.getByRole('textbox', {
      name: 'Protocol name',
    }) as HTMLTextAreaElement;

    fireEvent.change(name, { target: { value: '  Renamed\nprotocol  ' } });
    expect(name).toHaveValue('  Renamed protocol  ');

    name.focus();
    fireEvent.keyDown(name, { key: 'Enter', code: 'Enter' });

    expect(document.activeElement).not.toBe(name);
    expect(store.getState().activeProtocol.present?.name).toBe(
      'Renamed protocol',
    );

    fireEvent.change(name, { target: { value: '  Blur commit  ' } });
    fireEvent.blur(name);

    expect(store.getState().activeProtocol.present?.name).toBe('Blur commit');
  });

  it('rolls a blank protocol name back to the stored value', () => {
    const store = renderCard();
    const name = screen.getByRole('textbox', {
      name: 'Protocol name',
    });

    fireEvent.change(name, { target: { value: ' \n ' } });
    fireEvent.blur(name);

    expect(name).toHaveValue('Original protocol');
    expect(store.getState().activeProtocol.present?.name).toBe(
      'Original protocol',
    );
  });

  // Pinned because nothing pinned it: this guard lives in the same JSX block
  // #1397 rewrote wholesale, so a textual merge that took either side intact
  // would have dropped it in silence. The timeline's own structural no-op guard
  // (#1396) means the lost history point would not have shown up in state
  // either — only a dispatch-level assertion catches it, so that is what this
  // makes. Clicking into the name to read it, or tabbing past it, is not an
  // edit and must not be dispatched as one.
  it('does not dispatch a rename when the field is entered and left unchanged', () => {
    const dispatched: string[] = [];
    const record: Middleware = () => (next) => (action) => {
      dispatched.push((action as { type: string }).type);
      return next(action);
    };

    const store = configureStore({
      reducer: {
        activeProtocol: createTimelineReducer(activeProtocolReducer),
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }).concat(record),
    });
    store.dispatch(setActiveProtocol(protocol));

    render(
      <Provider store={store}>
        <ProtocolInfoCard />
      </Provider>,
    );

    const name = nameControl();
    name.focus();
    fireEvent.blur(name);

    expect(dispatched).not.toContain(updateProtocolName.type);

    // The positive control: an edit that IS one still commits, so the guard
    // cannot pass by refusing everything.
    fireEvent.change(name, { target: { value: 'Actually renamed' } });
    fireEvent.blur(name);

    expect(dispatched).toContain(updateProtocolName.type);
    expect(store.getState().activeProtocol.present?.name).toBe(
      'Actually renamed',
    );
  });

  it('commits the description on blur and synchronizes real external changes', () => {
    const store = renderCard();
    const description = screen.getByRole('textbox', {
      name: 'Protocol description',
    });

    fireEvent.change(description, {
      target: { value: 'A description still being edited' },
    });

    act(() => {
      store.dispatch(updateProtocolName({ name: 'External name update' }));
    });

    expect(description).toHaveValue('A description still being edited');

    fireEvent.blur(description);
    expect(store.getState().activeProtocol.present?.description).toBe(
      'A description still being edited',
    );

    act(() => {
      store.dispatch(
        updateProtocolDescription({ description: 'External description' }),
      );
    });

    expect(description).toHaveValue('External description');
  });

  // #1397. The filed defect: `field-sizing: content` with no `max-height` made
  // the control's height a pure function of the stored value, so a 342-character
  // name measured 703px inside a 720px viewport and put the timeline's first row
  // at y=1189. jsdom does no layout, so the pixel proof lives in
  // `e2e/specs/responsive.spec.ts`; these pin the two rules that produce it.
  describe('bounding the name against the viewport', () => {
    it('always carries the three-line height bound, whatever the value', () => {
      renderCard('Short name');
      expect(nameControl()).toHaveClass('max-h-[3lh]');

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(90) } });
      expect(nameControl()).toHaveClass('max-h-[3lh]');
    });

    it('lets an RTL name set its own base direction', () => {
      renderCard('مشروع بحث الشبكات الاجتماعية');
      expect(nameControl()).toHaveAttribute('dir', 'auto');
    });

    it('steps the heading down so a name at the limit fits that bound', () => {
      renderCard('Short name');
      // Up to 32 graphemes the page-heading size is untouched.
      expect(nameControl()).toHaveClass('text-4xl');

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(50) } });
      expect(nameControl()).toHaveClass('text-2xl');
      expect(nameControl()).not.toHaveClass('text-4xl');

      // Past 64 graphemes — the only tier in which a name at the 100-grapheme
      // limit fits three lines at 390px, the narrowest supported width.
      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(80) } });
      expect(nameControl()).toHaveClass('text-lg');
      expect(nameControl()).not.toHaveClass('text-2xl');
    });

    it('bounds and steps down a legacy name the cap never saw', () => {
      // Arrives from IndexedDB / an imported .netcanvas, over the limit.
      renderCard('م'.repeat(342));
      expect(nameControl()).toHaveValue('م'.repeat(342));
      expect(nameControl()).toHaveClass('max-h-[3lh]');
      expect(nameControl()).toHaveClass('text-lg');
    });
  });

  describe('the protocol name length limit', () => {
    it('refuses an edit that pushes the name past the limit and announces why', () => {
      const store = renderCard('Short name');

      fireEvent.change(nameControl(), {
        target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH) },
      });
      expect(nameControl()).toHaveValue('A'.repeat(PROTOCOL_NAME_MAX_LENGTH));

      fireEvent.change(nameControl(), {
        target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH + 1) },
      });

      // The refused keystroke leaves no text behind, so nothing over-limit can
      // reach the store on the next blur.
      expect(nameControl()).toHaveValue('A'.repeat(PROTOCOL_NAME_MAX_LENGTH));
      expect(screen.getByRole('status')).toHaveTextContent(TOO_LONG_MESSAGE);

      fireEvent.blur(nameControl());
      expect(store.getState().activeProtocol.present?.name).toBe(
        'A'.repeat(PROTOCOL_NAME_MAX_LENGTH),
      );
    });

    it('refuses an over-limit paste without silently truncating it', () => {
      renderCard('Short name');

      fireEvent.change(nameControl(), { target: { value: 'B'.repeat(300) } });

      // Neither accepted nor cut down to 100: the previous value stands, so the
      // researcher's clipboard content is never half-committed.
      expect(nameControl()).toHaveValue('Short name');
      expect(screen.getByRole('status')).toHaveTextContent(TOO_LONG_MESSAGE);

      // ...and the refusal is on screen, not only in the live region. A
      // `role="status"` message inside `sr-only` is a 1x1 clipped box: a
      // sighted researcher pasting a long study title would see the paste
      // simply not happen, with no error, no counter and no change of any kind.
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);
      expect(allowanceElement()).not.toHaveClass(SCREEN_READER_ONLY);
    });

    it('shows a refused edit on screen and clears it once an edit is accepted', () => {
      renderCard('Wave 2 pilot');

      // Twelve graphemes — 88 remaining. The counter is deliberately silent
      // chrome at this distance from the limit, which is precisely why the
      // refusal below needs to bring its own visible channel.
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);

      fireEvent.change(nameControl(), { target: { value: 'B'.repeat(300) } });

      expect(nameControl()).toHaveValue('Wave 2 pilot');
      expect(allowanceElement()).not.toHaveClass(SCREEN_READER_ONLY);
      // Reads as an error rather than as a statistic, in the boxed treatment
      // that clears WCAG AA on this card's platinum ground (4.94:1, against
      // 4.39:1 for plain destructive text at this size).
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);
      expect(allowanceElement()).toHaveClass('bg-destructive');
      expect(allowanceElement()).toHaveClass('text-destructive-contrast');

      // The next accepted edit resolves it: the message goes, and the line
      // falls back to being the control's silent description rather than
      // leaving a refusal sitting under a name that is now perfectly fine.
      fireEvent.change(nameControl(), { target: { value: 'Wave 3 pilot' } });
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);
      expect(allowanceElement()).not.toHaveClass('bg-destructive');
      expect(allowanceText()).toBe(
        `${PROTOCOL_NAME_MAX_LENGTH - 12} of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
    });

    it('keeps a legacy over-limit name editable downward', () => {
      const legacy = 'م'.repeat(342);
      const store = renderCard(legacy);

      // Adding to it is refused...
      fireEvent.change(nameControl(), { target: { value: `${legacy}م` } });
      expect(nameControl()).toHaveValue(legacy);

      // ...but every edit that does not make it longer is accepted, so the name
      // that triggered the bug can always be shortened. A predicate of
      // "reject anything over the limit" would trap it forever.
      fireEvent.change(nameControl(), {
        target: { value: legacy.slice(0, 200) },
      });
      expect(nameControl()).toHaveValue('م'.repeat(200));
      expect(allowanceText()).toBe(
        `100 characters over the ${PROTOCOL_NAME_MAX_LENGTH} character limit`,
      );

      fireEvent.change(nameControl(), { target: { value: 'Renamed' } });
      fireEvent.blur(nameControl());
      expect(store.getState().activeProtocol.present?.name).toBe('Renamed');
    });

    it('counts an emoji sequence as one character, so an emoji name reaches the full limit', () => {
      const store = renderCard('Short name');
      const emojiName = FAMILY.repeat(PROTOCOL_NAME_MAX_LENGTH);
      expect(emojiName.length).toBe(PROTOCOL_NAME_MAX_LENGTH * 8);

      fireEvent.change(nameControl(), { target: { value: emojiName } });

      // A `value.length` cap would have refused this at the 13th emoji.
      expect(nameControl()).toHaveValue(emojiName);

      fireEvent.change(nameControl(), {
        target: { value: emojiName + FAMILY },
      });
      expect(nameControl()).toHaveValue(emojiName);

      fireEvent.blur(nameControl());
      expect(store.getState().activeProtocol.present?.name).toBe(emojiName);
    });
  });

  describe('communicating the limit', () => {
    it('describes the remaining allowance on the control at all times', () => {
      renderCard('Short name');
      expect(allowanceText()).toBe(
        `${PROTOCOL_NAME_MAX_LENGTH - 10} of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(95) } });
      expect(allowanceText()).toBe(
        `5 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
    });

    it('paints the counter from the same count at which it starts announcing', () => {
      renderCard('Short name');
      const status = screen.getByRole('status');

      // 21 remaining: one short of the first announcement threshold, so
      // neither channel says anything.
      fireEvent.change(nameControl(), {
        target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH - 21) },
      });
      expect(status).toHaveTextContent('');
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);

      // 20 remaining: the live region speaks. The counter has to appear at the
      // SAME count — a screen reader being told the allowance while the
      // sighted counter is still hidden is two different products.
      fireEvent.change(nameControl(), {
        target: { value: 'A'.repeat(PROTOCOL_NAME_MAX_LENGTH - 20) },
      });
      expect(status).toHaveTextContent(
        `20 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
      expect(allowanceElement()).not.toHaveClass(SCREEN_READER_ONLY);
    });

    it('announces the allowance only as it crosses a threshold', () => {
      renderCard('Short name');
      const status = screen.getByRole('status');

      // Far from the limit: nothing to say.
      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(50) } });
      expect(status).toHaveTextContent('');

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(85) } });
      expect(status).toHaveTextContent(
        `15 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );

      // Same threshold band: silence, rather than one announcement per
      // keystroke flooding the screen reader.
      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(86) } });
      expect(status).toHaveTextContent('');

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(93) } });
      expect(status).toHaveTextContent(
        `7 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
    });

    it('does not announce a rename that the researcher did not type', () => {
      const store = renderCard('Short name');

      act(() => {
        store.dispatch(updateProtocolName({ name: 'A'.repeat(99) }));
      });

      expect(nameControl()).toHaveValue('A'.repeat(99));
      expect(screen.getByRole('status')).toHaveTextContent('');
      expect(allowanceText()).toBe(
        `1 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
    });
  });
});
