import { AlertCircle, Check, Circle, Lock, MinusCircle } from 'lucide-react';
import type { RefObject } from 'react';
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { focusStageSection } from '@codaco/protocol-builder/form/stageSections';
import type {
  StageSection,
  StageSectionsStore,
  StageSectionStatus,
} from '@codaco/protocol-builder/stage-editor-contract';

import { STAGE_FORM_ID } from './stageFormId';

/**
 * What each state of a section is CALLED, keyed by the state itself so the
 * record stays exhaustive: a state added to `StageSectionStatus` with no words
 * for it is a section a screen-reader user is told nothing about, and this is
 * what turns that into a typecheck failure rather than a silence.
 */
const STATUS_LABELS = defineMessages({
  error: {
    id: 'architect.stageEditor.sectionOutline.errorStatus',
    defaultMessage: 'Has a problem',
    description:
      'Spoken state of one section of a stage editor (a stage is one step of an interview): something the researcher has entered in it is not valid. Read out after the section’s own name, and never shown on screen — the same state is drawn as a color and an icon.',
  },
  incomplete: {
    id: 'architect.stageEditor.sectionOutline.incompleteStatus',
    defaultMessage: 'Not finished',
    description:
      'Spoken state of one section of a stage editor: it still has required fields the researcher has not filled in. Read out after the section’s own name, and never shown on screen.',
  },
  complete: {
    id: 'architect.stageEditor.sectionOutline.completeStatus',
    defaultMessage: 'Finished',
    description:
      'Spoken state of one section of a stage editor: everything it asks for has been filled in and nothing in it is invalid. Read out after the section’s own name, and never shown on screen.',
  },
  switchedOff: {
    id: 'architect.stageEditor.sectionOutline.switchedOffStatus',
    defaultMessage: 'Switched off',
    description:
      'Spoken state of one section of a stage editor: the researcher has turned this optional part of the stage off, so it asks for nothing. Read out after the section’s own name, and never shown on screen.',
  },
  unavailable: {
    id: 'architect.stageEditor.sectionOutline.unavailableStatus',
    defaultMessage: 'Not available yet',
    description:
      'Spoken state of one section of a stage editor: it cannot be filled in until something else in the stage has been chosen. Read out after the section’s own name, and never shown on screen.',
  },
}) satisfies Record<StageSectionStatus, MessageDescriptor>;

const messages = defineMessages({
  landmark: {
    id: 'architect.stageEditor.sectionOutline.landmarkLabel',
    defaultMessage: 'Stage sections',
    description:
      'Accessible name of the navigation landmark listing the sections of the stage being edited. A stage is one step of an interview.',
  },
  statusWithProblems: {
    id: 'architect.stageEditor.sectionOutline.statusWithProblems',
    defaultMessage: '{status}. {problems}',
    description:
      'Read out for a section of a stage editor whose only account of what is wrong is here. status is the section’s spoken state ("Has a problem"); problems is one or more whole sentences describing what the protocol refused, already in the reader’s language. Both are complete sentences, so this is only the punctuation that separates them.',
  },
});

/**
 * Status is carried by an icon AND by words, never by colour alone: the five
 * states are the difference between "you still have work here" and "this is
 * done", which nobody should have to distinguish by hue.
 */
const STATUS_PRESENTATION: Record<
  StageSectionStatus,
  Readonly<{ label: MessageDescriptor; icon: typeof Check; className: string }>
> = {
  error: {
    label: STATUS_LABELS.error,
    icon: AlertCircle,
    className: 'text-destructive',
  },
  incomplete: {
    label: STATUS_LABELS.incomplete,
    icon: Circle,
    className: 'text-current/60',
  },
  complete: {
    label: STATUS_LABELS.complete,
    icon: Check,
    className: 'text-success',
  },
  switchedOff: {
    label: STATUS_LABELS.switchedOff,
    icon: MinusCircle,
    className: 'text-current/40',
  },
  unavailable: {
    label: STATUS_LABELS.unavailable,
    icon: Lock,
    className: 'text-current/40',
  },
};

/**
 * The stage editor's section list, rendered beside the editor.
 *
 * One control per section, so a researcher editing a long stage can see how
 * much of it is done and get to any part of it without scrolling. Where there
 * is room it sits alongside the form and stays put while the form scrolls;
 * where there is not, the same list becomes a row of chips above the form.
 * It is the same navigation either way — one implementation, one set of
 * semantics, and nothing that only works at one size.
 *
 * Architect's rather than the editor package's, because where a list of the
 * sections belongs on the page is a fact about this app's chrome: the package
 * publishes the sections and this decides what to do with them.
 */
