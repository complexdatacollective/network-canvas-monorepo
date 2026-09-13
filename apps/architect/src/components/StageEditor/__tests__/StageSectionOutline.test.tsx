import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertCircle, Check, Circle, Lock, MinusCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { createMessageError } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import type {
  StageSection,
  StageSectionsStore,
  StageSectionStatus,
} from '@codaco/protocol-builder/stage-editor-contract';

import StageSectionOutline from '../StageSectionOutline';

/**
 * Architect's own list of the stage's sections, over a store standing in for
 * the editor's.
 *
 * A fake store rather than a mounted editor: what this component owes the
 * researcher is that every state the package can publish is drawn and said,
 * and that choosing a row takes them to it. Which states the editor actually
 * publishes, and when, is the package's own question and is asked there.
 */
beforeAll(() => {
  // jsdom implements no scroll API, and arriving at a section brings it into
  // view. A missing shim surfaces as an unhandled error rather than a
  // readable failure.
  Element.prototype.scrollIntoView ??= () => undefined;
});

function storeOf(sections: readonly StageSection[]): StageSectionsStore {
  const snapshot = Object.freeze([...sections]);
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => snapshot,
  };
}

const section = (
  id: string,
  title: string,
  status: StageSectionStatus,
  problems: readonly string[] = [],
): StageSection => ({ id, title, status, problems });

/** The sections themselves, as the editor renders them: focusable regions. */
function SectionsOnThePage({
  sections,
}: Readonly<{ sections: readonly StageSection[] }>) {
  return (
    <>
      {sections.map((entry) => (
        <section
          key={entry.id}
          id={entry.id}
          tabIndex={-1}
          aria-label={entry.title}
        >
          {entry.title}
        </section>
      ))}
    </>
  );
}

const EVERY_STATUS: readonly StageSection[] = [
  section('s-1', 'Stage name', 'complete'),
  section('s-2', 'Page content', 'incomplete'),
  section('s-3', 'Prompts', 'error'),
  section('s-4', 'Interviewer guidance', 'switchedOff'),
  section('s-5', 'Sort order', 'unavailable'),
];

/**
 * The icon each state is drawn with, as this component's own table declares
 * it. Named here so the test says what it expects rather than only that the
 * five drawings differ: a state given the wrong one of the five is as
 * misleading as a state given no drawing at all.
 */
const EXPECTED_ICONS: Record<StageSectionStatus, ComponentType> = {
  complete: Check,
  incomplete: Circle,
  error: AlertCircle,
  switchedOff: MinusCircle,
  unavailable: Lock,
};

const STATE_WORDS: Record<StageSectionStatus, string> = {
  complete: 'Finished',
  incomplete: 'Not finished',
  error: 'Has a problem',
  switchedOff: 'Switched off',
  unavailable: 'Not available yet',
};

describe('the list of a stage’s sections', () => {
  it('names itself, and says every section and how far along it is', () => {
    render(<StageSectionOutline sections={storeOf(EVERY_STATUS)} />);

    const outline = screen.getByRole('navigation', { name: 'Stage sections' });
    expect(within(outline).getAllByRole('listitem')).toHaveLength(5);
    expect(
      within(outline)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(
      EVERY_STATUS.map((entry) => `${entry.title}${STATE_WORDS[entry.status]}`),
    );
  });

  it('draws each state as its own glyph, so none of them is only a colour', () => {
    render(<StageSectionOutline sections={storeOf(EVERY_STATUS)} />);
    // The drawing each state is expected to be given, rendered here so the
    // question can be asked of the glyph itself rather than of the class the
    // icon is painted with — a class carries the status colour, so five
    // different classes are five colours and say nothing about whether five
    // different things were drawn.
    const reference = render(
      <>
        {Object.entries(EXPECTED_ICONS).map(([status, Icon]) => (
          <span key={status} data-icon={status}>
            <Icon />
          </span>
        ))}
      </>,
    );
    const expected = (status: StageSectionStatus): string => {
      const drawing = reference.container.querySelector(
        `[data-icon="${status}"] svg`,
      );
      if (drawing === null) {
        throw new Error(`no reference icon rendered for "${status}"`);
      }
      return drawing.innerHTML;
    };

    const outline = screen.getByRole('navigation', { name: 'Stage sections' });
    // The icon is hidden from a reader who is being told the state in words.
    // Read off the DOM because an `aria-hidden` element answers no role query,
    // which is correct and is why this has to be asked here.
    const drawn = [...outline.querySelectorAll('svg[aria-hidden="true"]')].map(
      (icon) => icon.innerHTML,
    );
    expect(drawn).toHaveLength(5);
    // Five states, five different drawings: a table answering with one icon
    // for two of them leaves those two told apart by their words alone, which
    // is exactly what drawing one is for.
    expect(
      new Set(EVERY_STATUS.map((entry) => expected(entry.status))).size,
    ).toBe(5);
    // And each row carries its OWN state's drawing, so two states cannot
    // quietly swap icons and stay green here either.
    expect(drawn).toEqual(EVERY_STATUS.map((entry) => expected(entry.status)));
  });

  it('reads out what the protocol refused when no field on the page says it', () => {
    // Written as a plain descriptor rather than through `defineMessages`: the
    // id is deliberately outside `architect.*` so nothing extracts it, and it
    // is a fixture rather than copy anybody translates.
    const zoomRefusal: MessageDescriptor = {
      id: 'fixture.zoomPastTheMaximum',
      defaultMessage: 'Starting zoom holds more than this stage allows.',
    };

    render(
      <StageSectionOutline
        sections={storeOf([
          // Encoded where it was decided, decoded here: the editor has no
          // reader, so what it publishes is a descriptor rather than words.
          section('s-1', 'Map', 'error', [
            createMessageError(zoomRefusal),
            'A sentence the protocol wrote itself.',
          ]),
        ])}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'MapHas a problem. Starting zoom holds more than this stage allows. A sentence the protocol wrote itself.',
      }),
    ).toBeInTheDocument();
  });

  it('takes the researcher to the section they chose', async () => {
    const user = userEvent.setup();
    render(
      <>
        <StageSectionOutline sections={storeOf(EVERY_STATUS)} />
        <SectionsOnThePage sections={EVERY_STATUS} />
      </>,
    );

    await user.click(
      screen.getByRole('button', { name: /^Interviewer guidance/ }),
    );

    // Focus rather than a scroll alone, so a keyboard or screen-reader user
    // actually arrives: the section is a region named by its own heading.
    expect(document.activeElement).toHaveAccessibleName('Interviewer guidance');
  });

  it('is not there at all before the editor has any sections to list', () => {
    render(<StageSectionOutline sections={storeOf([])} />);

    // An empty landmark is worse than none: it is one more stop on the way
    // through the page that says nothing when a reader arrives at it.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('follows the store rather than the props it was first rendered with', () => {
    const listeners = new Set<() => void>();
    let snapshot: readonly StageSection[] = Object.freeze([
      section('s-1', 'Page content', 'incomplete'),
    ]);
    const store: StageSectionsStore = {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => snapshot,
      getServerSnapshot: () => snapshot,
    };

    render(<StageSectionOutline sections={store} />);
    expect(
      screen.getByRole('button', { name: 'Page contentNot finished' }),
    ).toBeInTheDocument();

    snapshot = Object.freeze([section('s-1', 'Page content', 'complete')]);
    act(() => {
      for (const listener of listeners) listener();
    });

    expect(
      screen.getByRole('button', { name: 'Page contentFinished' }),
    ).toBeInTheDocument();
  });
});
