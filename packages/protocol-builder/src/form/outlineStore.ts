import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import type { FieldState } from '@codaco/fresco-ui/form/store/types';
import type { ObjectPath } from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';

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

/**
 * A problem the SESSION found in the stage, addressed by its path inside the
 * stage document rather than by a form field name.
 *
 * These are the refusals a form field cannot see: a reference to a resource
 * the protocol does not have, a subject naming a type a collaborator deleted,
 * a rule the schema states about the stage as a whole. The path is what makes
 * one attributable — the section that registered a field at, above or below it
 * is the section the researcher has to go to.
 */
export type SectionValidationIssue = Readonly<{
  /** Relative to the stage document: `['prompts', 0, 'variable']`. */
  path: readonly (string | number)[];
  message: string;
}>;

export type OutlineSection = Readonly<{
  id: string;
  title: string;
  availability: SectionAvailability;
  fields: readonly OutlineFieldRegistration[];
  /** Session validation problems this section's fields answer for. */
  issues: readonly string[];
}>;

type SectionRecord = {
  id: string;
  title: string;
  availability: SectionAvailability;
  element: HTMLElement | null;
};

const EMPTY_SECTIONS: readonly OutlineSection[] = Object.freeze([]);
const NO_ISSUES: readonly SectionValidationIssue[] = Object.freeze([]);

/**
 * A registered field's name, read back as the path it is filed under.
 *
 * Canonical parsing rather than legacy, because that is what
 * `formatObjectPath` produced when the field registered: a protocol-authored
 * key containing a dot is one segment, not a route.
 */
function fieldPath(name: string): ObjectPath | null {
  try {
    return resolveFieldPath([], name, 'path');
  } catch {
    return null;
  }
}

function sharedPrefixLength(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) {
    shared += 1;
  }
  return shared;
}

function sameIssues(
  a: readonly SectionValidationIssue[],
  b: readonly SectionValidationIssue[],
): boolean {
  return (
    a.length === b.length &&
    a.every((issue, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        issue.message === other.message &&
        sharedPrefixLength(issue.path, other.path) === issue.path.length &&
        issue.path.length === other.path.length
      );
    })
  );
}

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
  /**
   * The session's own validation problems, as paths into the stage document.
   * Kept whole rather than filed under a section: a field registering later
   * can be the one that claims an issue that arrived before it.
   */
  private validationIssues: readonly SectionValidationIssue[] = NO_ISSUES;
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
    const ordered = this.orderedRecords();
    // Order is re-derived on every read, and only the SNAPSHOT is cached.
    // Sections can be reordered without any of them registering, being
    // renamed, or changing availability — nothing would bump the version — and
    // a cache keyed on the version alone would keep serving an order the page
    // no longer has.
    if (this.cachedVersion === this.version && this.sameOrder(ordered)) {
      return this.cachedSnapshot;
    }
    this.cachedVersion = this.version;
    const issuesBySection = this.attributeIssues(ordered);
    this.cachedSnapshot = Object.freeze(
      ordered.map((record) =>
        Object.freeze({
          id: record.id,
          title: record.title,
          availability: record.availability,
          fields: Object.freeze([
            ...(this.fieldsBySection.get(record.id)?.values() ?? []),
          ]),
          issues: Object.freeze(issuesBySection.get(record.id) ?? []),
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

  /**
   * Re-reads where the sections sit, and tells subscribers if they have moved.
   *
   * Re-deriving the order inside `getSnapshot` is not enough on its own:
   * `useSyncExternalStore` only calls it when something notifies or the
   * component re-renders, and a nested component reordering its own sections
   * does neither to the outline beside it.
   */
  revalidateOrder(): void {
    if (!this.sameOrder(this.orderedRecords())) this.changed();
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

  /**
   * Replaces everything the session currently says is wrong with the stage.
   *
   * The whole set at once, because that is what "cleared" means here: an issue
   * stops being reported by not being in the next set, and a section holding a
   * stale one would go on refusing to say it is finished.
   */
  setValidationIssues(issues: readonly SectionValidationIssue[]): void {
    const next = Object.freeze([...issues]);
    if (sameIssues(this.validationIssues, next)) return;
    this.validationIssues = next;
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

  /**
   * Which section answers for each session issue, by the fields mounted in it.
   *
   * A field claims an issue when one of the two paths runs through the other —
   * the field registered AT the path the schema complained about, at a leaf
   * inside it (a capability whose container is wrong, reported by the controls
   * that make it up), or at a container around it (one compound control owning
   * a whole sub-document). The deepest such field wins, so the section that
   * edits the exact value is preferred over one that merely encloses it, and
   * ties go to whichever section comes first on the page.
   *
   * An issue no mounted field reaches is left unattributed rather than pinned
   * somewhere arbitrary: nothing on this page can be pointed at for it, and it
   * is still reported above the form when the save is refused.
   */
  private attributeIssues(
    ordered: readonly SectionRecord[],
  ): Map<string, string[]> {
    const bySection = new Map<string, string[]>();
    if (this.validationIssues.length === 0) return bySection;

    const registered = ordered.flatMap((record) =>
      [...(this.fieldsBySection.get(record.id)?.values() ?? [])].flatMap(
        (field) => {
          const path = fieldPath(field.name);
          return path === null ? [] : [{ sectionId: record.id, path }];
        },
      ),
    );

    for (const issue of this.validationIssues) {
      let owner: string | undefined;
      let depth = 0;
      for (const field of registered) {
        const shared = sharedPrefixLength(field.path, issue.path);
        if (shared === 0) continue;
        // One path has to run through the other: a field at `subject.type` and
        // an issue at `subject.entity` share a segment without either being
        // about the other.
        if (shared !== Math.min(field.path.length, issue.path.length)) continue;
        if (shared <= depth) continue;
        depth = shared;
        owner = field.sectionId;
      }
      if (owner === undefined) continue;
      const claimed = bySection.get(owner);
      if (claimed === undefined) bySection.set(owner, [issue.message]);
      else claimed.push(issue.message);
    }
    return bySection;
  }

  private sameOrder(ordered: readonly SectionRecord[]): boolean {
    return (
      ordered.length === this.cachedSnapshot.length &&
      ordered.every(
        (record, index) => record.id === this.cachedSnapshot[index]?.id,
      )
    );
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
  // Availability still comes first. A section the researcher cannot type into
  // is not one they can fix anything in, and a stage waiting on a subject has
  // a problem at almost every path it will eventually own — reporting all of
  // them would bury the one choice that unlocks the rest.
  if (section.availability !== 'available') return section.availability;
  // A problem only the session can see outranks the fields, which by
  // definition cannot see it: a dangling resource reference and a deleted
  // codebook type are both values a control accepts and a protocol refuses.
  if (section.issues.length > 0) return 'error';

  let incomplete = false;
  for (const field of section.fields) {
    const errors = reader.getFieldErrors(field.name);
    if (errors !== null && errors.length > 0) return 'error';
    if (
      field.required &&
      isUnanswered(reader.getFieldState(field.name)?.value)
    ) {
      incomplete = true;
    }
  }

  return incomplete ? 'incomplete' : 'complete';
}
