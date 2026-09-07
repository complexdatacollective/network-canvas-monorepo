import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { stageEditorRegistry } from '../../stageEditorRegistry.ts';
import { fixtureStageIds } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { AlterEdgeFormStageEditor } from '../forms/AlterEdgeFormStageEditor.tsx';
import { AlterFormStageEditor } from '../forms/AlterFormStageEditor.tsx';
import { EgoFormStageEditor } from '../forms/EgoFormStageEditor.tsx';
import { InformationStageEditor } from '../forms/InformationStageEditor.tsx';

/** See each editor's own test for why the rich-text editor is stood in for. */
vi.mock('../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

/**
 * Every interface this family claims, the editor that claims it, and the
 * fixture stage a host would open on it.
 *
 * Written out rather than derived from the parts, because the parts are what
 * is under test: a table read out of `formStageEditors` would agree with it
 * whatever it said, including after a family registered an editor under the
 * wrong interface. Which interfaces each part claims is its own test, in
 * `familyPartsLoadAlone.test.ts`.
 */
const CLAIMS = [
  {
    stageType: 'AlterEdgeForm',
    stageId: 'alter-edge-form-1',
    label: 'Alter Edge Form',
    editor: AlterEdgeFormStageEditor,
  },
  {
    stageType: 'AlterForm',
    stageId: 'alter-form-1',
    label: 'Alter Form',
    editor: AlterFormStageEditor,
  },
  {
    stageType: 'EgoForm',
    stageId: 'ego-form-1',
    label: 'Ego Form',
    editor: EgoFormStageEditor,
  },
  {
    stageType: 'Information',
    stageId: 'information-1',
    label: 'Information',
    editor: InformationStageEditor,
  },
] as const;

/**
 * What a host gets for each interface this family owns.
 *
 * The editors are tested one at a time elsewhere; this is about the wiring
 * between them and the package. A family that exports a part nobody added to
 * `REGISTRY_PARTS`, or that registers an editor under a neighbouring
 * interface, has editors that all pass their own tests and a researcher who
 * opens the wrong one — or none at all.
 */
describe('the interfaces the form family claims', () => {
  it.each(CLAIMS)(
    'resolves $stageType to this family’s editor',
    ({ stageType, editor }) => {
      expect(stageEditorRegistry[stageType]).toBe(editor);
    },
  );

  /**
   * And the dispatcher reaches it: no registry is passed, so the stage type is
   * looked up in the package's own composed registry exactly as it is in a
   * host. The stage's own name proves the editor was mounted over the stage
   * that was opened rather than over a blank one.
   */
  it.each(CLAIMS)(
    'opens $stageId through the package dispatcher',
    ({ stageId, label }) => {
      renderStageEditor({ stageId });

      expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
        label,
      );
    },
  );

  /**
   * Orientation is not an interface's own decision.
   *
   * The position line belongs to the shell every editor composes rather than
   * to any one family, so a researcher is told where they are in the interview
   * on the same terms whichever stage they clicked in the timeline. It is read
   * from the protocol the editor is already holding, so the expected number is
   * derived from the stage order rather than written out here.
   */
  it.each(CLAIMS)(
    'says where $stageId sits in the interview',
    ({ stageId }) => {
      const order = fixtureStageIds();
      renderStageEditor({ stageId });

      expect(
        screen.getByText(
          `Stage ${order.indexOf(stageId) + 1} of ${order.length}`,
        ),
      ).toBeInTheDocument();
    },
  );
});