export default function StageSectionOutline({
  sections,
  host,
}: Readonly<{
  sections: StageSectionsStore;
  /**
   * The column this list is drawn in, which is also what it lines itself up
   * against: the column and the editor beside it start at the same point, so
   * the distance from here to the first card is the offset the list needs.
   */
  host: HTMLElement | null;
}>) {
  const intl = useAppIntl();
  const entries = useSyncExternalStore(
    sections.subscribe,
    sections.getSnapshot,
    sections.getServerSnapshot,
  );

  // The first section the researcher CONFIGURES, as the editor publishes it —
  // the stage's name and interface are a section too, and they are the heading
  // this list is meant to start below. Asked of the published chrome rather
  // than taken to be the second entry, so an editor that composes its sections
  // differently still lines up.
  const firstCard = entries.find((entry) => entry.chrome === 'card');
  const outline = usePublishedOutlineOffset(host, firstCard?.id);

  if (entries.length === 0) return null;

  return (
    <nav
      ref={outline}
      aria-label={intl.formatMessage(messages.landmark)}
      // `min-w-0`: a grid item's own minimum is its content, so without it the
      // strip of sections below the two-column breakpoint makes this column as
      // wide as the whole list — and the list's `overflow-x-auto` never has
      // anything to scroll, while the page does.
      //
      // It sticks to the bottom of Architect's navigation bar rather than to
      // the top of the viewport: the bar is sticky too and paints above this,
      // so a list stuck at `top-0` loses its first rows behind it. `NavShell`
      // measures the bar and publishes the height.
      //
      // Before it is stuck it starts level with the first card of the form
      // rather than with the top of the column, which is the stage's heading:
      // the two columns begin together, so the offset is the height of
      // everything the editor draws above that card, measured below.
      className="min-w-0 @min-[60rem]:sticky @min-[60rem]:top-(--architect-nav-height) @min-[60rem]:mt-(--architect-stage-outline-offset)"
    >
      {/*
        The card the list is drawn on, and nothing at all below the two-column
        breakpoint: `contents` leaves the element in the tree — the landmark
        above it is untouched either way — while generating no box, so the row
        of chips above the form keeps the layout, the scrolling and the page's
        own background it has always had.

        `noContainer`, because the wrapper Surface renders by default declares
        `@container` — and the breakpoint this list is written in is the
        route's column, not this card. Inside one, `@min-[60rem]` would be
        asked of a 16rem card and never be true again.

        Its own scrollport rather than the landmark's: the card is the height
        the bar leaves it, and a long list scrolls INSIDE it, so its top and
        bottom edges stay where they are instead of sliding out of the column.
      */}
      <Surface
        noContainer
        spacing="xs"
        shadow="sm"
        className="@max-[60rem]:contents @min-[60rem]:max-h-[calc(100dvh-var(--architect-nav-height))] @min-[60rem]:overflow-y-auto"
      >
        <ol className="flex list-none gap-2 overflow-x-auto p-0 @min-[60rem]:flex-col @min-[60rem]:overflow-visible">
          {entries.map((section) => (
            <li key={section.id} className="shrink-0">
              <StageSectionOutlineItem section={section} />
            </li>
          ))}
        </ol>
      </Surface>
    </nav>
  );
}

/**
 * How far below the top of its column the section list starts, as a custom
 * property on the list itself.
 *
 * Nothing about it is a constant a stylesheet could carry: the stage heading
 * it clears holds a name that wraps, a badge row that wraps, and a picture
 * whose size the type scale moves — and an alert about a read-only session, or
 * a list of what the last save refused, appears above it without asking. So it
 * is measured where both columns are drawn and read from here, exactly as the
 * navigation bar's own height is.
 */
export const OUTLINE_OFFSET_VARIABLE = '--architect-stage-outline-offset';

