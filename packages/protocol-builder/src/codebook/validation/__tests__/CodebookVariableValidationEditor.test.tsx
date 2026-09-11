import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ecosystemLocales } from '@codaco/app-i18n/locales';
import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { protocolBuilderCatalogs } from '../../../locales/catalogs.ts';
import { codebookRefusalMessage } from '../../compoundFailureCopy.ts';
import { draftValidatedElsewhereMessage } from '../../variableValidation.ts';
import type { CodebookWriteOutcome } from '../../writes.ts';
import CodebookVariableValidationEditor, {
  type CodebookVariableValidationEditorProps,
} from '../CodebookVariableValidationEditor.tsx';

const SUBJECT = { entity: 'node', type: 'person' } as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const entityDocument = (
  ageValidation: Record<string, unknown> = { minValue: 0 },
): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {
    age: {
      name: 'Age',
      type: 'number',
      component: 'Number',
      validation: ageValidation,
    },
    height: {
      name: 'Height',
      type: 'number',
      component: 'Number',
    },
  },
});

const variablesFrom = (document: SectionDoc): Record<string, unknown> => {
  const variables = document.variables;
  return isRecord(variables) ? variables : {};
};

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const applied = (): CodebookWriteOutcome => ({
  status: 'applied',
  sectionId: PERSON_SECTION,
});

type SubmitDocument = (document: SectionDoc) => Promise<CodebookWriteOutcome>;

/** What a host says. None of it reaches the researcher. */
const HOST_WORDS =
  'Expected object, received undefined at codebook.node.person';

/**
 * What a surface that refused the draft itself says, in the shape
 * `findDraftContradictions` writes. This one DOES reach the researcher.
 */
const CONTRADICTION =
  '“Minimum value” is above the maximum this attribute is allowed to hold.';

const renderEditor = (
  overrides: Partial<CodebookVariableValidationEditorProps> = {},
) => {
  const authoritativeEntityDocument =
    overrides.authoritativeEntityDocument ?? entityDocument();
  const props: CodebookVariableValidationEditorProps = {
    openId: 'open-1',
    subject: SUBJECT,
    variableId: 'age',
    authoritativeEntityDocument,
    allSubjectVariables: variablesFrom(authoritativeEntityDocument),
    onSubmitDocument: vi.fn<SubmitDocument>(async () => applied()),
    ...overrides,
  };
  return { ...render(<CodebookVariableValidationEditor {...props} />), props };
};

const replaceMinimumValue = async (value: string) => {
  const user = userEvent.setup();
  const input = screen.getByRole('spinbutton', { name: 'Minimum value' });
  await user.clear(input);
  await user.type(input, value);
  return user;
};

