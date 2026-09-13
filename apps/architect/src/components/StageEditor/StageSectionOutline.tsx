import { AlertCircle, Check, Circle, Lock, MinusCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { focusStageSection } from '@codaco/protocol-builder/form/stageSections';
import type {
  StageSection,
  StageSectionsStore,
  StageSectionStatus,
} from '@codaco/protocol-builder/stage-editor-contract';

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
}: Readonly<{ sections: StageSectionsStore }>) {
  const intl = useAppIntl();
  const entries = useSyncExternalStore(
    sections.subscribe,
    sections.getSnapshot,
    sections.getServerSnapshot,
  );

  if (entries.length === 0) return null;

  return (
    <nav
      aria-label={intl.formatMessage(messages.landmark)}
      // `min-w-0`: a grid item's own minimum is its content, so without it the
      // strip of sections below the two-column breakpoint makes this column as
      // wide as the whole list — and the list's `overflow-x-auto` never has
      // anything to scroll, while the page does.
      className="min-w-0 @min-[60rem]:sticky @min-[60rem]:top-0 @min-[60rem]:max-h-dvh @min-[60rem]:overflow-y-auto @min-[60rem]:py-14"
    >
      <ol className="flex list-none gap-2 overflow-x-auto p-0 @min-[60rem]:flex-col @min-[60rem]:overflow-visible">
        {entries.map((section) => (
          <li key={section.id} className="shrink-0">
            <StageSectionOutlineItem section={section} />
          </li>
        ))}
      </ol>
    </nav>
  );
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
