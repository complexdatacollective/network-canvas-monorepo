import type { ComponentType } from 'react';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { StageType } from '@codaco/protocol-validation';

import type { StageEditorActionContext } from '../../../form/StageEditorShell.tsx';
import type {
  StageEditorComponent,
  StageEditorProps,
} from '../../../stage-editor-contract.ts';

/**
 * The host chrome these tests put in the editor's action slot.
 *
 * Deliberately NOT disabled while the session is read-only. A control the
 * researcher cannot press proves nothing about what happens when the session
 * refuses a write, and the refusal is the behaviour under test: the editor has
 * to say the stage was not saved, not merely be impossible to submit.
 */
const saveActions = ({ formId }: StageEditorActionContext) => (
  <SubmitButton form={formId}>Save stage</SubmitButton>
);

/**
 * One named editor as the harness mounts it.
 *
 * The harness's `editor` slot takes the registry's own contract, which is
 * generic over every stage type, while a named editor declares the one
 * interface it edits — so each is wrapped with the type it claims and the host
 * chrome a host would supply.
 *
 * A function each test calls with its own editor, rather than a module listing
 * all four: one of these interfaces draws a map, and a shared list would pull
 * the Mapbox SDK into the module graph of three test files that never go near
 * one. `mapboxIsAlwaysMocked` reads that graph, and it should report what is
 * actually reachable.
 */
export function harnessEditor<T extends StageType>(
  Editor: ComponentType<StageEditorProps<T>>,
  stageType: T,
): StageEditorComponent {
  return function HarnessEditor({ controller }) {
    return (
      <Editor
        controller={controller}
        stageType={stageType}
        actions={saveActions}
      />
    );
  };
}
