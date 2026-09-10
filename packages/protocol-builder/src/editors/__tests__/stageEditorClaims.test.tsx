import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { stageEditorRegistry } from '../../stageEditorRegistry.ts';
import {
  fixtureStageIds,
  loadFixtureStage,
  type FixtureStageId,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { alterEdgeFormStageEditor } from '../alter-edge-form/AlterEdgeFormStageEditor.ts';
import { alterFormStageEditor } from '../alter-form/AlterFormStageEditor.ts';
import { anonymisationStageEditor } from '../anonymisation/AnonymisationStageEditor.ts';
import { categoricalBinStageEditor } from '../categorical-bin/CategoricalBinStageEditor.ts';
import { dyadCensusStageEditor } from '../dyad-census/DyadCensusStageEditor.ts';
import { egoFormStageEditor } from '../ego-form/EgoFormStageEditor.ts';
import { shimMarkdownEditorMeasurement } from '../family-pedigree/__tests__/editorFixtures.ts';
import { familyPedigreeStageEditor } from '../family-pedigree/FamilyPedigreeStageEditor.ts';
import { geospatialStageEditor } from '../geospatial/GeospatialStageEditor.ts';
import { informationStageEditor } from '../information/InformationStageEditor.ts';
import { nameGeneratorQuickAddStageEditor } from '../name-generator-quick-add/NameGeneratorQuickAddStageEditor.ts';
import { nameGeneratorRosterStageEditor } from '../name-generator-roster/NameGeneratorRosterStageEditor.ts';
import { nameGeneratorStageEditor } from '../name-generator/NameGeneratorStageEditor.ts';
import { narrativePedigreeStageEditor } from '../narrative-pedigree/NarrativePedigreeStageEditor.ts';
import { narrativeStageEditor } from '../narrative/NarrativeStageEditor.ts';
import { networkComposerStageEditor } from '../network-composer/NetworkComposerStageEditor.ts';
import { oneToManyDyadCensusStageEditor } from '../one-to-many-dyad-census/OneToManyDyadCensusStageEditor.ts';
import { ordinalBinStageEditor } from '../ordinal-bin/OrdinalBinStageEditor.ts';
import { sociogramStageEditor } from '../sociogram/SociogramStageEditor.ts';
import { tieStrengthCensusStageEditor } from '../tie-strength-census/TieStrengthCensusStageEditor.ts';

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

shimMarkdownEditorMeasurement();

/**
 * Every interface the package ships an editor for, the part that claims it,
 * and the fixture stage a host would open on it.
 *
 * Written out rather than derived from the parts, because the parts are what
 * is under test: a table read out of a part would agree with it whatever it
 * said, including after an editor was registered under the wrong interface.
 * Which interfaces each part claims is its own test, in
 * `partsLoadAlone.test.ts`.
 *
 * The stage each is opened on is written out for the same reason. Its expected
 * NAME is not: the label belongs to the fixture protocol, not to the wiring
 * this file is about, and reading it back out of the fixture is what makes the
 * assertion "the editor opened over this stage" rather than "the editor opened
 * over something called what somebody typed here".
 */
const CLAIMS = [
  {
    stageType: 'AlterEdgeForm',
    stageId: 'alter-edge-form-1',
    editor: alterEdgeFormStageEditor.AlterEdgeForm,
  },
  {
    stageType: 'AlterForm',
    stageId: 'alter-form-1',
    editor: alterFormStageEditor.AlterForm,
  },
  {
    stageType: 'Anonymisation',
    stageId: 'anonymisation-1',
    editor: anonymisationStageEditor.Anonymisation,
  },
  {
    stageType: 'CategoricalBin',
    stageId: 'categorical-bin-1',
    editor: categoricalBinStageEditor.CategoricalBin,
  },
  {
    stageType: 'DyadCensus',
    stageId: 'dyad-census-1',
    editor: dyadCensusStageEditor.DyadCensus,
  },
  {
    stageType: 'EgoForm',
    stageId: 'ego-form-1',
    editor: egoFormStageEditor.EgoForm,
  },
  {
    stageType: 'FamilyPedigree',
    stageId: 'family-pedigree-1',
    editor: familyPedigreeStageEditor.FamilyPedigree,
  },
  {
    stageType: 'Geospatial',
    stageId: 'geospatial-1',
    editor: geospatialStageEditor.Geospatial,
  },
  {
    stageType: 'Information',
    stageId: 'information-1',
    editor: informationStageEditor.Information,
  },
  {
    stageType: 'NameGenerator',
    stageId: 'name-generator-1',
    editor: nameGeneratorStageEditor.NameGenerator,
  },
  {
    stageType: 'NameGeneratorQuickAdd',
    stageId: 'name-generator-quick-add-1',
    editor: nameGeneratorQuickAddStageEditor.NameGeneratorQuickAdd,
  },
  {
    stageType: 'NameGeneratorRoster',
    stageId: 'name-generator-roster-1',
    editor: nameGeneratorRosterStageEditor.NameGeneratorRoster,
  },
  {
    stageType: 'Narrative',
    stageId: 'narrative-1',
    editor: narrativeStageEditor.Narrative,
  },
  {
    stageType: 'NarrativePedigree',
    stageId: 'narrative-pedigree-1',
    editor: narrativePedigreeStageEditor.NarrativePedigree,
  },
  {
    stageType: 'NetworkComposer',
    stageId: 'network-composer-1',
    editor: networkComposerStageEditor.NetworkComposer,
  },
  {
    stageType: 'OneToManyDyadCensus',
    stageId: 'one-to-many-dyad-census-1',
    editor: oneToManyDyadCensusStageEditor.OneToManyDyadCensus,
  },
  {
    stageType: 'OrdinalBin',
    stageId: 'ordinal-bin-1',
    editor: ordinalBinStageEditor.OrdinalBin,
  },
  {
    stageType: 'Sociogram',
    stageId: 'sociogram-1',
    editor: sociogramStageEditor.Sociogram,
  },
  {
    stageType: 'TieStrengthCensus',
    stageId: 'tie-strength-census-1',
    editor: tieStrengthCensusStageEditor.TieStrengthCensus,
  },
] as const satisfies readonly Readonly<{
  stageType: string;
  stageId: FixtureStageId;
  editor: unknown;
}>[];

/** What the fixture calls that stage, which is what its editor must show. */
const labelOf = (stageId: FixtureStageId): unknown =>
  loadFixtureStage(stageId).fields.label;

/**
 * What a host gets for each interface the package owns.
 *
 * The editors are tested one at a time elsewhere; this is about the wiring
 * between them and the package. A family that exports a part nobody added to
 * `REGISTRY_PARTS`, or that registers an editor under a neighbouring
 * interface, has editors that all pass their own tests and a researcher who
 * opens the wrong one — or none at all.
 */
describe('the interfaces the package’s editors claim', () => {
  it.each(CLAIMS)(
    'resolves $stageType to that editor',
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
    ({ stageId }) => {
      renderStageEditor({ stageId });

      expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
        labelOf(stageId),
      );
    },
  );

  /**
   * And the list is every interface there is, read off the registry.
   *
   * Five of these nineteen were here for a long time while fourteen families
   * were still landing, and nothing said which fourteen were missing. Derived
   * rather than counted, so the interface a later schema adds arrives as a
   * failure here rather than as an interface nothing in this file mentions.
   */
  it('is every interface the package registers', () => {
    expect(CLAIMS.map(({ stageType }) => stageType).toSorted()).toEqual(
      Object.keys(stageEditorRegistry).toSorted(),
    );
  });

  /**
   * Orientation is not an interface's own decision.
   *
   * The position line used to be a name-generator frame's private component,
   * so one interface said where the researcher was in the interview and the
   * rest did not — the same protocol, opened from the same timeline, orienting
   * the researcher or not depending on which stage they clicked. It is read
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
