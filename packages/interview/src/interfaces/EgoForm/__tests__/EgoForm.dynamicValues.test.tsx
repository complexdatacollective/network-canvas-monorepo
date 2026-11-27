import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { dynamicValueNameFor } from '@codaco/protocol-validation';
import { formOf } from '@codaco/protocol-validation/testing';

import { testVariableId } from '../../../__tests__/testIds';
import type { StageProps } from '../../../types';
import { renderEgoForm } from './renderEgoForm';

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

const NICKNAME_VARIABLE = testVariableId('nickname');
const NICKNAME = dynamicValueNameFor({
  kind: 'attribute',
  role: 'ego',
  variableId: NICKNAME_VARIABLE,
});

const stage = {
  id: 'ego-form',
  type: 'EgoForm',
  label: { en: 'About you' },
  // The title is the document's heading, above the field.
  form: formOf(
    [
      {
        id: 'field-1',
        variable: NICKNAME_VARIABLE,
        prompt: { en: 'Your nickname' },
      },
    ],
    {
      before: `# {${NICKNAME}, select, missing {About you} other {About {${NICKNAME}}}}`,
    },
  ),
} as unknown as StageProps<'EgoForm'>['stage'];

const egoVariables = {
  [NICKNAME_VARIABLE]: { name: 'Nickname', type: 'text', component: 'Text' },
};

describe('EgoForm dynamic values', () => {
  it('shows an answer in the title as the participant gives it', async () => {
    renderEgoForm({ stage, egoVariables });
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent('About you');

    fireEvent.change(await screen.findByLabelText(/Your nickname/), {
      target: { value: 'Ada' },
    });

    const value = screen.getByText('Ada', { selector: 'bdi' });
    expect(title).toContainElement(value);
    expect(value.closest('[data-dynamic-value]')).not.toBeNull();
  });
});
