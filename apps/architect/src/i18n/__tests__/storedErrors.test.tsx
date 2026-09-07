import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAppIntl } from '@codaco/app-i18n/react';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import ArchitectField from '~/components/Form/ArchitectField';
import { arrayItemMessages } from '~/components/Form/arrayFields/arrayMessages';
import { completeAttributes } from '~/components/Form/arrayFields/AssignAttributes';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import { showProtocolOpenResultDialog } from '~/components/protocolOpenDialogs';
import { ruleMapIssue } from '~/components/Validations/validateRuleMap';
import { VARIABLE_TYPES } from '~/config/variables';
import { rootReducer } from '~/ducks/modules/root';
import { guardState, promptLeaveEditor } from '~/hooks/useProtocolNavGuard';
import { describeMigrationFailure } from '~/utils/describeMigrationFailure';

import { ArchitectI18nProvider } from '../ArchitectI18nProvider';
import { formatConfig } from '../formatConfig';
import { ARCHITECT_LOCALE_KEY } from '../preference';

vi.unmock('@codaco/fresco-ui/dialogs/useDialog');

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function switchDeviceLocale(locale: string) {
  act(() => {
    localStorage.setItem(ARCHITECT_LOCALE_KEY, locale);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: ARCHITECT_LOCALE_KEY,
        newValue: locale,
      }),
    );
  });
}

