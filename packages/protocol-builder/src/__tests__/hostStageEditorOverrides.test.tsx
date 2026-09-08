import { describe, expect, it, vi } from 'vitest';

import type {
  StageEditorComponent,
  StageEditorProps,
} from '../stage-editor-contract.ts';
import type * as stageEditorRegistryModule from '../stageEditorRegistry.ts';
import { stageEditorRegistry } from '../stageEditorRegistry.ts';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';

/**
 * The package registry, standing in for the real one so the assertions below
 * read off simple, recognizable text rather than whatever markup the real
 * `EgoForm` and `Information` editors happen to render.
 *
 * Only the composed registry is replaced; every other export of this module
 * is the real one.
 *
 * The editors are built with `createElement` rather than JSX because this
 * factory runs while the module graph is still being evaluated, before this
 * file's own imports are guaranteed to have run.
 */
vi.mock('../stageEditorRegistry.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof stageEditorRegistryModule>();
  const { createElement } = await import('react');
  return {
    ...actual,
    stageEditorRegistry: Object.freeze({
      EgoForm: () => createElement('p', null, 'the package EgoForm editor'),
      Information: () =>
        createElement('p', null, 'the package Information editor'),
    }),
  };
});

const HostInformationEditor: StageEditorComponent<'Information'> = ({
  stageType,
}: StageEditorProps<'Information'>) => <p>the host {stageType} editor</p>;

/**
 * A host builds its registry by spreading the package's own and naming the
 * interface it is replacing or adding — `{ ...stageEditorRegistry, Information:
 * itsOwn }` — never by writing down only the interface it owns.
 *
 * `StageEditor` takes a WHOLE `StageEditorRegistry`, so a host that wrote
 * `{ Information: itsOwn }` on its own would not compile: the type system
 * refuses the state a runtime merge-over used to have to guard against — a
 * host naming one interface losing every other stage to
 * `UnregisteredStageTypeError`. Spreading keeps the guarantee this test is
 * really about — a host never loses a built-in editor by supplying one of its
 * own — but makes it a fact about the object literal rather than about a
 * function call.
 */
describe('a host registry built by spreading the package’s own', () => {
  const hostRegistry = {
    ...stageEditorRegistry,
    Information: HostInformationEditor,
  };

  it('keeps the package editor for the interfaces it does not name', () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      registry: hostRegistry,
    });

    expect(harness.getByText('the package EgoForm editor')).toBeInTheDocument();
  });

  it('is what edits the interface it does name', () => {
    const harness = renderStageEditor({
      stageId: 'information-1',
      registry: hostRegistry,
    });

    expect(
      harness.getByText('the host Information editor'),
    ).toBeInTheDocument();
  });

  it('leaves the package registry alone when a host supplies none', () => {
    const harness = renderStageEditor({ stageId: 'information-1' });

    expect(
      harness.getByText('the package Information editor'),
    ).toBeInTheDocument();
  });
});
