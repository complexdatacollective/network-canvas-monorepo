import { createElement, useMemo } from 'react';

import type { StageType } from '@codaco/protocol-validation';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';

import { ResourceClientProvider } from './resources/client.tsx';
import type {
  StageEditorActions,
  StageEditorComponent,
  StageEditorRegistry,
} from './stage-editor-contract.ts';
import {
  StageEditSession,
  useStageEdit,
  type StageEditTarget,
} from './stageEdit.tsx';
import {
  stageEditorRegistry,
  stageEditorsWithHostOverrides,
} from './stageEditorRegistry.ts';

/**
 * Thrown when the stage under edit is an interface no family has claimed.
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
  /**
   * Which stage to open: the section id of one the protocol holds, or the
   * interface and position of one it does not hold yet.
   */
  target: StageEditTarget;
  /**
   * Editors of the host's own, merged OVER the package's composed registry:
   * the entries it names are the host's, and every other interface keeps the
   * editor the package ships. A host supplies this to add an interface it owns
   * or to replace one it wants to render differently, never to take the rest
   * away — see `stageEditorsWithHostOverrides`.
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
  /** The DOM id of the stage form, when the host wants to name it. */
  formId?: string;
  /**
   * Which edit this is, when the host wants to name it. One is minted for
   * every editor otherwise, which is what keeps a second editor open in the
   * same session from reaching this one's imported files.
   */
  editId?: string;
  /** Told which section the stage landed in, once a save has been accepted. */
  onSaved?: (sectionId: ProtocolSectionId) => void;
}>;

/**
 * Opens one stage and renders the editor its interface is registered under.
 *
 * The interface comes from the stage the host opened rather than from a prop of
 * its own: a host that could pass a different one could render a Sociogram
 * editor over a name generator's document.
 */
export default function StageEditor({
  target,
  registry,
  actions,
  formId,
  editId,
  onSaved,
}: StageEditorProps) {
  return (
    // Keyed by which stage this is, because a host changes `target` on the
    // element it already has: Studio selects another screen in its outline
    // and React keeps this provider, its edit id and everything staged under
    // it. The files the researcher imported while writing the FIRST stage
    // would then be promoted by the second stage's save — committed into the
    // protocol's manifest with nothing referring to them — and the discard
    // that ends an edit, which only runs on unmount, would never run for the
    // stage they were imported for. Remounting is what ends that edit: its
    // staging is discarded and the next stage opens with nothing staged.
    <ResourceClientProvider
      key={editKey(target)}
      {...(editId === undefined ? {} : { editId })}
    >
      <StageEditSession
        target={target}
        {...(formId === undefined ? {} : { formId })}
        {...(onSaved === undefined ? {} : { onSaved })}
      >
        <OpenStageEditor
          {...(registry === undefined ? {} : { registry })}
          {...(actions === undefined ? {} : { actions })}
        />
      </StageEditSession>
    </ResourceClientProvider>
  );
}

/**
 * Which stage an edit is of, for as long as the host keeps it open.
 *
 * Read out of the target's own values rather than taken from its identity: a
 * host writes the target inline, so the object is a different one on every
 * render and would remount the edit continuously. A stage being ADDED is
 * keyed by its interface alone — its position may move while the researcher
 * composes it, and moving it is not opening a different edit.
 */
function editKey(target: StageEditTarget): string {
  return 'sectionId' in target ? target.sectionId : `new:${target.stageType}`;
}

function OpenStageEditor({
  registry,
  actions,
}: Readonly<{
  registry?: StageEditorRegistry | Partial<StageEditorRegistry>;
  actions?: StageEditorActions;
}>) {
  const { identity } = useStageEdit();
  const editors = useMemo(
    () => stageEditorsWithHostOverrides(stageEditorRegistry, registry),
    [registry],
  );

  // The stage has not arrived yet, so there is no interface to dispatch on.
  if (identity === undefined) return null;

  return (
    <NamedStageEditor
      registry={editors}
      stageType={identity.type}
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
  stageType,
  actions,
}: Readonly<{
  registry: Partial<StageEditorRegistry>;
  stageType: T;
  actions?: StageEditorActions;
}>) {
  const Editor: StageEditorComponent<T> | undefined = registry[stageType];
  if (Editor === undefined) throw new UnregisteredStageTypeError(stageType);
  // `createElement` rather than JSX: the element type is still generic here,
  // and JSX resolves a component's accepted props through machinery that
  // cannot see through an unresolved type parameter.
  return createElement(Editor, {
    stageType,
    // Spread rather than passed as `undefined`: the slot's absence is what
    // says a host rendered no chrome, and an editor forwarding an explicit
    // `undefined` into the shell says the same thing in a way the prop's type
    // does not admit.
    ...(actions === undefined ? {} : { actions }),
  });
}