/**
 * Publishes that offset, and keeps it right.
 *
 * Measured as the distance between two things on the page — the top of this
 * column, and the top of the first card in the editor beside it — rather than
 * as a height added up from parts: whatever the editor puts above that card is
 * then already counted, and the two columns line up by construction because
 * the reading IS the difference between them.
 *
 * Watched with a `ResizeObserver` on the column (which changes with the width
 * of the window, so with everything that wraps) and on the form (which changes
 * with everything the editor draws above the first card). The reading is
 * published only when it differs from the one already there, so the layout
 * this triggers cannot feed back into another write.
 *
 * A reading of zero or less is never published: a column measured before it is
 * laid out, or in an environment that lays nothing out, would otherwise put
 * the list back level with the stage's heading, which is the fault this
 * exists to fix.
 */
function usePublishedOutlineOffset(
  host: HTMLElement | null,
  firstCardId: string | undefined,
): RefObject<HTMLElement | null> {
  const outline = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const list = outline.current;
    if (list === null || host === null || firstCardId === undefined) return;

    const publish = () => {
      // Looked up on every reading rather than held: the editor re-renders its
      // sections as the researcher works, and a card that has been replaced
      // is a stale element measured where it no longer is.
      const card = document.getElementById(firstCardId);
      if (card === null) return;
      const offset =
        card.getBoundingClientRect().top - host.getBoundingClientRect().top;
      if (offset <= 0) return;
      // Kept to the hundredth of a pixel rather than rounded to whole ones:
      // the heading above the first card is as tall as its text, which is a
      // fraction, and a rounded offset misses the card it is lining up with by
      // up to half a pixel — visible as a hairline where the two tops meet.
      const next = `${Math.round(offset * 100) / 100}px`;
      if (list.style.getPropertyValue(OUTLINE_OFFSET_VARIABLE) === next) return;
      list.style.setProperty(OUTLINE_OFFSET_VARIABLE, next);
    };

    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(host);
    // Architect's own id for the form it asked the editor to render, so this
    // is not a package internal read off the page by shape or by class.
    const form = document.getElementById(STAGE_FORM_ID);
    if (form !== null) observer.observe(form);

    return () => {
      observer.disconnect();
      list.style.removeProperty(OUTLINE_OFFSET_VARIABLE);
    };
  }, [firstCardId, host]);

  return outline;
}

function StageSectionOutlineItem({
  section,
}: Readonly<{ section: StageSection }>) {
  const intl = useAppIntl();
  const presentation = STATUS_PRESENTATION[section.status];
  const StatusIcon = presentation.icon;
  // The control's own words come first, one problem at a time. A control
  // showing a message beside itself has already said what is wrong in the
  // vocabulary of the thing being edited, and repeating the schema's version
  // of THAT underneath would be two accounts of one fault — so the editor
  // publishes only the problems no field of the section is already stating.
  // Every one of those is read out: a reference to a resource the protocol
  // does not have, a type a collaborator deleted, because for those this is
  // the only place it is written down.
  //
  // The problems are DECODED here rather than read as they were stored: the
  // editor has no reader, so each one arrives as an encoded descriptor — or as
  // a plain sentence a host or the protocol schema wrote, which the same call
  // passes through untouched.
  const statusLabel = intl.formatMessage(presentation.label);
  const announced =
    section.problems.length === 0
      ? statusLabel
      : intl.formatMessage(messages.statusWithProblems, {
          status: statusLabel,
          // Joined with a space rather than through `formatList`: these are
          // whole sentences in sequence, not the members of a list, and "a, b
          // and c" would read them as one thing that is three ways wrong.
          problems: section.problems
            .map((sentence) => formatMessageError(sentence, intl) ?? sentence)
            .join(' '),
        });

  return (
    <button
      type="button"
      onClick={() => focusStageSection(section.id)}
      // `relative`: the visually hidden status below is absolutely positioned,
      // so without a positioned ancestor of its own it is laid out against
      // whatever the page happens to have positioned — reaching, in a host
      // whose editor sits in a scrolling panel, past the right of the page and
      // giving it a horizontal scrollbar.
      className="focusable relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-current/5"
    >
      <StatusIcon
        aria-hidden
        className={cx('size-4 shrink-0', presentation.className)}
      />
      <span className="truncate">{section.title}</span>
      {/*
        The status, and — when the problem is one only the schema can see —
        what it is. A dangling resource reference has no field showing a
        message beside it, so this list is the only place it is written down,
        and reading it must not depend on seeing the colour of an icon.
      */}
      <span className="sr-only">{announced}</span>
    </button>
  );
}
