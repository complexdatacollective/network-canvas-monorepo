import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import { CategoricalBinStageEditor } from '../editors/census/CategoricalBinStageEditor.tsx';
import { DyadCensusStageEditor } from '../editors/census/DyadCensusStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from '../editors/census/OneToManyDyadCensusStageEditor.tsx';
import { OrdinalBinStageEditor } from '../editors/census/OrdinalBinStageEditor.tsx';
import { TieStrengthCensusStageEditor } from '../editors/census/TieStrengthCensusStageEditor.tsx';
import { AlterEdgeFormStageEditor } from '../editors/forms/AlterEdgeFormStageEditor.tsx';
import { AlterFormStageEditor } from '../editors/forms/AlterFormStageEditor.tsx';
import { EgoFormStageEditor } from '../editors/forms/EgoFormStageEditor.tsx';
import { InformationStageEditor } from '../editors/forms/InformationStageEditor.tsx';
import { NameGeneratorQuickAddStageEditor } from '../editors/nameGenerators/NameGeneratorQuickAddStageEditor.tsx';
import { NameGeneratorRosterStageEditor } from '../editors/nameGenerators/NameGeneratorRosterStageEditor.tsx';
import { NameGeneratorStageEditor } from '../editors/nameGenerators/NameGeneratorStageEditor.tsx';
import { GeospatialStageEditor } from '../editors/network/GeospatialStageEditor.tsx';
import { NarrativeStageEditor } from '../editors/network/NarrativeStageEditor.tsx';
import { NetworkComposerStageEditor } from '../editors/network/NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from '../editors/network/SociogramStageEditor.tsx';
import { AnonymisationStageEditor } from '../editors/pedigree/AnonymisationStageEditor.tsx';
import { FamilyPedigreeStageEditor } from '../editors/pedigree/FamilyPedigreeStageEditor.tsx';
import { NarrativePedigreeStageEditor } from '../editors/pedigree/NarrativePedigreeStageEditor.tsx';
import { interfaceDocumentationUrl } from '../interfaces/documentation.ts';
import { STAGE_TYPES } from '../stage-types.ts';
import { stageEditorRegistry } from '../stageEditorRegistry.ts';
import { fixtureStageOfType } from '../testing/protocolFixture.ts';
import { renderStageEditor } from '../testing/renderStageEditor.tsx';

/**
 * Every interface in the schema, the editor that owns it, and the
 * documentation slug that editor asks for.
 *
 * THE SLUG IS THE LANDMARK, and it is the one thing on the page that only the
 * editor can have put there. Almost everything a stage editor shows is derived
 * from the stage the SESSION opened — the name field, the interface badge,
 * where the stage sits in the interview — so all of it reads correctly even
 * when the wrong editor rendered. The documentation link does not: each named
 * editor hands `StageHeading` a slug of its own, written in its own module, so
 * a Sociogram stage that opened in the narrative editor links a researcher to
 * the narrative documentation and this test says so.
 *
 * Two of them share their whole section outline — the categorical and ordinal
 * bins differ only inside their prompts — so an outline would not tell those
 * two apart at all. The slugs are checked below to be distinct, which is what
 * makes each one an identification rather than a coincidence.
 *
 * Written out rather than derived from the registry, because the registry is
 * what is under test: a table read out of it would agree with it whatever it
 * said, including after a family registered an editor under its neighbour's
 * interface.
 */
const EVERY_INTERFACE = [
  {
    stageType: 'AlterEdgeForm',
    editor: AlterEdgeFormStageEditor,
    documentation: 'per-alter-edge-form',
  },
  {
    stageType: 'AlterForm',
    editor: AlterFormStageEditor,
    documentation: 'per-alter-form',
  },
  {
    stageType: 'Anonymisation',
    editor: AnonymisationStageEditor,
    documentation: 'anonymisation',
  },
  {
    stageType: 'CategoricalBin',
    editor: CategoricalBinStageEditor,
    documentation: 'categorical-bin',
  },
  {
    stageType: 'DyadCensus',
    editor: DyadCensusStageEditor,
    documentation: 'dyad-census',
  },
  {
    stageType: 'EgoForm',
    editor: EgoFormStageEditor,
    documentation: 'ego-form',
  },
  {
    stageType: 'FamilyPedigree',
    editor: FamilyPedigreeStageEditor,
    documentation: 'family-pedigree',
  },
  {
    stageType: 'Geospatial',
    editor: GeospatialStageEditor,
    documentation: 'geospatial',
  },
  {
    stageType: 'Information',
    editor: InformationStageEditor,
    documentation: 'information',
  },
  {
    stageType: 'NameGenerator',
    editor: NameGeneratorStageEditor,
    documentation: 'name-generator-using-forms',
  },
  {
    stageType: 'NameGeneratorQuickAdd',
    editor: NameGeneratorQuickAddStageEditor,
    documentation: 'name-generator-using-quick-add',
  },
  {
    stageType: 'NameGeneratorRoster',
    editor: NameGeneratorRosterStageEditor,
    documentation: 'name-generator-roster',
  },
  {
    stageType: 'Narrative',
    editor: NarrativeStageEditor,
    documentation: 'narrative',
  },
  {
    stageType: 'NarrativePedigree',
    editor: NarrativePedigreeStageEditor,
    documentation: 'narrative-pedigree',
  },
  {
    stageType: 'NetworkComposer',
    editor: NetworkComposerStageEditor,
    documentation: 'network-composer',
  },
  {
    stageType: 'OneToManyDyadCensus',
    editor: OneToManyDyadCensusStageEditor,
    documentation: 'one-to-many-dyad-census',
  },
  {
    stageType: 'OrdinalBin',
    editor: OrdinalBinStageEditor,
    documentation: 'ordinal-bin',
  },
  {
    stageType: 'Sociogram',
    editor: SociogramStageEditor,
    documentation: 'sociogram',
  },
  {
    stageType: 'TieStrengthCensus',
    editor: TieStrengthCensusStageEditor,
    documentation: 'tie-strength-census',
  },
] as const satisfies readonly Readonly<{
  stageType: StageType;
  // A component for ONE interface, and each row's is a different one, so there
  // is no type every row's editor shares but `unknown`: a component's props
  // are contravariant, and `StageEditorComponent<StageType>` accepts none of
  // them. What each editor IS is asserted below, against the registry entry
  // for its own interface, where the type is the one it was written for.
  editor: unknown;
  documentation: string;
}>[];

