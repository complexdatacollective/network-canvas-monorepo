import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import TypeEditor from '~/components/TypeEditor/TypeEditor';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

// Keep the actual field copy and form state; canvas pickers and Redux lookups
// do not participate in the rendered British English surface under test.
vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => null,
}));
vi.mock('~/components/TypeEditor/IconPicker', () => ({ default: () => null }));
vi.mock('~/components/TypeEditor/ShapePicker', () => ({
  ShapePickerControl: () => null,
}));
vi.mock('~/components/TypeEditor/ShapeVariableMapping', () => ({
  default: () => null,
}));
vi.mock('~/selectors/protocol', () => ({
  getCodebook: () => ({ node: {}, edge: {} }),
}));
vi.mock('~/ducks/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('changes the rendered type hint to British English without resetting a draft', () => {
  render(
    <ArchitectI18nProvider>
      <Form onSubmit={() => ({ success: true })}>
        <TypeEditor entity="node" isNew initialValues={{}} />
      </Form>
    </ArchitectI18nProvider>,
  );
  const name = screen.getByRole('textbox', { name: 'Node type name' });
  fireEvent.change(name, { target: { value: 'Organization_authored' } });
  expect(name).toHaveAccessibleDescription(/"Organization"/);
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'en-GB');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
  expect(name).toHaveAccessibleDescription(/"Organisation"/);
  expect(name).toHaveValue('Organization_authored');
});
