import { describe, expect, it } from 'vitest';

import {
  interfaceTextAsShown,
  withInterfaceText,
} from '@codaco/interview/supplied-wording';
import {
  testTypeId,
  testVariableId,
} from '@codaco/protocol-builder/testing/testId';
import {
  type CurrentProtocol,
  type LocalizedString,
  type Stage,
  validateProtocol,
  createProtocolObjectId,
  isProtocolObjectId,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { buildProtocolWithStage } from '../buildProtocolWithStage';

const FINISH_STAGE_ID = ProtocolObjectIdSchema.parse(
  '9b1c38ef-38af-4d5e-8867-3bf21064aeb7',
);

// A minimal, valid current-schema protocol containing a single name generator
// stage whose codebook subject type exists. Tests insert/replace panels
// onto this stage to exercise how `buildProtocolWithStage` normalises wip stage
// edits before they are validated/previewed.
const STAGE_ID = ProtocolObjectIdSchema.parse(
  '2d7c1e9a-4b3f-4a8e-9d6c-0b5a7e3f1c28',
);

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const NAME = testVariableId('name');

const localized = (text: string): LocalizedString => ({ en: text });

function makeProtocol(stageOverrides: Partial<Stage> = {}): CurrentProtocol {
  const stage = {
    id: STAGE_ID,
    type: 'NameGenerator',
    label: localized('Name some people'),
    subject: { entity: 'node', types: [PERSON] },
    form: {
      title: localized('Add person'),
      fields: [
        {
          id: createProtocolObjectId(),
          variable: NAME,
          prompt: localized('Name'),
        },
      ],
    },
    prompts: [
      { id: createProtocolObjectId(), text: localized('Who do you know?') },
    ],
    ...stageOverrides,
  } as Stage;

  // As the active protocol always is: holding the interface text it uses.
  return withInterfaceText({
    name: 'Test Protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NAME]: {
              name: 'Name',
              type: 'text',
              component: 'Text',
            },
          },
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
    stages: [
      stage,
      {
        id: FINISH_STAGE_ID,
        type: 'FinishSession',
        label: localized('Finish'),
        mode: 'confirmation',
        content: localized('# All done\n\nThank you.'),
        finishedContent: { en: 'This interview is finished.' },
        finishLabel: { en: 'Finish' },
        finishConfirmation: { en: 'Finish this interview?' },
        finishFailed: { en: 'The interview could not be finished.' },
        outcome: 'completed',
      },
    ],
  });
}

