import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import NarrativeBehaviours from '~/components/sections/NarrativeBehaviours';
import RemoveAfterConsideration from '~/components/sections/OneToManyDyadCensus/RemoveAfterConsideration';
import TypeEditor from '~/components/TypeEditor/TypeEditor';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { ARCHITECT_LOCALE_KEY } from '../preference';

// Keep the actual field/section copy and form state; canvas pickers and Redux
// lookups do not participate in these three rendered British English surfaces.
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
vi.mock('~/components/StageEditor/stageFormHooks', () => ({
  useStageInitialValue: () => false,
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('changes the rendered type hint and behavior controls to British English without resetting a draft', () => {
  render(
    <ArchitectI18nProvider>
      <Form onSubmit={() => ({ success: true })}>
        <TypeEditor entity="node" isNew initialValues={{}} />
        <NarrativeBehaviours
          stagePath={null}
          stagePosition={0}
          interfaceType="Narrative"
        />
        <RemoveAfterConsideration />
      </Form>
    </ArchitectI18nProvider>,
  );
  const name = screen.getByRole('textbox', { name: 'Node type name' });
  fireEvent.change(name, { target: { value: 'Organization_authored' } });
  expect(name).toHaveAccessibleDescription(/"Organization"/);
  expect(
    screen.getByRole('heading', { name: 'Narrative behaviors' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Removal behavior')).toBeInTheDocument();
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, 'en-GB');
    window.dispatchEvent(
      new StorageEvent('storage', { key: ARCHITECT_LOCALE_KEY }),
    );
  });
  expect.soft(name).toHaveAccessibleDescription(/"Organisation"/);
  expect
    .soft(screen.queryByRole('heading', { name: 'Narrative behaviours' }))
    .toBeInTheDocument();
  expect(screen.getByText('Removal behaviour')).toBeInTheDocument();
  expect(name).toHaveValue('Organization_authored');
});
