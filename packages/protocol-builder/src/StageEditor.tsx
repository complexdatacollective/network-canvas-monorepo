import { createElement } from 'react';

import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorController } from './controller.ts';
import type {
  StageEditorActions,
  StageEditorComponent,
  StageEditorRegistry,
} from './stage-editor-contract.ts';
import { stageEditorRegistry } from './stageEditorRegistry.ts';

export type StageEditorProps = Readonly<{
  controller: StageEditorController;
  /**
   * The editors to dispatch through. Defaults to the package's own composed
   * registry; a host supplies its own only to add or replace an interface it
   * owns.
   *
   * A WHOLE registry, never a subset. There is no editor to fall back to and
   * nothing sensible to render in place of one, so "this interface has no
   * editor" is not a state a researcher can be put into — it is a state the
   * type system refuses to describe. A host replacing one interface writes
   * `{ ...stageEditorRegistry, Sociogram: itsOwn }`, which is still complete;
   * a host that has genuinely lost an entry finds out where it composed its
   * registry rather than where a researcher opened a stage.
   */
  registry?: StageEditorRegistry;
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
  registry = stageEditorRegistry,
  actions,
}: StageEditorProps) {
  return (
    <NamedStageEditor
      registry={registry}
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
  registry: StageEditorRegistry;
  controller: StageEditorController;
  stageType: T;
  actions?: StageEditorActions;
}>) {
  // Total, so there is nothing to check: `StageEditorRegistry` has an entry
  // for every `StageType`, and `stageEditorRegistry`'s own annotation is what
  // proves the package's registry is one.
  const Editor: StageEditorComponent<T> = registry[stageType];
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
