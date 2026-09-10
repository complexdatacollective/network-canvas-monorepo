import { screen, waitFor } from '@testing-library/react';
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
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { EntitySubjectPickerField } from '../EntityTypePickerField.tsx';
import StageDestinationPickerField from '../StageDestinationPickerField.tsx';
import VariablePickerField from '../VariablePickerField.tsx';

const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

const PERSON: CodebookSubject = { entity: 'node', type: 'person' };

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
      Object.entries(variablesForSubject(protocolContext, PERSON)).map(
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
      name="nodeConfig.nodeLabelVariable"
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
            id: 'rule-a',
            type: 'node',
            options: { type: 'person', operator: 'EXISTS' },
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
      stageId: 'name-generator-1',
      sections: subjectPicker,
    });
    await harness.opened();
    expect(
      screen.queryByRole('radio', { name: 'organisation' }),
    ).not.toBeInTheDocument();

    harness.receiveCodebookUpdate({
      node: {
        organisation: {
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
      stageId: 'name-generator-1',
      sections: subjectPicker,
    });

    await harness.user.click(
      await screen.findByRole('radio', { name: 'family member' }),
    );
    const saved = await harness.submit();

    expect(saved?.stageDocument.subject).toEqual({
      entity: 'node',
      type: 'family_member',
    });
  });

  it('reports a type the codebook no longer holds rather than dropping it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: subjectPicker,
    });
    await harness.opened();

    harness.receiveCodebookUpdate({ node: { person: null } });

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
      stageId: 'family-pedigree-1',
      sections: <AttributePicker />,
    });
    await harness.opened();
    const picker = await screen.findByRole('combobox', {
      name: 'Attribute this question records',
    });
    expect(
      Array.from(picker.querySelectorAll('option')).map(
        (option) => option.value,
      ),
    ).not.toContain('nominated_early');

    harness.receiveCodebookUpdate({
      node: {
        person: {
          name: 'person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            nominated_early: {
              name: 'nominated_early',
              type: 'boolean',
              component: 'Boolean',
            },
          },
        },
      },
    });

    await waitFor(() =>
      expect(
        Array.from(picker.querySelectorAll('option')).map(
          (option) => option.value,
        ),
      ).toContain('nominated_early'),
    );
  });

  it('saves the attribute the researcher picked', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      sections: <AttributePicker />,
    });

    await harness.user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Attribute this question records',
      }),
      'age',
    );
    const saved = await harness.submit();

    expect(
      (saved?.stageDocument.nodeConfig as Record<string, unknown> | undefined)
        ?.nodeLabelVariable,
    ).toBe('age');
  });

  it('reports a stored attribute nothing offers rather than blanking the control', async () => {
    // The stage names an attribute of the family member it draws, and this
    // picker offers the attributes of a PERSON — so what it holds is exactly
    // the case a deleted attribute produces: a stored id nothing describes.
    renderStageEditor({
      stageId: 'family-pedigree-1',
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
      await screen.findByRole('combobox', {
        name: 'Attribute this question records',
      }),
    ).toHaveValue('fm_name');
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
      stages: ['anonymisation-1', 'ego-form-1', 'information-1'],
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
      'route:stage:sociogram-1',
    );
    const saved = await harness.submit();

    expect(
      (saved?.stageDocument.skipLogic as Record<string, unknown> | undefined)
        ?.destination,
    ).toEqual({ type: 'stage', stageId: 'sociogram-1' });
  });

  it('reports a destination whose stage is gone rather than correcting it', async () => {
    const harness = renderStageEditor({
      stage: skippingTo({ type: 'stage', stageId: 'no-such-stage' }),
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
    ).toEqual({ type: 'stage', stageId: 'no-such-stage' });
  });
});
