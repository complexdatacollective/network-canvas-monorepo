import { createElement } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorController } from './controller.ts';
import type {
  StageEditorComponent,
  StageEditorRegistry,
} from './stage-editor-contract.ts';
import { stageEditorRegistry } from './stageEditorRegistry.ts';

/**
 * Thrown when the session holds a stage no family has claimed.
 *
 * A host cannot recover from this — there is no editor to fall back to, and
 * rendering nothing would leave a researcher looking at an empty page with no
 * account of why — so it is thrown rather than reported, and the message names
 * the interface so the report a host collects says which one is missing.
 */
export class UnregisteredStageTypeError extends Error {
  readonly stageType: StageType;

  constructor(stageType: StageType) {
    super(
      `No stage editor is registered for the "${stageType}" interface, so it cannot be edited here.`,
    );
    this.stageType = stageType;
    this.name = 'UnregisteredStageTypeError';
  }
}

export type StageEditorProps = Readonly<{
  controller: StageEditorController;
  /**
   * The editors to dispatch through. Defaults to the package's own composed
   * registry; a host supplies its own only to add or replace an interface it
   * owns.
   */
  registry?: StageEditorRegistry | Partial<StageEditorRegistry>;
}>;

/**
 * Renders the editor for whichever stage the session is editing.
 *
 * The stage type is read from the session rather than taken as a prop, because
 * it is session-owned identity: a host that could pass a different one could
 * render a Sociogram editor over a name generator's document.
 */
export default function StageEditor({
  controller,
  registry = stageEditorRegistry,
}: StageEditorProps) {
  return (
    <NamedStageEditor
      registry={registry}
      controller={controller}
      stageType={controller.snapshot.editedSection.identity.type}
    />
  );
}

/**
 * Generic in the stage type so the registry lookup and the props it produces
 * are the same type.
 *
 * Doing it inline would index the registry with the whole `StageType` union
 * and get a union of components back, which nothing can be rendered from
 * without asserting one of them — an assertion that would go on compiling
 * after a family started registering an editor for the wrong type.
 */
function NamedStageEditor<T extends StageType>({
  registry,
  controller,
  stageType,
}: Readonly<{
  registry: Partial<StageEditorRegistry>;
  controller: StageEditorController;
  stageType: T;
}>) {
  const Editor: StageEditorComponent<T> | undefined = registry[stageType];
  if (Editor === undefined) throw new UnregisteredStageTypeError(stageType);
  // `createElement` rather than JSX: the element type is still generic here,
  // and JSX resolves a component's accepted props through machinery that
  // cannot see through an unresolved type parameter.
  return createElement(Editor, { controller, stageType });
}
