import type {
  StageSection,
  StageSectionsStore,
} from '../stage-editor-contract.ts';
import {
  type OutlineSection,
  type SectionFieldReader,
  type SectionOutlineStore,
  sectionOutlineStatus,
} from './outlineStore.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

const NO_SECTIONS: readonly StageSection[] = Object.freeze([]);
const NO_PROBLEMS: readonly string[] = Object.freeze([]);

/**
 * Resolves the editor's own section registry against its form store.
 *
 * Status, and which problems a control is already stating beside itself, are
 * both answers only the form can give, and the form is the one thing a host
 * has no route to. Resolving them here is what lets a host render the list
 * with nothing but a reader for the sentences.
 */
export function createStageSectionsStore(
  outline: SectionOutlineStore,
  storeApi: StageFormStoreApi,
): StageSectionsStore {
  const listeners = new Set<() => void>();
  let cached: readonly StageSection[] = NO_SECTIONS;
  let stopWatching: (() => void) | undefined;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const resolve = (): readonly StageSection[] => {
    const state = storeApi.getState();
    const reader: SectionFieldReader = {
      getFieldState: (name) => state.getFieldState(name),
      getFieldErrors: (name) => state.getFieldErrors(name),
    };
    const next = outline.getSnapshot().map((section) => {
      const status = sectionOutlineStatus(section, reader);
      return Object.freeze({
        id: section.id,
        title: section.title,
        status,
        problems:
          status === 'error' ? unexplained(section, reader) : NO_PROBLEMS,
      });
    });
    // The snapshot is re-derived on every read and only its IDENTITY is kept:
    // `useSyncExternalStore` re-renders whenever the reference moves, so a
    // fresh array per read would re-render a host's list on every keystroke —
    // and, read during render, would never settle.
    return same(cached, next) ? cached : Object.freeze(next);
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      // Watched only while somebody is looking. A host that renders no section
      // list — Studio today, and every editor test — leaves this store idle
      // rather than resolving every section on every keystroke for nobody.
      stopWatching ??= watch(outline, storeApi, notify);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopWatching?.();
        stopWatching = undefined;
      };
    },
    getSnapshot: () => {
      cached = resolve();
      return cached;
    },
    /** Server rendering has no DOM to read sections off, so there are none. */
    getServerSnapshot: () => NO_SECTIONS,
  };
}

function watch(
  outline: SectionOutlineStore,
  storeApi: StageFormStoreApi,
  notify: () => void,
): () => void {
  // Both, because the two halves of an entry come from two places: which
  // sections exist, what they are called and what the schema refused are the
  // outline's, and whether a field is answered or invalid is the form's.
  const fromOutline = outline.subscribe(notify);
  const fromForm = storeApi.subscribe(notify);
  return () => {
    fromOutline();
    fromForm();
  };
}

/**
 * The problems this section answers for that no control of it is stating.
 *
 * Asked per PROBLEM rather than per section: a section can be wrong in two
 * ways at once — a required control left empty and a reference to a resource
 * the protocol does not have — and only the second has nowhere else to be
 * said. Suppressing every sentence because some other field of the same
 * section is unhappy leaves a reader with "has a problem" and no way to find
 * out what it was.
 */
function unexplained(
  section: OutlineSection,
  reader: SectionFieldReader,
): readonly string[] {
  const sentences = section.issues
    .filter(
      (issue) => (reader.getFieldErrors(issue.fieldName)?.length ?? 0) === 0,
    )
    .map((issue) => issue.sentence);
  return sentences.length === 0 ? NO_PROBLEMS : Object.freeze(sentences);
}

function same(a: readonly StageSection[], b: readonly StageSection[]): boolean {
  return (
    a.length === b.length &&
    a.every((section, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        section.id === other.id &&
        section.title === other.title &&
        section.status === other.status &&
        section.problems.length === other.problems.length &&
        section.problems.every(
          (problem, position) => problem === other.problems[position],
        )
      );
    })
  );
}

/**
 * Moves focus to a section rather than only scrolling to it, so a keyboard or
 * screen-reader user actually arrives: the section element is a region named
 * by its own heading, so taking focus announces which section this is.
 */
export function focusStageSection(sectionId: string): void {
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
