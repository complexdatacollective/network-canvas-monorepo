import type { FieldState } from '@codaco/fresco-ui/form/store/types';

import { isBlankFieldValue } from './blankValue.ts';

/**
 * What the outline says about one section.
 *
 * Availability is a property of the section itself, so it is decided before
 * any field is consulted. The other three are read off the fields the section
 * currently has registered, in that order of severity.
 */
export type SectionOutlineStatus =
  | 'error'
  | 'incomplete'
  | 'complete'
  | 'switchedOff'
  | 'unavailable';

/**
 * Why a section is not asking for input.
 *
 * `switchedOff` is the researcher's decision — an optional capability they
 * turned off. `unavailable` is the stage's own state: something the section
 * depends on has not been chosen yet. They are not interchangeable, and
 * neither of them describes a session that is merely read-only, where every
 * section still has real progress worth reporting.
 */
export type SectionAvailability = 'available' | 'switchedOff' | 'unavailable';

export type OutlineFieldRegistration = Readonly<{
  name: string;
  /** What the field calls itself — the name a host's problem panel uses. */
  label: string;
  /** Whether this field must hold a value for its section to be complete. */
  required: boolean;
}>;

export type OutlineSection = Readonly<{
  id: string;
  title: string;
  availability: SectionAvailability;
  fields: readonly OutlineFieldRegistration[];
}>;

type SectionRecord = {
  id: string;
  title: string;
  availability: SectionAvailability;
  element: HTMLElement | null;
};

const EMPTY_SECTIONS: readonly OutlineSection[] = Object.freeze([]);

/**
 * The sections and fields currently mounted in one stage editor, in the order
 * they appear on the page.
 *
 * An external store rather than React state: every field registers itself as
 * it mounts, and a stage editor mounts dozens of them. Routing that through
 * component state would re-render the whole form once per field, while the
 * only thing that actually needs the list is the outline.
 */
export class SectionOutlineStore {
  private readonly listeners = new Set<() => void>();
  private readonly sections = new Map<string, SectionRecord>();
  /**
   * Kept apart from the sections, and keyed by section id, because a field
   * registers BEFORE the section around it does: React runs a child's effects
   * before its parent's. A field arriving early would otherwise have nowhere
   * to go, and the outline would report every section as having no fields at
   * all — which reads as "finished".
   */
  private readonly fieldsBySection = new Map<
    string,
    Map<string, OutlineFieldRegistration>
  >();
  private cachedSnapshot: readonly OutlineSection[] = EMPTY_SECTIONS;
  private cachedVersion = -1;
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly OutlineSection[] => {
    if (this.cachedVersion === this.version) return this.cachedSnapshot;
    this.cachedVersion = this.version;
    this.cachedSnapshot = Object.freeze(
      this.orderedRecords().map((record) =>
        Object.freeze({
          id: record.id,
          title: record.title,
          availability: record.availability,
          fields: Object.freeze([
            ...(this.fieldsBySection.get(record.id)?.values() ?? []),
          ]),
        }),
      ),
    );
    return this.cachedSnapshot;
  };

  /** Server rendering has no DOM to order by, so the outline starts empty. */
  getServerSnapshot = (): readonly OutlineSection[] => EMPTY_SECTIONS;

  registerSection(
    section: Readonly<{ id: string; title: string }>,
  ): () => void {
    const existing = this.sections.get(section.id);
    if (existing) {
      // A section re-registering keeps the fields already inside it: in
      // StrictMode the effect runs twice around one mount, and the fields
      // beneath it do not remount in between.
      existing.title = section.title;
    } else {
      this.sections.set(section.id, {
        id: section.id,
        title: section.title,
        availability: 'available',
        element: null,
      });
    }
    this.changed();
    return () => {
      this.sections.delete(section.id);
      this.fieldsBySection.delete(section.id);
      this.changed();
    };
  }

  setSectionTitle(id: string, title: string): void {
    const record = this.sections.get(id);
    if (!record || record.title === title) return;
    record.title = title;
    this.changed();
  }

  setSectionElement(id: string, element: HTMLElement | null): void {
    const record = this.sections.get(id);
    if (!record || record.element === element) return;
    record.element = element;
    this.changed();
  }

  setSectionAvailability(id: string, availability: SectionAvailability): void {
    const record = this.sections.get(id);
    if (!record || record.availability === availability) return;
    record.availability = availability;
    this.changed();
  }

  registerField(
    sectionId: string,
    field: OutlineFieldRegistration,
  ): () => void {
    let fields = this.fieldsBySection.get(sectionId);
    if (fields === undefined) {
      fields = new Map();
      this.fieldsBySection.set(sectionId, fields);
    }
    fields.set(field.name, field);
    this.changed();
    return () => {
      // Only drop the entry this registration owns. A field that remounts
      // under the same name has already written its own entry by the time the
      // previous cleanup runs.
      if (fields.get(field.name) === field) {
        fields.delete(field.name);
        this.changed();
      }
    };
  }

  private orderedRecords(): SectionRecord[] {
    return [...this.sections.values()].toSorted(compareByDocumentPosition);
  }

  private changed(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

/**
 * Sections are ordered by where they actually sit on the page, not by the
 * order they happened to register in: a section revealed later — an optional
 * capability switched on — must take its place in the reading order rather
 * than being appended to the end of the outline.
 */
function compareByDocumentPosition(a: SectionRecord, b: SectionRecord): number {
  if (a.element === null || b.element === null) {
    // An unmeasured section sorts after measured ones instead of jumping to
    // the top, which would make the outline reorder for one frame.
    return a.element === b.element ? 0 : a.element === null ? 1 : -1;
  }
  const relation = a.element.compareDocumentPosition(b.element);
  if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
  if ((relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  return 0;
}

export type SectionFieldReader = Readonly<{
  getFieldState: (name: string) => FieldState | undefined;
  getFieldErrors: (name: string) => string[] | null;
}>;

export function sectionOutlineStatus(
  section: OutlineSection,
  reader: SectionFieldReader,
): SectionOutlineStatus {
  if (section.availability !== 'available') return section.availability;

  let incomplete = false;
  for (const field of section.fields) {
    const errors = reader.getFieldErrors(field.name);
    if (errors !== null && errors.length > 0) return 'error';
    if (
      field.required &&
      isBlankFieldValue(reader.getFieldState(field.name)?.value)
    ) {
      incomplete = true;
    }
  }

  return incomplete ? 'incomplete' : 'complete';
}