describe('CodebookVariableValidationEditor', () => {
  it('submits the whole section with the rules rewritten, and completes', async () => {
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => applied());
    const onComplete = vi.fn();
    renderEditor({ onSubmitDocument, onComplete });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledOnce());
    expect(onSubmitDocument.mock.calls[0]?.[0]).toMatchObject({
      name: 'Person',
      variables: {
        age: { validation: { minValue: 5 } },
        height: { name: 'Height' },
      },
    });
    expect(onComplete).toHaveBeenCalledWith(applied());
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
  });

  it('keeps a deleted comparison target visible and blocks submission', async () => {
    const document = entityDocument({ lessThanVariable: 'deleted-height' });
    delete variablesFrom(document).height;
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => applied());
    renderEditor({
      authoritativeEntityDocument: document,
      allSubjectVariables: variablesFrom(document),
      onSubmitDocument,
    });

    expect(
      screen.getByRole('option', {
        name: 'Deleted attribute (deleted-height)',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Less than' })).toHaveValue(
      'deleted-height',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The selected comparison attribute no longer exists.',
    );
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Save validation' }),
    );
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });

  it('preserves an incomplete null draft instead of silently dropping it', async () => {
    renderEditor();
    const user = userEvent.setup();
    const input = screen.getByRole('spinbutton', { name: 'Minimum value' });
    await user.clear(input);

    expect(input).toHaveValue(null);
    // The dialog is not a form field and has no error region of its own, so
    // the rule editor is what states the refusal here — `getByRole` also
    // pinning it to exactly one alert.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it('keeps contradictory values visible for correction', () => {
    const document = entityDocument({ minValue: 10, maxValue: 2 });
    renderEditor({
      authoritativeEntityDocument: document,
      allSubjectVariables: variablesFrom(document),
    });

    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(10);
    expect(
      screen.getByRole('spinbutton', { name: 'Maximum value' }),
    ).toHaveValue(2);
    // The repair guidance, not the analyser's own technical diagnostic
    // (`Attribute "Age": minValue (10) is greater than maxValue (2)`), which
    // names the schema's rule keys and is written for a validation report.
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The minimum and maximum rules for Age leave no permitted answer. Adjust the bounds or the required-answer rule.',
    );
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeDisabled();
  });

  it('keeps the dirty draft visible after a refused save', async () => {
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => ({
      status: 'refused' as const,
      message: codebookRefusalMessage({ kind: 'held' }),
      refusal: { kind: 'held' } as const,
    }));
    const onComplete = vi.fn();
    renderEditor({ onSubmitDocument, onComplete });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    // A notice rather than an alert: a section somebody else is holding is not
    // a fault, and the change lands once they are finished.
    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent(
      'A section needed for this change is currently being edited.',
    );
    // Never the host's own words, and never an internal section address: a
    // researcher is told what happened to their change, not where.
    expect(alert).not.toHaveTextContent(HOST_WORDS);
    expect(alert).not.toHaveTextContent('codebook:node:person');
    expect(alert).not.toHaveTextContent('@codaco/app-i18n/error/v1');
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeEnabled();
  });

  /**
   * A refusal already written for the researcher, shown in the words it
   * arrived in.
   *
   * Rules that cannot all hold at once for this attribute are legal to the
   * codebook schema and to the host, so nothing downstream refuses them. What
   * the surface that detects them says names the rule, which is more than the
   * package's copy for a save that did not happen could write about it — and a
   * renderer that replaced it would tell the researcher to wait and try a save
   * that cannot succeed until they change something.
   */
  it('reports a refusal the write wrote for the researcher', async () => {
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => ({
      status: 'refused',
      message: CONTRADICTION,
      refusal: { kind: 'unexplained' },
    }));
    const onComplete = vi.fn();
    renderEditor({ onSubmitDocument, onComplete });
    const user = await replaceMinimumValue('5');

    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(CONTRADICTION);
    expect(alert).not.toHaveTextContent(
      'This change could not be saved, and nothing was altered.',
    );
    // Refused either way: the dirty draft stays put and the editor stays open.
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
    expect(onComplete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Save validation' }),
    ).toBeEnabled();
  });

  it('reads a refusal this package wrote in the reader’s language', async () => {
    // A refusal arrives as a plain string, because a sentence written for a
    // researcher elsewhere has to be able to pass through untouched — so the
    // ones this package produces travel ENCODED and have to be decoded here.
    // Without the decode this alert shows the raw `@codaco/app-i18n/error/v1:`
    // payload, which is neither English nor Spanish. That payload carries the
    // English `defaultMessage` inside it, so reading the English sentence out
    // of the alert is not on its own evidence of anything — each language is
    // paired with the assertion that the envelope is gone. Both languages, so
    // a decode wired to a fixed formatter would fail too.
    const refusal = {
      status: 'refused' as const,
      message: draftValidatedElsewhereMessage('Height'),
      refusal: { kind: 'unexplained' } as const,
    };
    const props: CodebookVariableValidationEditorProps = {
      openId: 'open-1',
      subject: SUBJECT,
      variableId: 'age',
      authoritativeEntityDocument: entityDocument(),
      allSubjectVariables: variablesFrom(entityDocument()),
      onSubmitDocument: vi.fn<SubmitDocument>(async () => refusal),
    };
    const view = (locale: string) => (
      <AppI18nProvider
        locale={locale}
        locales={ecosystemLocales}
        messages={protocolBuilderCatalogs[locale]}
      >
        <CodebookVariableValidationEditor {...props} />
      </AppI18nProvider>
    );

    const { rerender } = render(view('en'));
    const user = await replaceMinimumValue('5');
    await user.click(screen.getByRole('button', { name: 'Save validation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"Height" is collected by this stage\'s form, so it cannot be assigned by this prompt',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      '@codaco/app-i18n/error/v1',
    );

    rerender(view('es'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'El formulario de esta etapa recoge «Height», por lo que esta pregunta no puede asignarlo',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      '@codaco/app-i18n/error/v1',
    );
  });

  it('preserves a dirty draft but writes it onto a newer authoritative entity', async () => {
    const initial = entityDocument();
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => applied());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitDocument,
    });
    const user = await replaceMinimumValue('5');
    const remote = entityDocument({ minValue: 2 });
    const remoteVariables = variablesFrom(remote);
    remoteVariables.remoteWeight = {
      name: 'RemoteWeight',
      type: 'number',
      component: 'Number',
    };

    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={remote}
        allSubjectVariables={remoteVariables}
      />,
    );

    expect(
      await screen.findByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);

    await user.click(screen.getByRole('button', { name: 'Save validation' }));
    await waitFor(() => expect(onSubmitDocument).toHaveBeenCalledOnce());
    expect(onSubmitDocument.mock.calls[0]?.[0]).toMatchObject({
      variables: {
        age: { validation: { minValue: 5 } },
        remoteWeight: { name: 'RemoteWeight' },
      },
    });
  });

  it('blocks a dirty validation draft when the authoritative attribute was deleted remotely', async () => {
    const initial = entityDocument();
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => applied());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitDocument,
    });
    const user = await replaceMinimumValue('5');
    const deleted = entityDocument();
    delete variablesFrom(deleted).age;

    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={deleted}
        allSubjectVariables={variablesFrom(deleted)}
      />,
    );

    expect(await screen.findByText('Attribute unavailable')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The latest entity data no longer contains this attribute.',
    );
    const save = screen.getByRole('button', { name: 'Save validation' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onSubmitDocument).not.toHaveBeenCalled();

    const restored = entityDocument({ minValue: 2 });
    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={restored}
        allSubjectVariables={variablesFrom(restored)}
      />,
    );
    expect(
      await screen.findByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
  });

  it('keeps a dirty draft visible but blocks saving after a remote variable type change', async () => {
    const initial = entityDocument();
    const onSubmitDocument = vi.fn<SubmitDocument>(async () => applied());
    const { rerender, props } = renderEditor({
      authoritativeEntityDocument: initial,
      allSubjectVariables: variablesFrom(initial),
      onSubmitDocument,
    });
    const user = await replaceMinimumValue('5');
    const remote = entityDocument();
    variablesFrom(remote).age = {
      name: 'Age',
      type: 'text',
      component: 'Text',
      validation: { required: true },
    };

    rerender(
      <CodebookVariableValidationEditor
        {...props}
        authoritativeEntityDocument={remote}
        allSubjectVariables={variablesFrom(remote)}
      />,
    );

    expect(await screen.findByText('Attribute type changed')).toBeVisible();
    expect(screen.getByText(/close and reopen this editor/i)).toBeVisible();
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveValue(5);
    const save = screen.getByRole('button', { name: 'Save validation' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(onSubmitDocument).not.toHaveBeenCalled();
  });
});
