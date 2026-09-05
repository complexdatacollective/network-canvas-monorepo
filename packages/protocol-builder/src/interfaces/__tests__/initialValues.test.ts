import { describe, expect, it } from 'vitest';

import type { Stage, StageType } from '@codaco/protocol-validation';
import allInterfaces from '@codaco/protocols/e2e/all-interfaces/protocol.json';

import { STAGE_TYPES } from '../../stage-types.ts';
import { getStageEditorInitialValues } from '../initialValues.ts';
import { getInterfaceTemplate } from '../templates.ts';

const fixtureStages = allInterfaces.stages as unknown as Stage[];

const initialValuesFor = (interfaceType: StageType, stage?: Stage | null) =>
  getStageEditorInitialValues({
    interfaceType,
    stage,
    template: getInterfaceTemplate(interfaceType),
  });

describe('a new stage', () => {
  it('starts from its interface template, never an empty object', () => {
    for (const stageType of STAGE_TYPES) {
      const template = getInterfaceTemplate(stageType);
      const values = initialValuesFor(stageType);

      if (stageType === 'Sociogram') {
        // The one interface that adds an editor-owned default on top of its
        // template; the exact shape is pinned by its own test below.
        expect(values).toMatchObject({ ...template, type: stageType });
      } else {
        expect(values, stageType).toEqual({ ...template, type: stageType });
      }
      // Even a template-less interface carries its own type, so the editor
      // never mounts against `{}`.
      expect(values.type, stageType).toBe(stageType);
    }
  });

  it('carries every authored default through to the editor', () => {
    // A regression that dropped the template would still satisfy the shape
    // check above for these interfaces, because their templates are the only
    // thing distinguishing them from a bare `{ type }`.
    expect(initialValuesFor('Narrative')).toEqual({
      type: 'Narrative',
      behaviours: { allowRepositioning: true, automaticLayout: true },
    });
    expect(initialValuesFor('OneToManyDyadCensus')).toEqual({
      type: 'OneToManyDyadCensus',
      behaviours: { removeAfterConsideration: true },
    });
  });

  it('gives a new Sociogram the concentric-circles toggle default', () => {
    expect(initialValuesFor('Sociogram')).toEqual({
      type: 'Sociogram',
      background: { skewedTowardCenter: false },
    });
  });
});

describe('a committed stage', () => {
  it('is returned unchanged for every interface except Sociogram', () => {
    const nonSociogram = fixtureStages.filter(
      (stage) => stage.type !== 'Sociogram',
    );
    // The fixture is the all-interfaces e2e protocol; if it ever stops
    // covering the schema this assertion is what notices.
    expect(new Set(nonSociogram.map((stage) => stage.type)).size).toBe(
      STAGE_TYPES.length - 1,
    );

    for (const stage of nonSociogram) {
      expect(initialValuesFor(stage.type, stage), stage.type).toEqual(stage);
    }
  });

  it('keeps a Sociogram that already answers the concentric-circles toggle', () => {
    const sociogram = fixtureStages.find((stage) => stage.type === 'Sociogram');
    expect(sociogram).toBeDefined();
    // Non-vacuity: the fixture takes the "already answered" branch, so the
    // added-default branch below has to be exercised separately.
    expect(
      (sociogram as unknown as { background: Record<string, unknown> })
        .background.skewedTowardCenter,
    ).toBe(true);

    expect(initialValuesFor('Sociogram', sociogram)).toEqual(sociogram);
  });

  it('adds the toggle default to a concentric-circles Sociogram that omits it', () => {
    const stage = {
      id: 'socio-1',
      type: 'Sociogram',
      label: 'Sociogram',
      background: { concentricCircles: 4 },
    } as unknown as Stage;

    expect(initialValuesFor('Sociogram', stage)).toEqual({
      id: 'socio-1',
      type: 'Sociogram',
      label: 'Sociogram',
      background: { concentricCircles: 4, skewedTowardCenter: false },
    });
  });

  it('leaves an explicit `false` alone rather than rewriting it', () => {
    const stage = {
      id: 'socio-2',
      type: 'Sociogram',
      background: { concentricCircles: 2, skewedTowardCenter: false },
    } as unknown as Stage;

    expect(initialValuesFor('Sociogram', stage)).toEqual(stage);
  });

  /**
   * An image-backed Sociogram renders no concentric-circles toggle, so adding
   * the toggle's default to its background would write a key no field owns —
   * and the stage editor's overwrite-on-save would then persist it.
   */
  it('leaves an image-backed Sociogram background untouched', () => {
    const stage = {
      id: 'socio-3',
      type: 'Sociogram',
      background: { image: 'assets/background.png' },
    } as unknown as Stage;

    const values = initialValuesFor('Sociogram', stage);
    expect(values).toEqual(stage);
    expect(
      Object.hasOwn(
        values.background as Record<string, unknown>,
        'skewedTowardCenter',
      ),
    ).toBe(false);
  });

  it('does not mutate the committed stage it was given', () => {
    const stage = {
      id: 'socio-4',
      type: 'Sociogram',
      background: { concentricCircles: 1 },
    } as unknown as Stage;

    initialValuesFor('Sociogram', stage);

    expect(stage).toEqual({
      id: 'socio-4',
      type: 'Sociogram',
      background: { concentricCircles: 1 },
    });
  });
});
