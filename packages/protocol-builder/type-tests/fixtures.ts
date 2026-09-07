import type { StageEditorComponent } from '../src/stage-editor-contract.ts';

/**
 * Stand-in editors for the coverage probes.
 *
 * A stage editor is a component, and a component that renders nothing is still
 * one — which is all these files need. Written without JSX so the fixture
 * stays plain `.ts`: what is under test is the type system's account of which
 * interfaces a family claims, and nothing here renders.
 */
export const InformationEditor: StageEditorComponent<'Information'> = () =>
  null;

export const EgoFormEditor: StageEditorComponent<'EgoForm'> = () => null;
