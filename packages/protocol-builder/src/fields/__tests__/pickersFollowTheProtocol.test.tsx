import { screen, waitFor, within } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../../form/requiredField.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import {
  attributeField,
  awaitOfferedAttributes,
  chooseAttributeById,
  offeredAttributes,
} from '../../testing/attributePicker.ts';
import {
  loadFixtureStage,
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { testId, testTypeId, testVariableId } from '../../testing/testId.ts';
import { EntitySubjectPickerField } from '../EntityTypePickerField.tsx';
import StageDestinationPickerField from '../StageDestinationPickerField.tsx';
import VariablePickerField from '../VariablePickerField.tsx';

const ORGANISATION = testTypeId('organisation');
const NOMINATED_EARLY = testVariableId('nominated_early');
const PERSON = fixtureTypeId('node', 'person');
const FAMILY_MEMBER = fixtureTypeId('node', 'family member');
const AGE = fixtureVariableId({ entity: 'node', typeName: 'person' }, 'age');
const FM_NAME = fixtureVariableId(
  { entity: 'node', typeName: 'family member' },
  'fm_name',
);

const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

const PERSON_SUBJECT: CodebookSubject = { entity: 'node', type: PERSON };

/**
 * Every attribute the people this stage collects have, unnarrowed.
 *
 * A section narrows this — a rule to what it can compare, a form to what its
 * other questions do not already collect — and the narrowing is the section's
 * because it is about what the choice is FOR. What is under test here is the
 * picker, so nothing is ruled out.
 */
function AttributePicker() {
  const protocolContext = useProtocolContext();
  const options = useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, PERSON_SUBJECT)).map(
        ([value, variable]) => ({
          value,
          label: variable.name,
          type: variable.type,
        }),
      ),
    [protocolContext],
  );
  return (
    <Field<typeof VariablePickerField>
      name="nodeConfiguration.nameAttribute"
      component={VariablePickerField}
      label="Attribute this question records"
      options={options}
      required={REQUIRED}
    />
  );
}

const subjectPicker = (
  <Field<typeof EntitySubjectPickerField>
    name="subject"
    component={EntitySubjectPickerField}
    entityType="node"
    label="Type of person or thing"
    required={REQUIRED}
  />
);

const destinationPicker = (
  <Field<typeof StageDestinationPickerField>
    name="skipLogic.destination"
    component={StageDestinationPickerField}
    label="Where the interview continues"
  />
);

const INFORMATION = loadFixtureStage('information-1');

/**
 * The stage this one skips to, over configured skip logic.
 *
 * Written out rather than reached by clicking through the section: what is
 * under test is the picker, and skip logic that is switched on and has a rule
 * in it is what the picker is mounted beside in a real editor.
 */
const skippingTo = (destination?: Record<string, unknown>) => ({
  id: INFORMATION.id,
  type: INFORMATION.type,
  fields: {
    ...INFORMATION.fields,
    skipLogic: {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: testId('rule-a'),
            type: 'node',
            options: { type: PERSON, operator: 'EXISTS' },
          },
        ],
      },
      ...(destination === undefined ? {} : { destination }),
    },
  },
});

