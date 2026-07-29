import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { todayYmd } from '@codaco/fresco-ui/form/utils/ymd';
import {
  asEntityAttributeReference,
  type FormField,
} from '@codaco/protocol-validation';
import {
  dateWithinPickerRange,
  entityAttributesProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import useProtocolForm from '../useProtocolForm';

beforeAll(() => {
  // jsdom implements no scrolling, and an invalid submit scrolls the first
  // error into view once the store has updated.
  Element.prototype.scrollTo = () => {};
});

const NODE_TYPE = 'person';
const VAR = 'born_on';

const fields: FormField[] = [
  { variable: asEntityAttributeReference(VAR), prompt: 'Born on' },
];

function makeWrapper(
  component: 'RelativeDatePicker' | 'DatePicker',
  parameters: Record<string, unknown> | undefined,
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook: {
          node: {
            [NODE_TYPE]: {
              name: NODE_TYPE,
              variables: {
                [VAR]: {
                  name: VAR,
                  type: 'datetime',
                  component,
                  ...(parameters !== undefined ? { parameters } : {}),
                },
              },
            },
          },
        },
        stages: [{ id: 'stage1', type: 'AlterForm' }],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  };
}

function Harness({ onSubmit }: { onSubmit: () => void }) {
  const { fieldComponents } = useProtocolForm({
    fields,
    subject: { entity: 'node', type: NODE_TYPE },
  });

  return (
    <Form
      onSubmit={async () => {
        onSubmit();
        return { success: true as const };
      }}
    >
      {fieldComponents}
      <SubmitButton>Submit</SubmitButton>
    </Form>
  );
}

function renderHarness(
  component: 'RelativeDatePicker' | 'DatePicker',
  parameters: Record<string, unknown> | undefined,
) {
  const onSubmit = vi.fn();
  const Wrapper = makeWrapper(component, parameters);
  const { container } = render(
    <Wrapper>
      <Harness onSubmit={onSubmit} />
    </Wrapper>,
  );
  return { onSubmit, container };
}

// Queried by `name` rather than label association: RelativeDatePickerField
// doesn't forward `id` to its underlying native input (a pre-existing,
// unrelated gap — the rendered <label for> never matches an id), so
// getByLabelText can't find it.
function typeAndSubmit(container: HTMLElement, value: string) {
  const input = container.querySelector(`input[name="${VAR}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('date input not rendered');
  }
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /submit/i }));
}

// RelativeDatePicker's rendered control always applies its default window
// (before=180, after=0, anchor=today) whether or not `parameters` is
// present — fresco-ui's RelativeDatePickerField destructures those defaults
// unconditionally. Submission-time validation must therefore reject/accept
// identically for an absent record and an empty one.
describe.each([
  ['absent', undefined],
  ['empty', {}],
] as const)(
  'useProtocolForm RelativeDatePicker submission window — %s parameters',
  (_label, parameters) => {
    it('rejects a keyboard-typed value before the default 180-day window', async () => {
      const { onSubmit, container } = renderHarness(
        'RelativeDatePicker',
        parameters,
      );
      // dateWithinPickerRange is plain day arithmetic this far from the
      // calendar's ends (fresco-ui's ymd module no longer exports addDays).
      const belowMin = dateWithinPickerRange(todayYmd(), -181);

      typeAndSubmit(container, belowMin);

      await waitFor(() => {
        expect(screen.getByTestId(`${VAR}-field-error`)).toBeInTheDocument();
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('accepts a keyboard-typed value inside the default window', async () => {
      const { onSubmit, container } = renderHarness(
        'RelativeDatePicker',
        parameters,
      );
      const withinWindow = dateWithinPickerRange(todayYmd(), -10);

      typeAndSubmit(container, withinWindow);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.queryByTestId(`${VAR}-field-error`),
      ).not.toBeInTheDocument();
    });
  },
);

// DatePicker is the opposite case: a fully unbounded full-resolution control
// (no authored min/max) deliberately stays unbounded at the control level
// (see fresco-ui's DatePickerField and the fix in 35ff5dfd1), so an absent
// `parameters` record must contribute NO submission-time window validator —
// matching @codaco/protocol-validation's contradiction analyser, which models
// an unbounded full-resolution DatePicker as contributing no interval.
describe.each([
  ['absent', undefined],
  ['empty', {}],
] as const)(
  'useProtocolForm DatePicker submission window — %s parameters',
  (_label, parameters) => {
    it('accepts a value far outside the 1920-to-today default window', async () => {
      const { onSubmit, container } = renderHarness('DatePicker', parameters);

      typeAndSubmit(container, '1800-01-01');

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(
        screen.queryByTestId(`${VAR}-field-error`),
      ).not.toBeInTheDocument();
    });
  },
);
