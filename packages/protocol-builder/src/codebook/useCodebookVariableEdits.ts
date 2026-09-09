import { useCallback, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  VARIABLE_TYPE_COMPONENTS,
  type VariableType,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

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
  sectionIdForCodebookSubject,
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

const messages = defineMessages({
  refusedUnchanged: {
    id: 'protocolBuilder.codebookEditing.createVariableRefused',
    defaultMessage:
      'This attribute could not be created, so nothing was changed. Try again.',
    description:
      'Refusal shown on the attribute control of a stage editor when inventing a new attribute (a codebook variable) failed for a reason with no explanation of its own.',
  },
  refusedControlUnchanged: {
    id: 'protocolBuilder.codebookEditing.setComponentRefused',
    defaultMessage:
      'This attribute’s input control could not be changed, so nothing was changed. Try again.',
    description:
      'Refusal shown on the input-control dropdown of a stage editor when recording which control an attribute is collected with failed for a reason with no explanation of its own.',
  },
  noSubject: {
    id: 'protocolBuilder.codebookEditing.noSubject',
    defaultMessage:
      'Choose what this stage works with before creating an attribute.',
    description:
      'Refusal shown when a researcher tries to invent an attribute before choosing which node or edge type the stage (one step of an interview) is about, so there is no codebook section to add it to.',
  },
  missingType: {
    id: 'protocolBuilder.codebookEditing.missingType',
    defaultMessage:
      'This type is no longer in the codebook, so an attribute cannot be added to it.',
    description:
      'Refusal shown when the node or edge type the stage works with has been deleted from the codebook — the protocol’s definition of what an interview records — while the researcher was editing.',
  },
  nameTaken: {
    id: 'protocolBuilder.codebookEditing.nameTaken',
    defaultMessage:
      'An attribute with this name already exists here. Choose another name.',
    description:
      'Refusal shown under the name field when another attribute of the same type is already called that.',
  },
  missingVariable: {
    id: 'protocolBuilder.codebookEditing.missingVariableHere',
    defaultMessage:
      'This attribute is no longer in the codebook. Choose another one.',
    description:
      'Refusal shown on the attribute control of a stage editor when the attribute a row names has been deleted from the codebook while the researcher was editing.',
  },
  unsupportedControl: {
    id: 'protocolBuilder.codebookEditing.unsupportedControl',
    defaultMessage:
      'This attribute cannot be collected with that input control.',
    description:
      'Refusal shown on the input-control dropdown when the control chosen cannot collect the kind of answer this attribute holds.',
  },
  nameInvalid: {
    id: 'protocolBuilder.codebookEditing.newVariableNameInvalid',
    defaultMessage:
      'Not a valid attribute name. Only letters, numbers and the symbols ._-: are supported',
    description:
      'Refusal shown under the name field of a stage editor when the name typed for a new attribute holds characters the export formats cannot carry. The listed symbols are literal characters and must not be translated. Said in the same words as the row-cell rule that judges an attribute name as it is typed.',
  },
  createDescription: {
    id: 'protocolBuilder.codebookEditing.createDescription',
    defaultMessage: 'Create the attribute "{name}"',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers. name is the attribute name the researcher typed.',
  },
  setComponentDescription: {
    id: 'protocolBuilder.codebookEditing.setComponentDescription',
    defaultMessage: 'Set the input control for "{name}"',
    description:
      'What the change is called in the record a host keeps of protocol edits, and in any undo history it offers. name is the attribute’s researcher-facing name.',
  },
});

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
 *
 * A refusal anchored at NOTHING is read against the draft instead; see the
 * union below.
 */
/** Narrows a value read back out of an unknown document. */
const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * As much of the refused draft as reading its refusal needs: which kind of
 * answer it was to hold, and which control it was to be collected with.
 */
type RefusedDraft = Readonly<{ type: unknown; component: unknown }>;

const isVariableType = (value: unknown): value is VariableType =>
  typeof value === 'string' && Object.hasOwn(VARIABLE_TYPE_COMPONENTS, value);

/**
 * Whether the draft asks for a control its kind of answer is never collected
 * with.
 *
 * `VARIABLE_TYPE_COMPONENTS` is the schema's own table — the same one the
 * form-field dialog fills its list of controls from — so this asks the
 * question the schema asked, rather than keeping a second opinion about it.
 * A draft naming no control at all is not asking it.
 */
const controlIsNotOffered = ({ type, component }: RefusedDraft): boolean => {
  if (component === undefined || !isVariableType(type)) return false;
  const offered: readonly string[] = VARIABLE_TYPE_COMPONENTS[type];
  return typeof component !== 'string' || !offered.includes(component);
};

const draftIssueMessage = (
  issue: CodebookDraftIssue,
  draft: RefusedDraft,
  intl: IntlShape,
): string | undefined => {
  if (issue.path[0] === 'name') {
    return intl.formatMessage(messages.nameInvalid);
  }
  if (issue.path[0] === 'component') {
    return intl.formatMessage(messages.unsupportedControl);
  }
  /**
   * `VariableSchema` is a plain union of eleven whole variable shapes, so a
   * control the kind of answer cannot take fails every branch — its own at
   * `component`, all the others at `type` — and zod hoists nothing: what
   * arrives is ONE issue at the empty path saying that this is not any kind of
   * attribute, not which part of it is wrong. Anchored at nothing, it has no
   * sentence of its own.
   *
   * The draft it judged is what settles it. A control that is not one this
   * kind of answer is ever collected with is a refusal on its own, whatever
   * else the draft may also be wrong about — and it is the one the researcher
   * just made and can undo. Every other unanchored refusal (a categorical
   * attribute with no list of answers, which is the case beside this one) is
   * left to the caller's own fallback, exactly as before.
   */
  if (issue.path.length === 0 && controlIsNotOffered(draft)) {
    return intl.formatMessage(messages.unsupportedControl);
  }
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
const refusalMessage = (
  error: unknown,
  draft: RefusedDraft,
  fallback: string,
  intl: IntlShape,
): string => {
  if (error instanceof DuplicateVariableNameError) {
    return intl.formatMessage(messages.nameTaken);
  }
  if (error instanceof InvalidCodebookDraftError) {
    for (const issue of error.issues) {
      const message = draftIssueMessage(issue, draft, intl);
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
 * The REQUEST is no exception, which is why it is awaited inside a `try`. A
 * session that has stopped accepting changes refuses this one by throwing
 * (`assertEditable`), and access is taken away by a message from the host: it
 * lands before React has re-rendered the control the researcher is looking at,
 * so the click already on its way reaches a handler that is about to be
 * refused. Every caller here marks itself busy across the await and clears it
 * afterwards, and a rejection escaping this promise left that mark set for
 * good — the control never came back, even once editing did.
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
  const intl = useAppIntl();

  return useCallback(
    async (variable) => {
      if (subject === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.noSubject),
        };
      }

      const document = codebookDocument(protocolContext, subject);
      if (document === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.missingType),
        };
      }

      // The record id is minted here and never shown: a researcher renames an
      // attribute, and a protocol whose references were its old name would
      // break on the rename.
      const variableId = uuid();
      let request;
      try {
        request = buildCreateVariableRequest({
          requestId: uuid(),
          description: intl.formatMessage(messages.createDescription, {
            name: variable.name,
          }),
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
          message: refusalMessage(
            error,
            { type: variable.type, component: variable.component },
            intl.formatMessage(messages.refusedUnchanged),
            intl,
          ),
        };
      }

      let result;
      try {
        result = await controller.requestCompoundEdit(request);
      } catch {
        // Nothing more specific to say: the session refused to carry the
        // request at all, so no host answered and there is no failure of its
        // own to read. `CreatableVariablePickerControl` answers a caller that
        // throws the same way, for the same reason.
        return {
          status: 'refused',
          message: intl.formatMessage(messages.refusedUnchanged),
        };
      }
      if (result.status === 'applied') {
        return { status: 'created', variableId };
      }
      return {
        status: 'refused',
        message: compoundFailureMessage({ kind: 'result', result }, intl),
      };
    },
    [controller, intl, protocolContext, subject],
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
  const intl = useAppIntl();

  return useCallback(
    async (variableId, component) => {
      if (subject === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.noSubject),
        };
      }
      const document = codebookDocument(protocolContext, subject);
      if (document === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.missingType),
        };
      }
      const variables = document.variables;
      const current =
        typeof variables === 'object' && variables !== null
          ? Reflect.get(variables, variableId)
          : undefined;
      if (typeof current !== 'object' || current === null) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.missingVariable),
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
          description: intl.formatMessage(messages.setComponentDescription, {
            // A variable with no name is one the same function has already
            // prepared for — it re-reads `current` defensively above — and
            // asserting a `string` out of `Reflect.get` would write `Set the
            // input control for "undefined"` into whatever record the host
            // keeps of protocol edits. The id is the only other thing that
            // identifies it.
            name: asString(Reflect.get(current, 'name')) ?? variableId,
          }),
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
          message: refusalMessage(
            error,
            { type, component },
            intl.formatMessage(messages.refusedControlUnchanged),
            intl,
          ),
        };
      }

      // Awaited inside a `try` for the reason `useCreateCodebookVariable`
      // gives: a session that has stopped accepting changes refuses the
      // request by throwing, and this hook's contract is that it answers.
      let result;
      try {
        result = await controller.requestCompoundEdit(request);
      } catch {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.refusedControlUnchanged),
        };
      }
      if (result.status === 'applied') return { status: 'unchanged' };
      return {
        status: 'refused',
        message: compoundFailureMessage({ kind: 'result', result }, intl),
      };
    },
    [controller, intl, protocolContext, subject],
  );
}

/**
 * Whether the subject a codebook write was started FOR is still the one this
 * editor collects into.
 *
 * Every create here is a round trip through the host, and a collaborator can
 * repoint the stage at another type inside it. What comes back is an attribute
 * that exists — in the codebook of the type the stage collected about when the
 * researcher asked for it — and a record key belongs to exactly one type, so
 * the row the id would be written into is now a row about something else, which
 * can neither resolve it nor save it. The write is not undone; only the
 * assignment must not happen. Callers say so with `createdUnassigned`.
 *
 * A getter reading a ref rather than a value, because the answer is needed
 * AFTER an await, in a closure made before it: read as a value it would be the
 * subject as it stood when the researcher pressed the button, which is the one
 * thing already known.
 */
export function useSubjectStillCollected(
  subject: CodebookSubject | undefined,
): (startedWith: CodebookSubject) => boolean {
  const live = useRef(subject);
  live.current = subject;
  return useCallback((startedWith) => {
    const now = live.current;
    return (
      now !== undefined &&
      sectionIdForCodebookSubject(now) ===
        sectionIdForCodebookSubject(startedWith)
    );
  }, []);
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
