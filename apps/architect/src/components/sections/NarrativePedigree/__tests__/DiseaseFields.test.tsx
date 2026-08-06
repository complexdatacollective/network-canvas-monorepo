import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { startCase } from 'es-toolkit/compat';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import { INHERITANCE_PATTERNS } from '@codaco/shared-consts';

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
        state = { present: { schemaVersion: 8, codebook: CODEBOOK, stages: [] } },
      ) => state,
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
  it('renders the Disease Label section', () => {
    renderFields();
    expect(screen.getByText('Disease Label')).toBeDefined();
  });

  it('renders the label field', () => {
    renderFields();
    expect(
      screen.getByPlaceholderText('Enter a name for this disease...'),
    ).toBeInTheDocument();
  });

  it('renders the Color section', () => {
    renderFields();
    expect(screen.getByText('Color')).toBeDefined();
  });

  it('renders the color field', () => {
    renderFields();
    expect(
      screen.getByRole('radiogroup', {
        name: /Select a color for this disease/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders the Node Variable section', () => {
    renderFields();
    expect(screen.getByText('Node Variable')).toBeDefined();
  });

  it('renders the variable field, offering only boolean variables', () => {
    renderFields();
    expect(screen.getByText('No variable selected')).toBeInTheDocument();
    expect(screen.getByText('Select variable')).toBeInTheDocument();
  });

  it('renders the Inheritance Pattern section', () => {
    renderFields();
    expect(screen.getByText('Inheritance Pattern')).toBeDefined();
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
