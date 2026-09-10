import type { ComponentType, ReactNode } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import { STAGE_TYPES } from './stage-types.ts';

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