describe('buildProtocolWithStage', () => {
  it('prunes a direct draft’s invalid null filter before preview', async () => {
    // Callers outside the form can construct a draft that has not crossed the
    // typed field writer. Preview must still match the pruned commit boundary.
    const wipStage = {
      ...makeProtocol().stages[0],
      panels: [
        {
          id: createProtocolObjectId(),
          title: { en: 'My roster' },
          dataSource: 'roster-asset-id',
          filter: null,
        },
      ],
    } as unknown as Stage;

    // Sanity check: the raw, unpruned draft is what used to reach the validator
    // and fail — `FilterSchema.optional()` accepts `undefined`, not `null`.
    const rawProtocol = makeProtocol();
    rawProtocol.stages[0] = wipStage;
    const rawResult = await validateProtocol(rawProtocol);
    expect(rawResult.success).toBe(false);

    // After build (which prunes), the null filter is gone and validation passes.
    const builtProtocol = buildProtocolWithStage(
      makeProtocol(),
      wipStage,
      STAGE_ID,
    );
    const panel = (
      builtProtocol.stages[0] as Stage & {
        panels: { filter?: unknown }[];
      }
    ).panels[0];
    expect(panel).not.toHaveProperty('filter');

    const builtResult = await validateProtocol(builtProtocol);
    expect(builtResult.success).toBe(true);
  });

  it('leaves a panel with no title as an invalid protocol so preview stays disabled', async () => {
    // A panel created but not yet titled. Pruning strips the null/undefined
    // title entirely, leaving the required `title` field missing — which keeps
    // the wip protocol invalid, and therefore preview disabled.
    for (const title of [null, undefined]) {
      const wipStage = {
        ...makeProtocol().stages[0],
        panels: [
          {
            id: createProtocolObjectId(),
            title,
            dataSource: 'existing',
            filter: null,
          },
        ],
      } as unknown as Stage;

      const builtProtocol = buildProtocolWithStage(
        makeProtocol(),
        wipStage,
        STAGE_ID,
      );
      const panel = (
        builtProtocol.stages[0] as Stage & {
          panels: { title?: unknown }[];
        }
      ).panels[0];
      expect(panel).not.toHaveProperty('title');

      const result = await validateProtocol(builtProtocol);
      expect(result.success).toBe(false);
    }
  });

  it('inserts a new stage with a generated id when stageId is null', () => {
    const protocol = makeProtocol();
    const newStage = {
      type: 'Information',
      label: { en: 'Intro' },
    } as unknown as Stage;

    const built = buildProtocolWithStage(protocol, newStage, null, 0);

    expect(built.stages).toHaveLength(3);
    expect(isProtocolObjectId(built.stages[0]?.id)).toBe(true);
    expect(built.stages[1]?.id).toBe(STAGE_ID);
    expect(built.stages[2]?.id).toBe(FINISH_STAGE_ID);
  });

  it('puts a new stage before the finish stage, where a save would put it', () => {
    const newStage = {
      type: 'Information',
      label: { en: 'Intro' },
    } as unknown as Stage;

    for (const insertAt of [undefined, 2]) {
      const built = buildProtocolWithStage(
        makeProtocol(),
        newStage,
        null,
        insertAt,
      );
      expect(built.stages.map(({ type }) => type)).toEqual([
        'NameGenerator',
        'Information',
        'FinishSession',
      ]);
    }
  });

  // A stage of a kind the protocol has none of brings interface text of its
  // own, which the saved protocol will show; the draft must show it too, or
  // the stage editor could never validate (or preview) the new stage.
  it('validates a draft adding the first stage of a kind, with the text that kind shows', async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the committed all-interfaces fixture is a valid current protocol
    const fixture = allInterfaces as unknown as CurrentProtocol;
    const quickAdd = fixture.stages.find(
      ({ type }) => type === 'NameGeneratorQuickAdd',
    );
    if (quickAdd === undefined) throw new Error('No quick-add stage');
    const protocol = withInterfaceText({
      ...fixture,
      stages: fixture.stages.filter(
        ({ type }) => type !== 'NameGeneratorQuickAdd',
      ),
    });
    expect(interfaceTextAsShown(protocol)).not.toHaveProperty('quickAdd');
    expect((await validateProtocol(protocol, { draft: true })).success).toBe(
      true,
    );

    const { id: _id, ...newStage } = quickAdd;
    const built = buildProtocolWithStage(protocol, newStage as Stage, null);

    // The saved protocol shows the new kind's text, and holds none of it:
    // it is Network Canvas's own.
    expect(interfaceTextAsShown(built)).toHaveProperty('quickAdd');
    expect(built.interfaceText?.quickAdd).toBeUndefined();
    const result = await validateProtocol(built, { draft: true });
    expect(result.error?.issues).toBeUndefined();
  });

  // Shared wording the stage editor holds with the stage, for entries the
  // saved protocol does not hold yet, is what the preview has to show: the
  // save writes it with the stage.
  it('previews the shared wording held with the stage over Network Canvas’s', async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the committed all-interfaces fixture is a valid current protocol
    const fixture = allInterfaces as unknown as CurrentProtocol;
    const map = fixture.stages.find(({ type }) => type === 'Geospatial');
    if (map?.type !== 'Geospatial') throw new Error('No map stage');
    expect(fixture.interfaceText?.geospatial).not.toHaveProperty(
      'searchFailed',
    );
    const reworded = { 'en-US': 'No place matched that search' };
    const searching = {
      ...map,
      mapOptions: { ...map.mapOptions, allowSearch: true },
    };

    const built = buildProtocolWithStage(
      fixture,
      searching,
      map.id,
      undefined,
      [{ group: 'geospatial', key: 'searchFailed', value: reworded }],
    );

    expect(built.interfaceText?.geospatial?.searchFailed).toEqual(reworded);
    expect(
      buildProtocolWithStage(fixture, searching, map.id).interfaceText
        ?.geospatial?.searchFailed,
    ).not.toEqual(reworded);
    const result = await validateProtocol(built, { draft: true });
    expect(result.error?.issues).toBeUndefined();
  });

  it('previews the codebook changes held with the stage over the protocol’s', async () => {
    const protocol = makeProtocol();
    const stage = protocol.stages[0];
    if (stage === undefined) throw new Error('No stage');
    const person = protocol.codebook.node?.[PERSON];
    if (person === undefined) throw new Error('No person type');
    const held = {
      ...person,
      variables: {
        [NAME]: {
          ...person.variables?.[NAME],
          validation: { required: true },
        },
      },
    };
    const place = {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {},
    };

    const built = buildProtocolWithStage(
      protocol,
      stage,
      STAGE_ID,
      undefined,
      [],
      {
        [sectionId({ kind: 'codebookNode', typeId: PERSON })]: {
          base: person,
          edited: held,
        },
        [sectionId({ kind: 'codebookNode', typeId: PLACE })]: {
          base: null,
          edited: place,
        },
      },
    );

    expect(built.codebook.node?.[PERSON]?.variables?.[NAME]).toMatchObject({
      validation: { required: true },
    });
    expect(built.codebook.node?.[PLACE]).toEqual(place);
    // The protocol itself is left as it was: the changes are the editor's.
    expect(
      protocol.codebook.node?.[PERSON]?.variables?.[NAME],
    ).not.toHaveProperty('validation');
    const result = await validateProtocol(built, { draft: true });
    expect(result.error?.issues).toBeUndefined();
  });
});
