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

// `toHaveTextContent('')` is a substring check, so it passes against ANY
// content — silence is the one thing that matcher cannot assert. Equality on
// the text is what actually fails when the region is still holding a message.
const expectStatusSilent = () =>
  expect(screen.getByRole('status').textContent).toBe('');

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

  // A whitespace-only edit trims back to the value already stored, so neither
  // the blank-name rollback above nor the dispatch guard below fires. Nothing
  // wrong reaches the store — but unless blur resyncs the control, it keeps the
  // untrimmed string, and every measurement taken from that phantom value (the
  // heading size tier, the remaining-character readout, the counter's
  // visibility) describes a name that was never saved.
  it('resyncs the control when a whitespace-only edit trims back to the stored name', () => {
    // 64 graphemes sits exactly on the text-2xl/text-lg tier boundary, so one
    // phantom space is enough to move the heading a whole size tier.
    const name = 'A'.repeat(64);
    const store = renderCard(name);

    fireEvent.change(nameControl(), { target: { value: `${name} ` } });
    fireEvent.blur(nameControl());

    expect(nameControl()).toHaveValue(name);
    expect(allowanceText()).toBe(
      `${PROTOCOL_NAME_MAX_LENGTH - 64} of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
    );
    expect(nameControl()).toHaveClass('text-2xl');
    expect(store.getState().activeProtocol.present?.name).toBe(name);
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
      expect(nameControl()).toHaveClass('overflow-hidden');
      expect(nameControl()).not.toHaveClass('overflow-y-auto');

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(90) } });
      expect(nameControl()).toHaveClass('max-h-[3lh]');
      expect(nameControl()).toHaveClass('overflow-hidden');
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

    // The counterweight to the blur-resync tests below: blur must correct what
    // the value made false, and only that. A refusal is not a measurement of
    // the value — it says an edit was rejected, and trimming whitespace off the
    // value the researcher was left with does not make that untrue. Clearing
    // notices wholesale on blur would delete the only visible evidence that a
    // paste was dropped, at the exact moment the researcher looks away.
    it('keeps a refusal on screen when blur trims the value it was refused against', () => {
      renderCard('Wave 2 pilot');

      // Accepted, and leaves trailing whitespace for blur to trim.
      fireEvent.change(nameControl(), { target: { value: 'Wave 2 pilot ' } });
      // Refused, so the value stays as it was and the refusal is painted.
      fireEvent.change(nameControl(), { target: { value: 'B'.repeat(300) } });
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);

      fireEvent.blur(nameControl());

      expect(nameControl()).toHaveValue('Wave 2 pilot');
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);
      expect(allowanceElement()).not.toHaveClass(SCREEN_READER_ONLY);

      // ...and the next accepted edit still resolves it, as it always has.
      fireEvent.change(nameControl(), { target: { value: 'Wave 3 pilot' } });
      expect(allowanceElement()).not.toHaveTextContent(TOO_LONG_MESSAGE);
    });

    // The test above trims back to the name already stored, so its blur never
    // dispatches — and a refusal that survives `resyncNameChannels` is not yet
    // safe. The moment the blur DOES commit a rename, the store's `name`
    // changes, the synchronisation effect runs, and its unconditional
    // `setNotice(null)` deletes the refusal after the fact: exactly the case
    // the survival rule was written for, reached by the other door. A genuine
    // rename that also carries whitespace is what walks through it.
    it('keeps a refusal on screen when blur commits a genuine rename', () => {
      const store = renderCard('Wave 2 pilot');

      // Accepted, a real rename, and carrying whitespace for blur to trim — so
      // the dispatch guard fires rather than declining.
      fireEvent.change(nameControl(), { target: { value: 'Wave 3 pilot ' } });
      // Refused, so the value stays as it was and the refusal is painted.
      fireEvent.change(nameControl(), { target: { value: 'B'.repeat(300) } });
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);

      fireEvent.blur(nameControl());

      // The rename commits...
      expect(store.getState().activeProtocol.present?.name).toBe(
        'Wave 3 pilot',
      );
      expect(nameControl()).toHaveValue('Wave 3 pilot');
      // ...and the researcher can still see that their paste was dropped.
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);
      expect(allowanceElement()).not.toHaveClass(SCREEN_READER_ONLY);

      // ...and the next accepted edit still resolves it, as it always has.
      fireEvent.change(nameControl(), { target: { value: 'Wave 4 pilot' } });
      expect(allowanceElement()).not.toHaveTextContent(TOO_LONG_MESSAGE);
    });

    // The negative control for the two above. A refusal survives a rename this
    // component committed itself, because the researcher is still looking at
    // the value they were refused against. An EXTERNAL rename replaces that
    // value outright, so the refusal stops describing anything on screen and
    // has to go — which is why the fix is a provenance test and not the
    // deletion of the effect's `setNotice(null)`.
    it('clears a refusal when an external rename replaces the value it was refused against', () => {
      const store = renderCard('Wave 2 pilot');

      fireEvent.change(nameControl(), { target: { value: 'B'.repeat(300) } });
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);

      act(() => {
        store.dispatch(updateProtocolName({ name: 'Renamed elsewhere' }));
      });

      expect(nameControl()).toHaveValue('Renamed elsewhere');
      expect(allowanceElement()).not.toHaveTextContent(TOO_LONG_MESSAGE);
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);
      expectStatusSilent();
    });

    // ...and the provenance test has to be spent when it is used, not left
    // standing as a string comparison. Undo/redo makes the collision real: the
    // name this component committed comes back through the store later, from
    // somewhere else entirely. Same string, different provenance — the refusal
    // must clear, because the second arrival is an external rename like any
    // other.
    it('clears a refusal when an external rename carries the name the researcher last committed', () => {
      const store = renderCard('Wave 2 pilot');

      // A self-initiated commit: 'Wave 3 pilot' is now the string the component
      // has recognised as its own — once.
      fireEvent.change(nameControl(), { target: { value: 'Wave 3 pilot' } });
      fireEvent.blur(nameControl());
      expect(store.getState().activeProtocol.present?.name).toBe(
        'Wave 3 pilot',
      );

      // Something else moves the name away...
      act(() => {
        store.dispatch(updateProtocolName({ name: 'Wave 4 pilot' }));
      });

      fireEvent.change(nameControl(), { target: { value: 'B'.repeat(300) } });
      expect(allowanceElement()).toHaveTextContent(TOO_LONG_MESSAGE);

      // ...and then brings that exact string back. The researcher did not
      // commit this one.
      act(() => {
        store.dispatch(updateProtocolName({ name: 'Wave 3 pilot' }));
      });

      expect(nameControl()).toHaveValue('Wave 3 pilot');
      expect(allowanceElement()).not.toHaveTextContent(TOO_LONG_MESSAGE);
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);
      expectStatusSilent();
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
      expectStatusSilent();
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
      expectStatusSilent();

      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(85) } });
      expect(status).toHaveTextContent(
        `15 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );

      // Same threshold band: silence, rather than one announcement per
      // keystroke flooding the screen reader.
      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(86) } });
      expectStatusSilent();

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
      expectStatusSilent();
      expect(allowanceText()).toBe(
        `1 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
    });

    // The value is only one of three channels a whitespace-only edit moves.
    // The two tests immediately below cover the other two — the notice and the
    // announcement baseline — and their fixtures are chosen to sit INSIDE an
    // announcement band: the resync test further up uses a 64-grapheme name,
    // where 36 and 35 remaining both fall short of every threshold, so `notice`
    // stays null throughout it and neither channel is ever live enough to go
    // stale.
    it('leaves the description agreeing with the value after a whitespace-only blur', () => {
      // 79 graphemes — 21 remaining, one short of the first threshold, so the
      // single phantom space is a threshold crossing and sets `notice`.
      const name = 'A'.repeat(79);
      renderCard(name);
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);

      fireEvent.change(nameControl(), { target: { value: `${name} ` } });
      expect(allowanceText()).toBe(
        `20 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
      expect(allowanceElement()).not.toHaveClass(SCREEN_READER_ONLY);

      fireEvent.blur(nameControl());

      // The description renders the notice IN PREFERENCE to the live count and
      // is the control's own `aria-describedby`, so a notice left on the
      // phantom's reading has the control describing itself as a name it does
      // not hold — and forces the counter into view at a count that has not
      // earned it. Resyncing only the value moves the phantom out of the field
      // and into the description.
      expect(nameControl()).toHaveValue(name);
      expect(allowanceText()).toBe(
        `21 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
      expect(allowanceElement()).toHaveClass(SCREEN_READER_ONLY);
      expectStatusSilent();
    });

    it('still announces the next genuine crossing after a whitespace-only blur', () => {
      // 89 graphemes — 11 remaining, inside the 20 band. The phantom space
      // crosses into the 10 band, which is what moves the baseline.
      const name = 'A'.repeat(89);
      renderCard(name);
      const status = screen.getByRole('status');

      fireEvent.change(nameControl(), { target: { value: `${name} ` } });
      expect(status).toHaveTextContent(
        `10 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );

      fireEvent.blur(nameControl());
      expect(nameControl()).toHaveValue(name);

      // Blur put the value back in the 20 band, so a real 90th character
      // crosses into the 10 band for the first time and has to speak. A
      // baseline still sitting on the phantom's band reads this as the band it
      // is already in and says nothing: the announcement is lost to a space
      // typed and trimmed minutes earlier.
      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(90) } });
      expect(status).toHaveTextContent(
        `10 of ${PROTOCOL_NAME_MAX_LENGTH} characters remaining`,
      );
    });

    // The blank-name rollback is the same resync in the other direction, and it
    // strands the baseline the other way round: outside every band rather than
    // inside a tighter one, so the next edit announces something the researcher
    // has not crossed instead of swallowing something they have.
    it('re-baselines the announcement after a blank name is rolled back', () => {
      // 89 graphemes — 11 remaining, inside the 20 band.
      const name = 'A'.repeat(89);
      renderCard(name);

      // Selecting the whole name and typing over it drops the count to 1, far
      // outside every band. Blur rolls the value back, and the baseline has to
      // come back with it.
      fireEvent.change(nameControl(), { target: { value: ' ' } });
      fireEvent.blur(nameControl());
      expect(nameControl()).toHaveValue(name);

      // Shortening to 85 stays inside the 20 band, so it crosses nothing and
      // must stay silent. Against a baseline left on the abandoned blank draft
      // it reads as a fresh crossing and announces an allowance the researcher
      // has been sitting inside all along.
      fireEvent.change(nameControl(), { target: { value: 'A'.repeat(85) } });
      expectStatusSilent();
    });
  });
});
