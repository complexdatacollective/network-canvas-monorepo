import { useCallback, useMemo } from 'react';
import { v4 as uuid } from 'uuid';

import type { VariableType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { allowedNameMessage } from '../form/arrayFields/rowValidators.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import { compoundFailureMessage } from './compoundFailureCopy.ts';
import {
  buildCreateVariableRequest,
  buildUpdateVariableRequest,
  type CodebookDraftIssue,
  DuplicateVariableNameError,
  InvalidCodebookDraftError,
} from './editing.ts';
import { optionsShapeFor } from './variableOptions.ts';
import { parametersForShape, parameterShapeFor } from './variableParameters.ts';

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

const REFUSED_CONTROL_UNCHANGED =
  'This attribute’s input control could not be changed, so nothing was changed. Try again.';

const NO_SUBJECT =
  'Choose what this stage works with before creating an attribute.';

const MISSING_TYPE =
  'This type is no longer in the codebook, so an attribute cannot be added to it.';

const NAME_TAKEN =
  'An attribute with this name already exists here. Choose another name.';

const UNSUPPORTED_CONTROL =
  'This attribute cannot be collected with that input control.';

/**
 * What ONE refusal from the codebook schema says to the researcher, or
 * `undefined` when it is not about anything they can see.
 *
 * An `InvalidCodebookDraftError` carries the schema's own issues, and those are
 * written for whoever reads a log: a name with a space in it comes back as a
 * pattern complaint against a path. Which control the researcher has to fix in
 * is decided here, by what the issue is ANCHORED at — the same reading
 * `VariableEditor` does of the same issues, and the same words the row cell,
 * the entity editor and the request builder use for the name rule.
 */
const draftIssueMessage = (issue: CodebookDraftIssue): string | undefined => {
  if (issue.path[0] === 'name') return allowedNameMessage('attribute name');
  if (issue.path[0] === 'component') return UNSUPPORTED_CONTROL;
  return undefined;
};

/**
 * What the researcher is told about a codebook write the builder refused.
 *
 * Never `error.message`. Every throw the builder raises is written for whoever
 * reads a log — `InvalidCodebookDraftError`'s is the module-internal "the
 * variable draft is invalid", and the id errors name a record id the researcher
 * has never seen — and this message lands on the control they were using: the
 * Attribute picker on a form-field row, the Input control select. The same rule
 * `compoundFailureCopy` follows for a refusal from the host.
 *
 * `fallback` is the caller's own sentence for "nothing was written", because
 * what the researcher just asked for differs between inventing an attribute
 * and changing how one is collected.
 */
const refusalMessage = (error: unknown, fallback: string): string => {
  if (error instanceof DuplicateVariableNameError) return NAME_TAKEN;
  if (error instanceof InvalidCodebookDraftError) {
    for (const issue of error.issues) {
      const message = draftIssueMessage(issue);
      if (message !== undefined) return message;
    }
  }
  return fallback;
};

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
 *
 * What each refusal READS like is `compoundFailureCopy`'s, exactly as it is for
 * the three codebook editors: a compound result's own `message` is written for
 * whoever reads a log, and it lands here on the control the researcher was
 * using — "Too small: expected array to have >=1 items" beside an attribute's
 * name. The builder's own throws are no exception: see `refusalMessage`, which
 * reads what the schema refused and says it in this package's own words.
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
        // draft the codebook schema will not accept. The first and the last are
        // the researcher's to resolve; an id already in use is a collision this
        // hook minted and nothing they can act on.
        return {
          status: 'refused',
          message: refusalMessage(error, REFUSED_UNCHANGED),
        };
      }

      const result = await controller.requestCompoundEdit(request);
      if (result.status === 'applied') {
        return { status: 'created', variableId };
      }
      return {
        status: 'refused',
        message: compoundFailureMessage({ kind: 'result', result }),
      };
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

      // What a control shows, and what it is configured WITH, both go with it
      // when it is replaced by one that cannot carry them. Two blocks, one
      // rule, and both are the codebook refusing the variable rather than a
      // stale setting left lying about — so a write that left either behind
      // would be refused with it.
      //
      // `options`: `Boolean` names the two answers a participant chooses
      // between, while `Toggle` is a switch whose variable schema has no
      // `options` key at all.
      //
      // `parameters`: datetime is split into two variable schemas keyed on
      // `component`, and each is a `strictObject` — a `DatePicker`'s
      // `{type: 'year'}` is not a key a `RelativeDatePicker` may hold. So the
      // block is re-shaped to what the NEW control takes, and dropped when
      // nothing it takes was authored. `VariableEditor` does the same on its
      // own save, through the same `parametersForShape`; the row's save did
      // not, and switching a configured date picker to a relative one was
      // refused outright.
      //
      // Architect clears the same properties from the same fact, in
      // `clearInapplicableCodebookProperties`.
      const type = Reflect.get(current, 'type');
      const nextShape = parameterShapeFor(type, component);
      const parametersMoved =
        nextShape !==
        parameterShapeFor(type, Reflect.get(current, 'component'));
      const parameters =
        nextShape === null
          ? undefined
          : parametersForShape(nextShape, Reflect.get(current, 'parameters'));

      let request;
      try {
        request = buildUpdateVariableRequest({
          requestId: uuid(),
          description: `Set the input control for "${Reflect.get(current, 'name') as string}"`,
          subject,
          authoritativeDocument: document,
          variableId,
          draft: {
            component,
            ...(parametersMoved && parameters !== undefined
              ? { parameters }
              : {}),
          },
          replaceProperties: [
            ...(optionsShapeFor(type, component) === null ? ['options'] : []),
            ...(parametersMoved ? ['parameters'] : []),
          ],
        });
      } catch (error: unknown) {
        return {
          status: 'refused',
          message: refusalMessage(error, REFUSED_CONTROL_UNCHANGED),
        };
      }

      const result = await controller.requestCompoundEdit(request);
      if (result.status === 'applied') return { status: 'unchanged' };
      return {
        status: 'refused',
        message: compoundFailureMessage({ kind: 'result', result }),
      };
    },
    [controller, protocolContext, subject],
  );
}

/**
 * The authoritative section document a subject's attributes live in, for a
 * section that hands it to one of the codebook's own editors.
 *
 * Those editors reconcile a draft against the document they were given, so a
 * fresh object on every render would have them reconcile against a change
 * nobody made and warn that the codebook moved. Memoised on the definition the
 * protocol context holds, so it changes exactly when the codebook does.
 */
export function useCodebookSectionDocument(
  subject: CodebookSubject | undefined,
): SectionDoc | null {
  const { protocolContext } = useStageEditorForm();
  return useMemo(
    () =>
      subject === undefined
        ? null
        : (codebookDocument(protocolContext, subject) ?? null),
    [protocolContext, subject],
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
