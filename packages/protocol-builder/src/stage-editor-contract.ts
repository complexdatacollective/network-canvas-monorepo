import type { ComponentType, ReactNode } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import { STAGE_TYPES } from './stage-types.ts';

/**
 * How far along one section of the stage being edited is.
 *
 * Availability is a property of the section itself, so it is decided before
 * any field is consulted. The other three are read off the fields the section
 * currently has on screen, in that order of severity.
 */
export type StageSectionStatus =
  | 'error'
  | 'incomplete'
  | 'complete'
  | 'switchedOff'
  | 'unavailable';

/**
 * What one section of the stage being edited is, as a host reads it.
 *
 * The package owns the form, so it is the only thing that can say which
 * sections are mounted, what each is called, how far along it is, and what is
 * wrong with it that nothing on the page already says. Where that list is
 * DRAWN — beside the form, above it, in an inspector, or nowhere — belongs to
 * the host, which owns the page the editor sits in.
 */
export type StageSection = Readonly<{
  /** The DOM id of the section's own element, for `focusStageSection`. */
  id: string;
  title: string;
  status: StageSectionStatus;
  /**
   * What the protocol refused about this section that no field of it is
   * already showing, as encoded descriptors a host decodes with
   * `formatMessageError`.
   *
   * Empty unless the status is `error`. A section that is switched off or not
   * available yet has the schema's opinion of it suppressed — a stage still
   * waiting on its subject is wrong at almost every path it will eventually
   * own — and reading out the sentences behind that would bury the one choice
   * that unlocks the rest.
   */
  problems: readonly string[];
}>;

/**
 * The sections of the open stage editor, as an external store.
 *
 * A store rather than a value on the context because the slot is called inside
 * the form: a snapshot there would re-render the whole form body on every
 * keystroke, which is the cost a host's draft publisher already subscribes
 * rather than renders to avoid. A host reads this with `useSyncExternalStore`
 * and re-renders only its own list.
 */
export type StageSectionsStore = Readonly<{
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly StageSection[];
  getServerSnapshot: () => readonly StageSection[];
}>;

/**
 * What a host needs to render its own action chrome for the editor.
 *
 * The package owns the form and knows whether it can be submitted; the host
 * owns where the buttons live and what else sits beside them. `formId` is the
 * whole contract for a submit control rendered outside the form element.
 *
 * Declared here rather than beside the shell that calls it, because it is part
 * of what a named editor takes — and the contract is a module of types, which
 * a host can read without dragging a component tree into its own program.
 */
export type StageEditorActionContext = Readonly<{
  formId: string;
  readOnly: boolean;
  /**
   * The sections of the stage on screen, resolved against the form.
   *
   * The slot is called inside the form's own provider, so chrome rendered here
   * can subscribe to this and draw the list wherever the host's page has room
   * for it — the package draws no list of its own.
   */
  sections: StageSectionsStore;
}>;

export type StageEditorActions = (
  context: StageEditorActionContext,
) => ReactNode;

export type StageEditorProps<T extends StageType = StageType> = {
  stageType: T;
  /**
   * The host's action chrome, which the editor passes straight through to the
   * shell.
   *
   * An editor that swallowed the slot would leave a host no way to render a
   * submit control at all — so it belongs to every named editor rather than to
   * each family's own props type.
   *
   * Optional, and that is load-bearing twice over: a spectator view needs no
   * chrome, and a component whose `actions` were required would not be
   * assignable to `StageEditorComponent<T>` — the dispatcher renders an editor
   * with whatever a host gave it, which may be nothing.
   */
  actions?: StageEditorActions;
};

export type StageEditorComponent<T extends StageType = StageType> =
  ComponentType<StageEditorProps<T>>;

/** A schema member cannot exist without a named editor entry. */
export type StageEditorRegistry = {
  readonly [T in StageType]: StageEditorComponent<T>;
};

/**
 * What one editor family exports: the entries it owns, and nothing else.
 *
 * A family is a group of interfaces that share their hard parts — the three
 * name generators share prompts, panels and alter limits; the two bin
 * interfaces share a variable picker and a sort-order editor — so a family
 * ships as one unit and claims the stage types it covers. Nothing requires the
 * families to know about each other, and nothing requires `stageEditorRegistry`
 * to know how any of them is built.
 */
export type StageEditorRegistryPart = Partial<StageEditorRegistry>;

export function defineStageEditorRegistry<T extends StageEditorRegistry>(
  registry: T,
): T {
  return registry;
}

export function missingStageEditors(
  registry: Partial<StageEditorRegistry>,
): StageType[] {
  return STAGE_TYPES.filter((stageType) => registry[stageType] === undefined);
}

export { STAGE_TYPES } from './stage-types.ts';
