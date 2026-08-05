import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';

vi.mock('../../../../../hooks/useStageSelector', () => ({
  useStageSelector: () => undefined,
}));

vi.mock('../../../../../forms/useProtocolForm', () => ({
  default: () => ({ fieldComponents: null }),
}));

import { FamilyPedigreeContext } from '../../../FamilyPedigreeContext';
import { createFamilyPedigreeStore, type VariableConfig } from '../../../store';
import ChildrenDetailStep from '../ChildrenDetailStep';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'label',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function SeededFamilyForm() {
  return (
    <>
      <div hidden>
        <Field
          name="biologicalSex"
          label="Participant sex"
          component={InputField}
          initialValue="male"
        />
        <Field
          name="partner.name"
          label="Partner name"
          component={InputField}
          initialValue="Alice"
        />
        <Field
          name="partner.biologicalSex"
          label="Partner sex"
          component={InputField}
          initialValue="female"
        />
        <Field
          name="childrenWithPartnerCount"
          label="Child count"
          component={InputField}
          initialValue="1"
        />
      </div>
      <ChildrenDetailStep />
    </>
  );
}

describe('ChildrenDetailStep', () => {
  it('preselects likely mother/father candidates without filtering by biological sex', async () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      variableConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      'gendered',
    );

    render(
      <FamilyPedigreeContext.Provider value={store}>
        <Form onSubmit={() => ({ success: true })}>
          <SeededFamilyForm />
        </Form>
      </FamilyPedigreeContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mother' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Father' })).toBeTruthy();
    });

    const motherSection = screen.getByRole('heading', {
      name: 'Mother',
    }).parentElement;
    const fatherSection = screen.getByRole('heading', {
      name: 'Father',
    }).parentElement;
    expect(motherSection).not.toBeNull();
    expect(fatherSection).not.toBeNull();

    // Recorded sex helps choose convenient defaults, but it does not determine
    // who may have provided an egg or sperm.
    expect(
      within(motherSection!).getByRole('radio', { name: 'You' }),
    ).not.toBeChecked();
    expect(
      within(motherSection!).getByRole('radio', { name: 'Alice' }),
    ).toBeChecked();
    expect(
      within(fatherSection!).getByRole('radio', { name: 'You' }),
    ).toBeChecked();
    expect(
      within(fatherSection!).getByRole('radio', { name: 'Alice' }),
    ).not.toBeChecked();
  });

  it('excludes the nominated mother from the carrier list without filtering by biological sex', async () => {
    const store = createFamilyPedigreeStore(
      new Map(),
      new Map(),
      new Map(),
      variableConfig,
      undefined,
      undefined,
      undefined,
      undefined,
      'gendered',
    );

    render(
      <FamilyPedigreeContext.Provider value={store}>
        <Form onSubmit={() => ({ success: true })}>
          <SeededFamilyForm />
        </Form>
      </FamilyPedigreeContext.Provider>,
    );

    const carriedQuestion = await screen.findByRole('radiogroup', {
      name: 'Did this person carry the pregnancy?',
    });
    await userEvent.click(
      within(carriedQuestion).getByRole('radio', { name: 'No' }),
    );

    const carrierHeading = await screen.findByRole('heading', {
      name: 'Gestational Carrier',
    });
    const carrierSection = carrierHeading.parentElement;
    expect(carrierSection).not.toBeNull();

    // Alice is absent because she is the person who just answered that she did
    // not carry. The participant remains eligible regardless of recorded sex.
    expect(
      within(carrierSection!).queryByRole('radio', { name: 'Alice' }),
    ).toBeNull();
    expect(
      within(carrierSection!).getByRole('radio', { name: 'You' }),
    ).toBeTruthy();

    await userEvent.click(
      within(carrierSection!).getByRole('radio', {
        name: 'Create a new person',
      }),
    );

    // Sex recorded at birth is captured independently of gestational role.
    expect(
      within(carrierSection!).getByRole('radio', { name: 'Male' }),
    ).toBeTruthy();
    expect(
      within(carrierSection!).getByRole('radio', { name: 'Female' }),
    ).toBeTruthy();
  });
});