/**
 * Everything `console.error` was told during a test, rather than nothing.
 *
 * React reports a component that threw, a hook rule broken, a key missing and
 * an invalid prop through `console.error` and nothing else — none of them
 * fails a render — so an editor can mount, look right, and be reporting a
 * defect the whole time. This suite's output is swallowed, so the reports have
 * to be COLLECTED to be asserted on; silencing them is the accident this
 * guards against rather than the mechanism it uses.
 */
let reported: string[] = [];

beforeEach(() => {
  reported = [];
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    reported.push(parts.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the editor every interface in the schema dispatches to', () => {
  /**
   * Without this the sweep below would cover whichever interfaces somebody
   * remembered to add to the table, and a stage type added to the schema would
   * be dispatched to by nothing while every test here went on passing.
   *
   * `STAGE_TYPES` is the schema's own key set — it is compile-checked against
   * `StageType` in `stage-types.ts` — so this is the schema asking, not a
   * second list agreeing with a first.
   */
  it('is one editor per interface, for every interface there is', () => {
    expect(
      EVERY_INTERFACE.map(({ stageType }) => stageType).toSorted(),
    ).toEqual([...STAGE_TYPES].toSorted());
  });

  /**
   * The landmark has to identify ONE editor or it identifies none: two
   * interfaces sharing a slug would let either of them open in the other's
   * editor with nothing here noticing.
   */
  it('sends each interface to documentation of its own', () => {
    const slugs = EVERY_INTERFACE.map(({ documentation }) => documentation);

    expect([...new Set(slugs)]).toHaveLength(slugs.length);
  });

  /**
   * By identity, against the registry the package actually composes — not
   * against any family's own part. A part written correctly but never added to
   * `REGISTRY_PARTS` leaves every stage it claims opening on some other
   * family's editor, and a part test would go on passing.
   */
  it.each(EVERY_INTERFACE)(
    'composes the $stageType editor into the package registry',
    ({ stageType, editor }) => {
      expect(stageEditorRegistry[stageType]).toBe(editor);
    },
  );

  /**
   * End to end, through the package's own dispatcher: no registry is passed,
   * so `StageEditor` reaches for `stageEditorRegistry` exactly as a host does,
   * and the stage type comes from the session rather than from this test.
   *
   * A configured stage of each interface, from the protocol the end-to-end
   * suites drive, so what is dispatched to is an editor with something to
   * show rather than an empty one.
   */
  it.each(EVERY_INTERFACE)(
    'opens a configured $stageType stage on it',
    ({ stageType, documentation }) => {
      const harness = renderStageEditor({
        stageId: fixtureStageOfType(stageType),
      });

      expect(
        harness.getByRole('link', { name: 'Documentation' }),
      ).toHaveAttribute('href', interfaceDocumentationUrl(documentation));
      // The editor mounted its shell around a form, rather than dispatching to
      // something that rendered only a heading.
      expect(
        harness.getByRole('textbox', { name: 'Stage name' }),
      ).toBeInTheDocument();
      expect(reported).toEqual([]);
    },
  );

  /**
   * And a stage a researcher has just added, which is the other way a host
   * reaches the dispatcher: the interface's own template, not in the interview
   * yet, with nothing filled in.
   *
   * Worth asking separately, because it is the harder of the two for an editor
   * to survive — every section renders its waiting state at once, and a
   * section that reads something the fixture stage happens to carry has
   * nothing to read here.
   */
  it.each(EVERY_INTERFACE)(
    'opens a new $stageType stage on it too',
    ({ stageType, documentation }) => {
      const harness = renderStageEditor({
        create: { type: stageType, position: 0 },
      });

      expect(
        harness.getByRole('link', { name: 'Documentation' }),
      ).toHaveAttribute('href', interfaceDocumentationUrl(documentation));
      expect(reported).toEqual([]);
    },
  );
});
