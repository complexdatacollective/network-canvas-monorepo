import type { ComponentType, ReactNode } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorController } from './controller.ts';
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
  controller: StageEditorController;
  formId: string;
  readOnly: boolean;
}>;

export type StageEditorActions = (
  context: StageEditorActionContext,
) => ReactNode;

export type StageEditorProps<T extends StageType = StageType> = {
  controller: StageEditorController;
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

export type StageEditorDispatcherProps = {
  controller: StageEditorController;
  registry: StageEditorRegistry;
};

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
