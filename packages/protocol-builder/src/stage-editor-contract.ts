import type { ComponentType } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorController } from './controller.ts';
import { STAGE_TYPES } from './stage-types.ts';

export type StageEditorProps<T extends StageType = StageType> = {
  controller: StageEditorController;
  stageType: T;
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
