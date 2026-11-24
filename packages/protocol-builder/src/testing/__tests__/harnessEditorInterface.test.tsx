import { assertType, describe, expect, it } from 'vitest';

import type {
  StageEditorComponent,
  StageEditorProps,
} from '../../stage-editor-contract.ts';
import { fixtureStageIds, loadFixtureStage } from '../protocolFixture.ts';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
} from '../renderStageEditor.tsx';

const InformationEditor: StageEditorComponent<'Information'> = ({
  stageType,
}: StageEditorProps<'Information'>) => <p>the {stageType} editor</p>;

/**
 * A named editor is written for ONE interface, and the harness hands it the
 * stage type the edit opened on — as a runtime string, cast to the type
 * parameter the call resolved.
 *
 * When that parameter came from the editor alone, the cast was a relabelling:
 * `{ stageId: 'ego-form-1', editor: InformationEditor }` compiled, mounted, and
 * handed an editor written for Information a stage that says it is an EgoForm.
 * The fixture's stages now say which interface each of them is (see
 * `FixtureStageId`), so the pair has to agree before the call compiles.
 */
describe('the interface a named editor is opened over', () => {
  // The assertion is the compile: these files are typechecked, and nothing
  // here runs anything worth asserting at runtime.
  it('does not compile an editor over another interface’s stage', () => {
    // Written out first and asserted second, so the refusal is reported
    // against the whole value rather than against a property inside it — the
    // line the directive is on.
    const overAnotherInterface = {
      stageId: 'ego-form-1',
      editor: InformationEditor,
    } as const;

    // @ts-expect-error `ego-form-1` is the fixture's EgoForm stage, and this editor is written for Information
    assertType<RenderStageEditorOptions<'Information'>>(overAnotherInterface);
  });

  /**
   * The control, and it is what makes the probe above mean anything: a
   * `stageId` typed as "no id at all" would refuse the mismatch and every
   * correct pairing with it.
   */
  it('compiles the editor over its own interface’s stage', () => {
    const overItsOwnInterface = {
      stageId: 'information-1',
      editor: InformationEditor,
    } as const;

    assertType<RenderStageEditorOptions<'Information'>>(overItsOwnInterface);
  });

  /**
   * And the second control: a call that names no interface still opens any
   * stage of the fixture, including from an id it computed. That is how the
   * dispatcher and the shared sections are exercised over every interface at
   * once, and it is why the narrowing above is conditional on `T` rather than
   * written into the option.
   */
  it('opens any fixture stage for a call that names no interface', () => {
    // An id as a family's own helper hands one over: worked out from
    // something, and a `string` by the time it reaches the harness.
    const geospatialId = loadFixtureStage('geospatial-1').id;
    const computed = fixtureStageIds().find((id) => id === geospatialId);
    if (computed === undefined) {
      throw new Error('the fixture has no geospatial stage to open');
    }

    const harness = renderStageEditor({
      stageId: computed,
      sections: <></>,
    });

    expect(harness.seeded.type).toBe('Geospatial');
  });
});

/**
 * The map is hand-written, so what it says has to be true of the protocol:
 * everything above rests on it, and a claim the compiler enforces about a
 * fixture that has moved on is worse than no claim at all.
 */
describe('what the fixture says each of its stages is', () => {
  it('opens a handle over the stage of the interface it names', () => {
    expect(loadFixtureStage('ego-form-1').type).toBe('EgoForm');
    expect(loadFixtureStage('information-1').type).toBe('Information');
  });

  it('refuses a stage nothing has written down', () => {
    expect(() => loadFixtureStage('nowhere-1')).toThrow(/has no stage/);
  });

  it('opens every stage the protocol holds by its own id', () => {
    const ids = fixtureStageIds();

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.map((id) => loadFixtureStage(id).id)).toEqual(ids);
  });
});