it('keeps a submitted refusal, focus, and authored draft while translating its nested shared guidance', async () => {
  const issue = ruleMapIssue(
    { minValue: 10, maxValue: 2 },
    {
      allVariables: { research_id: { name: 'Research_Name', type: 'number' } },
      currentVariableId: 'research_id',
      variableType: 'number',
    },
  );
  if (!issue) throw new Error('Expected the real contradictory-rule refusal');
  const submit = vi.fn(() => ({
    success: false as const,
    fieldErrors: { answer: [issue] },
  }));
  function Editor() {
    const intl = useAppIntl();
    const definition = formatConfig(VARIABLE_TYPES.number, intl);
    return (
      <Form onSubmit={submit}>
        <ArchitectField
          name="answer"
          label={definition.label}
          hint={definition.label}
          component={InputField}
          initialValue="Research_1"
        />
        <button type="submit">Submit draft</button>
      </Form>
    );
  }
  render(
    <ArchitectI18nProvider>
      <Editor />
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submit draft' }));
  const english =
    'The minimum and maximum rules for Research_Name leave no permitted answer. Adjust the bounds or the required-answer rule.';
  expect(await screen.findByText(english)).toBeVisible();
  const input = screen.getByRole('textbox', { name: 'Number' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  input.focus();
  switchDeviceLocale('es');
  expect(
    await screen.findByText(
      'Las reglas de mínimo y máximo de Research_Name no permiten ninguna respuesta. Ajusta los límites o la regla de respuesta obligatoria.',
    ),
  ).toBeVisible();
  expect(screen.queryByText(english)).not.toBeInTheDocument();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveValue('Research_1');
  expect(input).toHaveFocus();
  expect(submit).toHaveBeenCalledTimes(1);
  switchDeviceLocale('en-GB');
  expect(await screen.findByText(english)).toBeVisible();
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(submit).toHaveBeenCalledTimes(1);
});

it('translates an already queued migration failure while preserving technical evidence and authored names', async () => {
  const detail = 'Duplicate attribute name "Study_Name"';
  const result = {
    status: 'error' as const,
    ...describeMigrationFailure(new Error(detail), {
      codebook: {
        node: {
          authored_type: {
            name: 'Family_Context',
            variables: {
              first: { name: 'Study_Name' },
              second: { name: 'Study_Name' },
            },
          },
        },
      },
    }),
  };
  function Launcher() {
    const { openDialog } = useDialog();
    return (
      <button
        onClick={() => {
          void showProtocolOpenResultDialog({ result, openDialog });
        }}
      >
        Open refusal
      </button>
    );
  }
  render(
    <ArchitectI18nProvider>
      <DialogProvider>
        <Launcher />
      </DialogProvider>
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open refusal' }));
  expect(
    await screen.findByRole('heading', { name: 'Two attributes share a name' }),
  ).toBeVisible();
  switchDeviceLocale('es');
  expect(
    await screen.findByRole('heading', {
      name: 'Dos atributos comparten un nombre',
    }),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Dos atributos de «Family_Context» se llaman «Study_Name»/,
    ),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Detalles técnicos (en inglés)' }),
  );
  await waitFor(() => expect(screen.getByText(detail)).toBeVisible());
  expect(screen.getByText(detail)).toHaveAttribute('lang', 'en');
  expect(screen.getByText(detail)).toHaveAttribute('dir', 'ltr');
});

const ResearchRow = ({ label }: Record<string, unknown>) => (
  <span>{typeof label === 'string' ? label : ''}</span>
);

it('translates an already-open row removal noun and preserves cancel and remove behavior', async () => {
  const changed = vi.fn();
  const original = [{ id: 'research_row_1', label: 'Research_Row_Á1' }];
  function ListDraft() {
    const [rows, setRows] = useState(original);
    return (
      <Form onSubmit={() => ({ success: true })}>
        <DialogArrayField
          name="prompts"
          value={rows}
          onChange={(next) => {
            changed(next);
            if (next === undefined)
              throw new Error('Row removal must provide the remaining array');
            setRows(next);
          }}
          itemLabelMessage={arrayItemMessages.prompt}
          addButtonLabel="Add research row"
          editorTitle="Edit research row"
          editorFieldsComponent={ResearchRow}
          previewComponent={ResearchRow}
        />
      </Form>
    );
  }
  render(
    <ArchitectI18nProvider>
      <Provider store={configureStore({ reducer: rootReducer })}>
        <DialogProvider>
          <ListDraft />
        </DialogProvider>
      </Provider>
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove prompt' }));
  expect(
    await screen.findByRole('heading', { name: 'Remove this prompt?' }),
  ).toBeVisible();
  switchDeviceLocale('es');
  expect(
    await screen.findByRole('heading', { name: '¿Eliminar pregunta?' }),
  ).toBeVisible();
  expect(
    screen.getByText('Se eliminará de la lista este elemento (pregunta).'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Eliminar pregunta' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.getByText('Research_Row_Á1')).toBeVisible();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar pregunta' }));
  expect(
    await screen.findByRole('heading', { name: '¿Eliminar pregunta?' }),
  ).toBeVisible();
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Eliminar pregunta',
    }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledExactlyOnceWith([]));
  expect(screen.queryByText('Research_Row_Á1')).not.toBeInTheDocument();
  expect(original).toEqual([
    { id: 'research_row_1', label: 'Research_Row_Á1' },
  ]);
});

it('translates both already-open leave actions and preserves cancellation and confirmed navigation', async () => {
  const testStore = configureStore({ reducer: rootReducer });
  const dispatch = vi.spyOn(testStore, 'dispatch');
  const leave = vi.fn();
  guardState.prompting = false;
  function Launcher() {
    const { openDialog } = useDialog();
    return (
      <button
        onClick={() => {
          void promptLeaveEditor(
            testStore.dispatch,
            openDialog,
            leave,
            false,
            'saved',
          );
        }}
      >
        Leave protocol
      </button>
    );
  }
  render(
    <ArchitectI18nProvider>
      <DialogProvider>
        <Launcher />
      </DialogProvider>
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Leave protocol' }));
  const dialog = await screen.findByRole('dialog');
  expect(
    within(dialog).getByRole('button', { name: 'Return to Start Screen' }),
  ).toBeVisible();
  expect(
    within(dialog).getByRole('button', { name: 'Return and download now' }),
  ).toBeVisible();
  switchDeviceLocale('es');
  expect(
    await within(dialog).findByRole('button', {
      name: 'Volver a la pantalla de inicio',
    }),
  ).toBeVisible();
  expect(
    within(dialog).getByRole('button', { name: 'Volver y descargar ahora' }),
  ).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(dispatch).not.toHaveBeenCalled();
  expect(leave).not.toHaveBeenCalled();
  expect(guardState.prompting).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Leave protocol' }));
  const reopened = await screen.findByRole('dialog');
  fireEvent.click(
    within(reopened).getByRole('button', {
      name: 'Volver a la pantalla de inicio',
    }),
  );
  await waitFor(() => expect(leave).toHaveBeenCalledExactlyOnceWith());
  expect(dispatch).toHaveBeenCalledTimes(1);
});

it('preserves an incomplete attribute submission while changing its error language', async () => {
  const issue = completeAttributes([{ variable: 'Research_Name' }]);
  if (!issue) throw new Error('Expected the real incomplete-attribute error');
  const submit = vi.fn(() => ({
    success: false as const,
    formErrors: [issue],
  }));
  render(
    <ArchitectI18nProvider>
      <Form onSubmit={submit}>
        <ArchitectField
          name="draft"
          label="Research draft"
          component={InputField}
          initialValue="Research_Value"
        />
        <button type="submit">Submit attributes</button>
      </Form>
    </ArchitectI18nProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submit attributes' }));
  expect(
    await screen.findByText(
      'Every additional attribute needs both an attribute and a value.',
    ),
  ).toBeVisible();
  switchDeviceLocale('es');
  expect(
    await screen.findByText(
      'Cada atributo adicional necesita un atributo y un valor.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Research draft' })).toHaveValue(
    'Research_Value',
  );
  expect(submit).toHaveBeenCalledTimes(1);
});
