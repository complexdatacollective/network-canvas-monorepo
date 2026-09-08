import { describe, expect, it } from 'vitest';

import StageNameSection from '../../sections/StageNameSection.tsx';
import {
  renderStageEditor,
  type RenderStageEditorOptions,
} from '../renderStageEditor.tsx';

/**
 * Options as they reach the harness from somewhere the compiler cannot check:
 * a helper that assembles them, a value widened on the way in, a call written
 * before the union below existed. The refusal is for that path — the compiler
 * refuses the calls it can see, and those are checked further down.
 */
const asOptions = (
  options: Readonly<Record<string, unknown>>,
): RenderStageEditorOptions => options as unknown as RenderStageEditorOptions;

const BUILT_STAGE = {
  id: 'built-stage',
  type: 'Information',
  fields: { label: 'Built beside the fixture' },
} as const;

/**
 * `stageId`, `stage` and `create` are three ways of saying which stage is
 * under test, and a call means exactly one: each opens a DIFFERENT stage.
 *
 * They used to be three independent optionals that a call could give in any
 * combination, and `seedFrom` preferred `create`, then `stage`, then
 * `stageId`. A call that gave two opened one of them and dropped the other in
 * silence — so a test could name the fixture stage it meant to exercise and
 * run against a document built beside it instead, passing, and about a stage
 * nobody wrote down.
 */
describe('the stage a harness call opens', () => {
  it.each([
    {
      combination: '`stageId` and `stage`',
      options: {
        stageId: 'ego-form-1',
        stage: BUILT_STAGE,
        sections: <StageNameSection />,
      },
      named: ['`stageId`', '`stage`'],
    },
    {
      combination: '`stageId` and `create`',
      options: {
        stageId: 'ego-form-1',
        create: { type: 'Information', position: 0 },
        sections: <StageNameSection />,
      },
      named: ['`stageId`', '`create`'],
    },
    {
      combination: '`stage` and `create`',
      options: {
        stage: BUILT_STAGE,
        create: { type: 'Information', position: 0 },
        sections: <StageNameSection />,
      },
      named: ['`stage`', '`create`'],
    },
  ])('refuses a call giving $combination', ({ options, named }) => {
    expect(() => renderStageEditor(asOptions(options))).toThrow(
      new RegExp(named.map((name) => `\\${name}`).join('.*')),
    );
    // Named rather than resolved: the message has to say which two, because
    // the call that has to change is the one that gave two.
    for (const name of named) {
      expect(() => renderStageEditor(asOptions(options))).toThrow(
        new RegExp(`\\${name}`),
      );
    }
  });

  /**
   * The same refusal from the compiler, for every call it can type. Each
   * `@ts-expect-error` fails `tsc` the day that combination starts being
   * allowed — which is the day the union has collapsed back into three
   * independent optionals and stopped saying anything.
   */
  it('does not compile a call giving two of them', () => {
    // Written out first and assigned second, so each refusal is reported
    // against the whole value rather than against whichever property inside it
    // the compiler happened to reach for. An object literal written straight
    // into the annotation is checked member by member against the union, and
    // the diagnostic lands on a line the directive below is not on.
    const idAndStage = { stageId: 'ego-form-1', stage: BUILT_STAGE };
    const idAndCreate = {
      stageId: 'ego-form-1',
      create: { type: 'Information', position: 0 },
    } as const;
    const stageAndCreate = {
      stage: BUILT_STAGE,
      create: { type: 'Information', position: 0 },
    } as const;

    // @ts-expect-error `stageId` and `stage` are alternatives
    const asIdAndStage: RenderStageEditorOptions<'Information'> = idAndStage;
    // @ts-expect-error `stageId` and `create` are alternatives
    const asIdAndCreate: RenderStageEditorOptions<'Information'> = idAndCreate;
    // @ts-expect-error `stage` and `create` are alternatives
    const asStageAndCreate: RenderStageEditorOptions<'Information'> =
      stageAndCreate;

    expect(asIdAndStage.stageId).toBe('ego-form-1');
    expect(asIdAndCreate.stageId).toBe('ego-form-1');
    expect(asStageAndCreate.stage).toBe(BUILT_STAGE);
  });

  /**
   * The control. A guard that refused a call giving ONE of them would fail
   * every test in the package, but not the refusals above — so each source is
   * opened here, and each is asked for the stage only it produces.
   */
  it('opens the fixture stage `stageId` names', () => {
    const harness = renderStageEditor({
      stageId: 'ego-form-1',
      sections: <StageNameSection />,
    });

    expect(harness.seeded.id).toBe('ego-form-1');
    expect(harness.seeded.type).toBe('EgoForm');
  });

  it('opens the stage `stage` builds', () => {
    const harness = renderStageEditor({
      stage: BUILT_STAGE,
      sections: <StageNameSection />,
    });

    expect(harness.seeded.id).toBe('built-stage');
    expect(harness.seeded.fields.label).toBe('Built beside the fixture');
  });

  it('opens the stage `create` is opening for the first time', () => {
    const harness = renderStageEditor({
      create: { type: 'Information', position: 0 },
      sections: <StageNameSection />,
    });

    expect(harness.seeded.type).toBe('Information');
    expect(harness.session.getSnapshot().editedSection.creation).toBeDefined();
  });

  /** And a call giving none of them still says what it needs. */
  it('refuses a call naming no stage at all', () => {
    expect(() => renderStageEditor({ sections: <StageNameSection /> })).toThrow(
      /needs a stage/,
    );
  });
});
