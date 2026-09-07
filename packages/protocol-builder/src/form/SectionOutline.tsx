import { AlertCircle, Check, Circle, Lock, MinusCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { cx } from '@codaco/fresco-ui/utils/cva';

import {
  type OutlineSection,
  type SectionOutlineStatus,
  sectionOutlineStatus,
} from './outlineStore.ts';
import { useStageEditorForm } from './stageEditorContext.ts';

/**
 * What each state of a section is CALLED, keyed by the state itself so the
 * record stays exhaustive: a state added to `SectionOutlineStatus` with no
 * words for it is a section a screen-reader user is told nothing about, and
 * this is what turns that into a typecheck failure rather than a silence.
 */
const STATUS_LABELS = defineMessages({
  error: {
    id: 'protocolBuilder.outline.errorStatus',
    defaultMessage: 'Has a problem',
    description:
      'Spoken state of one section of a stage editor (a stage is one step of an interview): something the researcher has entered in it is not valid. Read out after the section’s own name, and never shown on screen — the same state is drawn as a color and an icon.',
  },
  incomplete: {
    id: 'protocolBuilder.outline.incompleteStatus',
    defaultMessage: 'Not finished',
    description:
      'Spoken state of one section of a stage editor: it still has required fields the researcher has not filled in. Read out after the section’s own name, and never shown on screen.',
  },
  complete: {
    id: 'protocolBuilder.outline.completeStatus',
    defaultMessage: 'Finished',
    description:
      'Spoken state of one section of a stage editor: everything it asks for has been filled in and nothing in it is invalid. Read out after the section’s own name, and never shown on screen.',
  },
  switchedOff: {
    id: 'protocolBuilder.outline.switchedOffStatus',
    defaultMessage: 'Switched off',
    description:
      'Spoken state of one section of a stage editor: the researcher has turned this optional part of the stage off, so it asks for nothing. Read out after the section’s own name, and never shown on screen.',
  },
  unavailable: {
    id: 'protocolBuilder.outline.unavailableStatus',
    defaultMessage: 'Not available yet',
    description:
      'Spoken state of one section of a stage editor: it cannot be filled in until something else in the stage has been chosen. Read out after the section’s own name, and never shown on screen.',
  },
}) satisfies Record<SectionOutlineStatus, MessageDescriptor>;

const messages = defineMessages({
  landmark: {
    id: 'protocolBuilder.outline.landmarkLabel',
    defaultMessage: 'Stage sections',
    description:
      'Accessible name of the navigation landmark listing the sections of the stage being edited. A stage is one step of an interview.',
  },
  statusWithProblems: {
    id: 'protocolBuilder.outline.statusWithProblems',
    defaultMessage: '{status}. {problems}',
    description:
      'Read out for a section of a stage editor whose only account of what is wrong is here. status is the section’s spoken state ("Has a problem"); problems is one or more whole sentences describing what the protocol refused, already in the reader’s language. Both are complete sentences, so this is only the punctuation that separates them.',
  },
});

/**
 * Status is carried by an icon AND by words, never by colour alone: the four
 * states are the difference between "you still have work here" and "this is
 * done", which nobody should have to distinguish by hue.
 */
const STATUS_PRESENTATION: Record<
  SectionOutlineStatus,
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
 * The stage editor's section list.
 *
 * One control per section, so a researcher editing a long stage can see how
 * much of it is done and get to any part of it without scrolling. Where there
 * is room it sits alongside the form and stays put while the form scrolls;
 * where there is not, the same list becomes a row of chips above the form.
 * It is the same navigation either way — one implementation, one set of
 * semantics, and nothing that only works at one size.
 */
export default function SectionOutline() {
  const intl = useAppIntl();
  const { outline } = useStageEditorForm();
  const sections = useSyncExternalStore(
    outline.subscribe,
    outline.getSnapshot,
    outline.getServerSnapshot,
  );

  if (sections.length === 0) return null;

  return (
    <nav
      aria-label={intl.formatMessage(messages.landmark)}
      className="@min-[60rem]:sticky @min-[60rem]:top-0 @min-[60rem]:max-h-dvh @min-[60rem]:overflow-y-auto @min-[60rem]:py-14"
    >
      <ol className="flex list-none gap-2 overflow-x-auto p-0 @min-[60rem]:flex-col @min-[60rem]:overflow-visible">
        {sections.map((section) => (
          <li key={section.id} className="shrink-0">
            <SectionOutlineItem section={section} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SectionOutlineItem({ section }: { section: OutlineSection }) {
  const intl = useAppIntl();
  const status = useFormStore((state) =>
    sectionOutlineStatus(section, {
      getFieldState: (name) => state.getFieldState(name),
      getFieldErrors: (name) => state.getFieldErrors(name),
    }),
  );
  // Asked separately, and as a boolean, because a selector answering with an
  // object would hand the store a new value on every read.
  const hasFieldError = useFormStore((state) =>
    section.fields.some(
      (field) => (state.getFieldErrors(field.name)?.length ?? 0) > 0,
    ),
  );
  const presentation = STATUS_PRESENTATION[status];
  const StatusIcon = presentation.icon;
  // The section's own words come first. A control showing a message beside
  // itself has already said what is wrong in the vocabulary of the thing being
  // edited, and repeating the schema's version of it underneath would be two
  // accounts of one fault. The session's words are added only when nothing
  // else on the page can explain the state — a reference to a resource the
  // protocol does not have, a type a collaborator deleted — because then this
  // is the only place it is written down.
  //
  // The problems are DECODED here rather than read as they were stored: the
  // outline store has no reader, so each one arrives as an encoded descriptor
  // (`schemaProblemSentence`) — or as a plain sentence a host or the protocol
  // schema wrote, which the same call passes through untouched.
  const statusLabel = intl.formatMessage(presentation.label);
  const announced =
    status === 'error' && !hasFieldError && section.issues.length > 0
      ? intl.formatMessage(messages.statusWithProblems, {
          status: statusLabel,
          // Joined with a space rather than through `formatList`: these are
          // whole sentences in sequence, not the members of a list, and "a, b
          // and c" would read them as one thing that is three ways wrong.
          problems: section.issues
            .map((issue) => formatMessageError(issue, intl) ?? issue)
            .join(' '),
        })
      : statusLabel;

  return (
    <button
      type="button"
      onClick={() => focusSection(section.id)}
      className="focusable flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-current/5"
    >
      <StatusIcon
        aria-hidden
        className={cx('size-4 shrink-0', presentation.className)}
      />
      <span className="truncate">{section.title}</span>
      {/*
        The status, and — when the problem is one only the session can see —
        what it is. A dangling resource reference has no field showing a
        message beside it, so the outline is the only place it is written down,
        and reading it must not depend on seeing the colour of an icon.
      */}
      <span className="sr-only">{announced}</span>
    </button>
  );
}

/**
 * Moves focus to the section rather than only scrolling to it, so a keyboard
 * or screen-reader user actually arrives: the section element is a region
 * named by its own heading, so taking focus announces which section this is.
 */
function focusSection(sectionId: string): void {
  const section = document.getElementById(sectionId);
  if (section === null) return;
  section.focus({ preventScroll: true });
  // Focus alone would scroll abruptly, so the smooth journey is the
  // enhancement and arriving is the guarantee.
  section.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