describe('the entity type picker', () => {
  it('offers a type a collaborator added while the editor was open', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: subjectPicker,
    });
    await harness.opened();
    expect(
      screen.queryByRole('radio', { name: 'organisation' }),
    ).not.toBeInTheDocument();

    harness.receiveCodebookUpdate({
      node: {
        [ORGANISATION]: {
          name: 'organisation',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        },
      },
    });

    expect(
      await screen.findByRole('radio', { name: 'organisation' }),
    ).toBeInTheDocument();
  });

  it('saves the type the researcher picked, as the subject the schema stores', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: subjectPicker,
    });

    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    const saved = await harness.submit();

    expect(saved?.stageDocument.subject).toEqual({
      entity: 'node',
      types: [FAMILY_MEMBER],
    });
  });

  it('reports a type the codebook no longer holds rather than dropping it', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: subjectPicker,
    });
    await harness.opened();

    harness.receiveCodebookUpdate({ node: { [PERSON]: null } });

    expect(
      await screen.findByText(
        'This type is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the attribute picker', () => {
  it('offers an attribute a collaborator added while the editor was open', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('family-pedigree-1'),
      sections: <AttributePicker />,
    });
    await harness.opened();
    const picker = attributeField('Attribute this question records');
    expect(await offeredAttributes(harness.user, picker)).not.toContain(
      NOMINATED_EARLY,
    );

    harness.receiveCodebookUpdate({
      node: {
        [PERSON]: {
          name: 'person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [NOMINATED_EARLY]: {
              name: 'nominated_early',
              type: 'boolean',
              component: 'Boolean',
            },
          },
        },
      },
    });

    await awaitOfferedAttributes(harness.user, picker, (offered) =>
      expect(offered).toContain(NOMINATED_EARLY),
    );
  });

  it('saves the attribute the researcher picked', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('family-pedigree-1'),
      sections: <AttributePicker />,
    });

    await harness.opened();
    await chooseAttributeById(
      harness.user,
      attributeField('Attribute this question records'),
      AGE,
    );
    const saved = await harness.submit();

    expect(
      (
        saved?.stageDocument.nodeConfiguration as
          | Record<string, unknown>
          | undefined
      )?.nameAttribute,
    ).toBe(AGE);
  });

  it('reports a stored attribute nothing offers rather than blanking the control', async () => {
    // The stage names an attribute of the family member it draws, and this
    // picker offers the attributes of a PERSON — so what it holds is exactly
    // the case a deleted attribute produces: a stored id nothing describes.
    renderStageEditor({
      stageId: fixtureStageId('family-pedigree-1'),
      sections: <AttributePicker />,
    });

    expect(
      await screen.findByText(
        'This attribute is not available here. Choose another one.',
      ),
    ).toBeInTheDocument();
    // Kept, so the save can still be refused rather than quietly writing the
    // blank over the reference the researcher has to resolve.
    expect(
      within(attributeField('Attribute this question records')).getByText(
        `${FM_NAME} — this attribute is not available here`,
      ),
    ).toBeVisible();
  });
});

describe('the stage destination picker', () => {
  it('drops a stage a collaborator deleted while the editor was open', async () => {
    const harness = renderStageEditor({
      stage: skippingTo(),
      sections: destinationPicker,
    });
    await harness.opened();
    const picker = await screen.findByRole('combobox', {
      name: 'Where the interview continues',
    });
    expect(
      await screen.findByRole('option', { name: /Sociogram/ }),
    ).toBeInTheDocument();

    harness.host.store.applyAsCollaborator(STAGE_ORDER, {
      stages: [
        fixtureStageId('anonymisation-1'),
        fixtureStageId('ego-form-1'),
        fixtureStageId('information-1'),
      ],
    });

    await waitFor(() =>
      expect(
        Array.from(picker.querySelectorAll('option')).map(
          (option) => option.textContent,
        ),
      ).not.toContain(expect.stringContaining('Sociogram')),
    );
  });

  it('saves the destination the researcher picked', async () => {
    const harness = renderStageEditor({
      stage: skippingTo(),
      sections: destinationPicker,
    });

    await harness.user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Where the interview continues',
      }),
      `route:stage:${fixtureStageId('sociogram-1')}`,
    );
    const saved = await harness.submit();

    expect(
      (saved?.stageDocument.skipLogic as Record<string, unknown> | undefined)
        ?.destination,
    ).toEqual({ type: 'stage', stageId: fixtureStageId('sociogram-1') });
  });

  it('reports a destination whose stage is gone rather than correcting it', async () => {
    const harness = renderStageEditor({
      stage: skippingTo({
        type: 'stage',
        stageId: testId('no-such-stage'),
      }),
      sections: destinationPicker,
    });

    const picker = await screen.findByRole('combobox', {
      name: 'Where the interview continues',
    });
    await waitFor(() => expect(picker).toHaveAttribute('aria-invalid', 'true'));
    // Reported, not corrected: where the interview goes next is the
    // researcher's decision, and the stage still holds what they chose.
    const saved = await harness.submit();
    expect(
      (saved?.stageDocument.skipLogic as Record<string, unknown> | undefined)
        ?.destination,
    ).toEqual({ type: 'stage', stageId: testId('no-such-stage') });
  });
});
