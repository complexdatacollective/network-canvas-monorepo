import { useCallback } from 'react';
import { v4 as uuid } from 'uuid';

import type { VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import {
  buildCreateVariableRequest,
  buildUpdateVariableRequest,
} from './editing.ts';

/**
 * What a stage section knows about an attribute it is inventing.
 *
 * Only what the section asked the researcher for: everything else about a
 * codebook variable — its options, its rules, whether it is encrypted — is the
 * codebook's own editor's business, and a stage that guessed at it would be
 * authoring the codebook behind the researcher's back.
 */
export type NewCodebookVariable = Readonly<{
  /** Researcher-facing name, exactly as typed. */
  name: string;
  type: VariableType;
  /** Input control the interview renders it with, where the section knows one. */
  component?: string;
  /**
   * Rules the ROLE requires from the start — a quick-add attribute must hold a
   * value, because the interview writes one the moment a node is created.
   */
  validation?: Readonly<Record<string, unknown>>;
}>;

export type CreateCodebookVariableOutcome =
  | Readonly<{ status: 'created'; variableId: string }>
  | Readonly<{ status: 'refused'; message: string }>;

export type CreateCodebookVariable = (
  variable: NewCodebookVariable,
) => Promise<CreateCodebookVariableOutcome>;

/** Nothing to write, or nothing was written — either way, carry on. */
export type SetVariableComponentOutcome =
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{ status: 'refused'; message: string }>;

export type SetVariableComponent = (
  variableId: string,
  component: string,
) => Promise<SetVariableComponentOutcome>;

const REFUSED_UNCHANGED =
  'This attribute could not be created, so nothing was changed. Try again.';

const NO_SUBJECT =
  'Choose what this stage works with before creating an attribute.';

const MISSING_TYPE =
  'This type is no longer in the codebook, so an attribute cannot be added to it.';

const BLOCKED =
  'Someone else is editing this type in the codebook. Try again once they have finished.';

/** A builder's own refusal, in its own words, or a plain "nothing changed". */
const refusalMessage = (error: unknown): string =>
  error instanceof Error && error.message !== ''
    ? error.message
    : REFUSED_UNCHANGED;

/**
 * Adds an attribute to the codebook from inside a stage editor.
 *
 * A stage that collects an attribute nobody has declared yet needs two writes
 * — one to the codebook section, one to the stage — and a host that applied
 * only the first would leave a variable nothing references, while one that
 * applied only the second would leave a stage referencing a variable that does
 * not exist. So this asks for a compound edit and the host applies both or
 * neither. The stage half is the ordinary save that follows, which is why the
 * variable is created BEFORE the row that names it is committed.
 *
 * Every refusal is answered rather than thrown: a lease lost mid-edit, a name
 * a collaborator has just taken, or a stage whose own list edits are not saved
 * yet are all things the researcher can act on, and all of them mean the same
 * thing to the caller — nothing was written, so do not commit the row.
 */
export function useCreateCodebookVariable(
  subject: CodebookSubject | undefined,
): CreateCodebookVariable {
  const { controller, protocolContext } = useStageEditorForm();

  return useCallback(
    async (variable) => {
      if (subject === undefined) {
        return { status: 'refused', message: NO_SUBJECT };
      }

      const document = codebookDocument(protocolContext, subject);
      if (document === undefined) {
        return { status: 'refused', message: MISSING_TYPE };
      }

      // The record id is minted here and never shown: a researcher renames an
      // attribute, and a protocol whose references were its old name would
      // break on the rename.
      const variableId = uuid();
      let request;
      try {
        request = buildCreateVariableRequest({
          requestId: uuid(),
          description: `Create the attribute "${variable.name}"`,
          subject,
          authoritativeDocument: document,
          variableId,
          protocolContext,
          draft: {
            name: variable.name,
            type: variable.type,
            ...(variable.component === undefined
              ? {}
              : { component: variable.component }),
            ...(variable.validation === undefined
              ? {}
              : { validation: variable.validation }),
          },
        });
      } catch (error: unknown) {
        // The builder refuses a duplicate name, an id already in use and a
        // draft the codebook schema will not accept. All three are the
        // researcher's to resolve, and all three are said in their own words.
        return { status: 'refused', message: refusalMessage(error) };
      }

      const result = await controller.requestCompoundEdit(request);
      if (result.status === 'applied') {
        return { status: 'created', variableId };
      }
      if (result.status === 'blocked') {
        return { status: 'refused', message: BLOCKED };
      }
      return { status: 'refused', message: result.message };
    },
    [controller, protocolContext, subject],
  );
}

/**
 * Records which input control an existing attribute is collected with.
 *
 * The control belongs to the codebook variable rather than to the field that
 * renders it — one attribute is collected the same way wherever it is asked
 * for, or an export would hold answers gathered through two different
 * controls under one name. So a form field choosing a control is a codebook
 * edit, and takes the same compound route as inventing an attribute: the
 * researcher chose it while authoring a stage, and the two halves must land
 * together or not at all.
 *
 * A control that already matches is not written: an unchanged save must not
 * put a revision on the codebook section that a collaborator has to merge.
 */
export function useSetVariableComponent(
  subject: CodebookSubject | undefined,
): SetVariableComponent {
  const { controller, protocolContext } = useStageEditorForm();

  return useCallback(
    async (variableId, component) => {
      if (subject === undefined) {
        return { status: 'refused', message: NO_SUBJECT };
      }
      const document = codebookDocument(protocolContext, subject);
      if (document === undefined) {
        return { status: 'refused', message: MISSING_TYPE };
      }
      const variables = document.variables;
      const current =
        typeof variables === 'object' && variables !== null
          ? Reflect.get(variables, variableId)
          : undefined;
      if (typeof current !== 'object' || current === null) {
        return {
          status: 'refused',
          message:
            'This attribute is no longer in the codebook. Choose another one.',
        };
      }
      if (Reflect.get(current, 'component') === component) {
        return { status: 'unchanged' };
      }

      let request;
      try {
        request = buildUpdateVariableRequest({
          requestId: uuid(),
          description: `Set the input control for "${Reflect.get(current, 'name') as string}"`,
          subject,
          authoritativeDocument: document,
          variableId,
          draft: { component },
        });
      } catch (error: unknown) {
        return { status: 'refused', message: refusalMessage(error) };
      }

      const result = await controller.requestCompoundEdit(request);
      if (result.status === 'applied') return { status: 'unchanged' };
      if (result.status === 'blocked') {
        return { status: 'refused', message: BLOCKED };
      }
      return { status: 'refused', message: result.message };
    },
    [controller, protocolContext, subject],
  );
}

/** The authoritative section document the new variable is added to. */
function codebookDocument(
  protocolContext: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
): SectionDoc | undefined {
  const definition =
    subject.entity === 'ego'
      ? protocolContext.codebook.ego
      : protocolContext.codebook[subject.entity]?.[subject.type];
  return definition === undefined ? undefined : { ...definition };
}
