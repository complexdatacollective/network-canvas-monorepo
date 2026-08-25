import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { startCase } from 'es-toolkit/compat';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { INHERITANCE_PATTERNS } from '@codaco/protocol-validation';

import DiseaseFields from '../DiseaseFields';

const CODEBOOK = {
  node: {
    'node-type-1': {
      name: 'Person',
      color: 'c',
      variables: {
        'var-1': { name: 'Affected', type: 'boolean' },
        'var-2': { name: 'Carrier', type: 'boolean' },
        'var-3': { name: 'Age', type: 'number' },
      },
    },
  },
};

const renderFields = (nodeType = 'node-type-1') => {
  const store = configureStore({
    reducer: {
      activeProtocol: (
        state = {
          present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] },
        },
      ) => state,
      stageEditorDraft: (state = { ui: { liveValues: null } }) => state,
    },
  });
  return render(
    <Provider store={store}>
      <FormStoreProvider>
        <DiseaseFields nodeType={nodeType} />
      </FormStoreProvider>
    </Provider>,
  );
};

describe('DiseaseFields', () => {
  it('groups every field in one Disease details section', () => {
    renderFields();

    const section = screen.getByRole('region', { name: 'Disease details' });
    expect(
      within(section).getByText(
        "Define how this disease appears, map it to the source pedigree's affected-status attribute, and choose how its inheritance is interpreted.",
      ),
    ).toBeVisible();
    expect(
      within(section).getByRole('textbox', { name: 'Disease label' }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('radiogroup', { name: 'Color' }),
    ).toBeInTheDocument();
    expect(within(section).getByText('Node attribute')).toBeVisible();
    expect(
      within(section).getByRole('combobox', { name: 'Inheritance pattern' }),
    ).toBeInTheDocument();
  });

  it('renders a visible label for the disease name field', () => {
    renderFields();
    const label = screen.getByText('Disease label');
    expect(label).toBeVisible();
    // Visibility is the behaviour under test; jsdom does not load Tailwind's
    // screen-reader-only declaration, so assert the design-system visibility
    // token directly as well as the accessible name.
    expect(label).not.toHaveClass('sr-only');
    expect(
      screen.getByRole('textbox', { name: 'Disease label' }),
    ).toBeInTheDocument();
  });

  it('renders the label field', () => {
    renderFields();
    expect(
      screen.getByPlaceholderText('Enter a name for this disease...'),
    ).toBeInTheDocument();
  });

  it('renders a visible label for the color field', () => {
    renderFields();
    const label = screen.getByText('Color');
    expect(label).toBeVisible();
    expect(label).not.toHaveClass('sr-only');
  });

  it('renders the color field', () => {
    renderFields();
    expect(
      screen.getByRole('radiogroup', {
        name: 'Color',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Select a color for this disease.')).toBeVisible();
  });

  it('renders a visible label and hint for the node attribute field', () => {
    renderFields();
    const label = screen.getByText('Node attribute');
    expect(label).toBeVisible();
    expect(label).not.toHaveClass('sr-only');
    expect(screen.getByText('Select a boolean node attribute.')).toBeVisible();
  });

  it('renders the variable field, offering only boolean variables', () => {
    renderFields();
    expect(screen.getByText('No attribute selected')).toBeInTheDocument();
    expect(screen.getByText('Select attribute')).toBeInTheDocument();
  });

  it('renders a visible label for the inheritance pattern field', () => {
    renderFields();
    const label = screen.getByText('Inheritance pattern');
    expect(label).toBeVisible();
    expect(label).not.toHaveClass('sr-only');
    expect(
      screen.getByRole('combobox', { name: 'Inheritance pattern' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Choose how this disease is inherited. Mendelian patterns are used with biological relationships and recorded sex to infer carrier and possible at-risk statuses. Multifactorial and Unknown show affected status only and do not infer carrier or at-risk statuses.',
      ),
    ).toBeVisible();
  });

  it('renders all INHERITANCE_PATTERNS as options', () => {
    renderFields();
    const select = screen.getByRole('combobox', {
      name: 'Inheritance pattern',
    });
    expect(select).toHaveTextContent('Select an inheritance pattern...');

    fireEvent.click(select);

    for (const pattern of INHERITANCE_PATTERNS) {
      expect(
        screen.getByRole('option', { name: startCase(pattern) }),
      ).toBeInTheDocument();
    }
  });
});
