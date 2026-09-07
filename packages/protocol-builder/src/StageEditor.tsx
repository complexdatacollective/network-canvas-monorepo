import { createElement, useMemo } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorController } from './controller.ts';
import type {
  StageEditorActions,
  StageEditorComponent,
  StageEditorRegistry,
} from './stage-editor-contract.ts';
import {
  stageEditorRegistry,
  stageEditorsWithHostOverrides,
} from './stageEditorRegistry.ts';

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
   * Editors of the host's own, merged OVER the package's composed registry:
   * the entries it names are the host's, and every other interface keeps the
   * editor the package ships. A host supplies this to add an interface it owns
   * or to replace one it wants to render differently, never to take the rest
   * away — see `stageEditorsWithHostOverrides`.
   *
   * The dispatcher PR that lands after the families makes the registry TOTAL —
   * every schema member has an editor, and `StageEditorRegistry` can be
   * required rather than partial — and will revisit this prop. Whatever it
   * becomes, the rule it has to keep is this one: a host never loses a
   * built-in editor by supplying one of its own.
   */
  registry?: StageEditorRegistry | Partial<StageEditorRegistry>;
  /**
   * The host's action chrome, handed to whichever editor this dispatches to.
   *
   * A host that reaches an editor through the dispatcher never names the
   * component, so this is the only route its own save button has into the
   * editor's slot.
   */
  actions?: StageEditorActions;
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
  registry,
  actions,
}: StageEditorProps) {
  const editors = useMemo(
    () => stageEditorsWithHostOverrides(stageEditorRegistry, registry),
    [registry],
  );

  return (
    <NamedStageEditor
      registry={editors}
      controller={controller}
      stageType={controller.snapshot.editedSection.identity.type}
      {...(actions === undefined ? {} : { actions })}
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
  actions,
}: Readonly<{
  registry: Partial<StageEditorRegistry>;
  controller: StageEditorController;
  stageType: T;
  actions?: StageEditorActions;
}>) {
  const Editor: StageEditorComponent<T> | undefined = registry[stageType];
  if (Editor === undefined) throw new UnregisteredStageTypeError(stageType);
  // `createElement` rather than JSX: the element type is still generic here,
  // and JSX resolves a component's accepted props through machinery that
  // cannot see through an unresolved type parameter.
  return createElement(Editor, {
    controller,
    stageType,
    // Spread rather than passed as `undefined`: the slot's absence is what
    // says a host rendered no chrome, and an editor forwarding an explicit
    // `undefined` into the shell says the same thing in a way the prop's type
    // does not admit.
    ...(actions === undefined ? {} : { actions }),
  });
}
