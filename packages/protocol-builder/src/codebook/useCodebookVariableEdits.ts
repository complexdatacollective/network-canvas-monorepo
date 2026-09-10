import { useCallback, useMemo, useRef } from 'react';
import { v4 as uuid } from 'uuid';

import { defineMessages, formatMessageError } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import {
  VARIABLE_TYPE_COMPONENTS,
  type VariableType,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { codebookRefusalMessage } from './compoundFailureCopy.ts';
import {
  documentWithCreatedVariable,
  documentWithUpdatedVariable,
  type CodebookDraftIssue,
  DuplicateVariableNameError,
  InvalidCodebookDraftError,
  MissingVariableError,
  sectionIdForCodebookSubject,
} from './editing.ts';
import { optionsShapeFor } from './variableOptions.ts';
import { parametersForShape, parameterShapeFor } from './variableParameters.ts';
import {
  useCodebookSectionWrite,
  type CodebookWriteOutcome,
} from './writes.ts';

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

export type SetVariableComponentOutcome =
  /**
   * There was nothing to write: the codebook already collects the attribute
   * with this control. Told apart from `written` because a caller that has to
   * answer for the write — where it landed, what to say about it — has nothing
   * to answer for when no write was made.
   */
  | Readonly<{ status: 'unchanged' }>
  /** The codebook now says so. */
  | Readonly<{ status: 'written' }>
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
});

/**
 * The package's one sentence for "inventing the attribute did not happen, and
 * there is nothing more specific to say about why".
 *
 * Exported because the event is not this hook's alone: anything that asks for
 * an attribute to be created can be refused by something that gives no reason
 * of its own, and a second wording of it would be a second thing for a
 * researcher to learn.
 */
export const createVariableRefused = messages.refusedUnchanged;

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

/**
 * What ONE refusal from the codebook schema says to the researcher, or
 * `undefined` when it is not about anything they can see.
 *
 * The schema's issues are written for whoever reads a log: a name with a space
 * in it comes back as a pattern complaint against a path. Which control the
 * researcher has to fix in is decided by what the issue is ANCHORED at — the
 * same reading `VariableEditor` does of the same issues.
 */
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
  // `VariableSchema` is a plain union of eleven whole variable shapes, so a
  // control the kind of answer cannot take fails every branch and zod hoists
  // nothing: what arrives is ONE issue at the empty path saying this is not any
  // kind of attribute. The draft it judged is what settles it, and a control
  // the answer is never collected with is the refusal the researcher just made
  // and can undo. Every other unanchored refusal is left to the fallback.
  if (issue.path.length === 0 && controlIsNotOffered(draft)) {
    return intl.formatMessage(messages.unsupportedControl);
  }
  return undefined;
};

/**
 * What the researcher is told about a codebook write the builder refused.
 *
 * Never `error.message`: the builder's own words are the module-internal "the
 * variable draft is invalid" and record ids the researcher has never seen,
 * while this lands on the control they were using. `fallback` is the caller's
 * sentence for "nothing was written", which differs between inventing an
 * attribute and changing how one is collected.
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
  if (error instanceof MissingVariableError) {
    return intl.formatMessage(messages.missingVariable);
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
 * A refusal a codebook write answered with, in the reader's own words.
 *
 * `writes.ts` encodes them so a refusal a surface is still showing follows a
 * change of language; a sentence that is not one of ours passes through
 * untouched.
 */
const readRefusal = (message: string, intl: IntlShape): string =>
  formatMessageError(message, intl) ?? message;

/**
 * A codebook refusal in the words a STAGE row needs.
 *
 * One of them differs by surface. The codebook's own editors answer a subject
 * that has been deleted by telling the researcher to close the editor and
 * start again, and there is no codebook editor open on a row inside a stage:
 * what they have to do there is choose what the stage works with again.
 */
const rowRefusal = (outcome: CodebookWriteOutcome, intl: IntlShape): string => {
  if (outcome.status !== 'refused') {
    throw new TypeError('a codebook write that was not refused has no refusal');
  }
  return readRefusal(
    outcome.refusal.kind === 'sectionGone'
      ? codebookRefusalMessage({ kind: 'subjectGone' })
      : outcome.message,
    intl,
  );
};

/**
 * Adds an attribute to the codebook from inside a stage editor.
 *
 * The write commits on its own, under the codebook section's own lock, before
 * the row that names the attribute is committed: an attribute exists in the
 * codebook the moment it is created, and cancelling the stage edit leaves it
 * there. That is what lets a row reference it at all.
 *
 * Every refusal is answered rather than thrown: a section a collaborator is
 * holding, a name they have just taken, a type deleted underneath the stage
 * are all things the researcher can act on, and all of them mean the same
 * thing to the caller — nothing was written, so do not commit the row.
 *
 * What each refusal READS like is this package's own words, never the host's.
 * See `refusalMessage`, which reads what the schema refused and says it where
 * the researcher was working.
 */
export function useCreateCodebookVariable(
  subject: CodebookSubject | undefined,
): CreateCodebookVariable {
  const write = useCodebookSectionWrite();
  const protocolContext = useProtocolContext();
  const intl = useAppIntl();

  return useCallback(
    async (variable) => {
      if (subject === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.noSubject),
        };
      }
      // The record id is minted here and never shown: a researcher renames an
      // attribute, and a protocol whose references were its old name would
      // break on the rename.
      const variableId = uuid();
      const draft = {
        name: variable.name,
        type: variable.type,
        ...(variable.component === undefined
          ? {}
          : { component: variable.component }),
        ...(variable.validation === undefined
          ? {}
          : { validation: variable.validation }),
      };

      // The builder refuses a duplicate name, an id already in use and a draft
      // the codebook schema will not accept. The first and the last are the
      // researcher's to resolve; an id already in use is a collision this hook
      // minted and nothing they can act on. Read here, where the draft that was
      // refused is still in hand.
      let refusal: string | undefined;
      const outcome = await write(subject, (authoritativeDocument) => {
        try {
          return documentWithCreatedVariable({
            subject,
            authoritativeDocument,
            variableId,
            protocolContext,
            draft,
          });
        } catch (error: unknown) {
          refusal = refusalMessage(
            error,
            { type: variable.type, component: variable.component },
            intl.formatMessage(messages.refusedUnchanged),
            intl,
          );
          throw error;
        }
      });

      if (outcome.status === 'applied')
        return { status: 'created', variableId };
      return {
        status: 'refused',
        message: refusal ?? rowRefusal(outcome, intl),
      };
    },
    [intl, protocolContext, subject, write],
  );
}

/**
 * Records which input control an existing attribute is collected with.
 *
 * The control belongs to the codebook variable rather than to the field that
 * renders it — one attribute is collected the same way wherever it is asked
 * for, or an export would hold answers gathered through two different
 * controls under one name. So a form field choosing a control is a codebook
 * edit, and commits on its own like any other.
 *
 * A control that already matches is not written: an unchanged save must not
 * put a revision on the codebook section that a collaborator has to merge.
 */
export function useSetVariableComponent(
  subject: CodebookSubject | undefined,
): SetVariableComponent {
  const write = useCodebookSectionWrite();
  const protocolContext = useProtocolContext();
  const intl = useAppIntl();

  return useCallback(
    async (variableId, component) => {
      if (subject === undefined) {
        return {
          status: 'refused',
          message: intl.formatMessage(messages.noSubject),
        };
      }
      // The only reading of the cache here, and only to skip a write that has
      // nothing to say: an unchanged save must not put a revision on the
      // codebook section that a collaborator has to merge. A cache that has not
      // arrived yet is not an answer, so it goes on and asks the host.
      if (
        variableComponent(protocolContext, subject, variableId) === component
      ) {
        return { status: 'unchanged' };
      }

      let refusal: string | undefined;
      const outcome = await write(subject, (authoritativeDocument) => {
        const variables = authoritativeDocument.variables;
        const current =
          typeof variables === 'object' && variables !== null
            ? Reflect.get(variables, variableId)
            : undefined;
        if (typeof current !== 'object' || current === null) {
          refusal = intl.formatMessage(messages.missingVariable);
          throw new MissingVariableError(variableId);
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
        // nothing it takes was authored.
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

        try {
          return documentWithUpdatedVariable({
            subject,
            authoritativeDocument,
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
          refusal = refusalMessage(
            error,
            { type, component },
            intl.formatMessage(messages.refusedControlUnchanged),
            intl,
          );
          throw error;
        }
      });

      if (outcome.status === 'applied') return { status: 'written' };
      return {
        status: 'refused',
        message: refusal ?? rowRefusal(outcome, intl),
      };
    },
    [intl, protocolContext, subject, write],
  );
}

/**
 * Whether the subject a codebook write was started FOR is still the one this
 * editor collects into.
 *
 * A collaborator can repoint the stage at another type inside the round trip.
 * A record key belongs to exactly one type, so the row the id would be written
 * into is now a row about something else, which can neither resolve it nor
 * save it. The write is not undone; only the assignment must not happen.
 *
 * A getter reading a ref rather than a value, because the answer is needed
 * AFTER an await, in a closure made before it.
 */
function useSubjectStillCollected(
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

/** Where a codebook round trip's answer belongs by the time it arrives. */
export type AnswerLands = 'here' | 'onAnotherType' | 'besideAnotherAttribute';

/**
 * What a codebook round trip was asked FOR.
 *
 * Both halves are captured when the request goes out, because both of them are
 * what the answer will be applied to: the codebook section the write was
 * addressed to, and the attribute the surface asking for it was pointed at.
 */
export type CodebookAnswerTarget = Readonly<{
  subject: CodebookSubject;
  /** The attribute the surface filled in when the request went out. */
  fillsIn: string | undefined;
}>;

/**
 * Reads, when a codebook write ANSWERS, whether it still belongs where it was
 * asked from.
 *
 * Two ways to get it wrong, and they are the two answers other than `here`.
 * The stage can be repointed at another type inside the write
 * (`onAnotherType`), so the write landed in a codebook this surface no longer
 * reads. And the FIELD the answer would be written into can move
 * (`besideAnotherAttribute`) — a researcher re-answering a picker while a
 * create is in flight, or a collaborator rebinding the row a control was being
 * chosen for — so applying the answer there writes it about an attribute
 * nobody was looking at.
 *
 * Neither undoes the write: it landed where it was addressed. What is in
 * question is only what happens HERE.
 *
 * `fillsIn` is read through a function rather than taken as a value because
 * the answer is needed AFTER an await, in a closure made before it. A caller
 * holding it as a render value passes `() => value`.
 */
export function useWhereTheAnswerLands(
  subject: CodebookSubject | undefined,
  fillsIn: () => string | undefined,
): (asked: CodebookAnswerTarget) => AnswerLands {
  const subjectStillCollected = useSubjectStillCollected(subject);
  const live = useRef(fillsIn);
  live.current = fillsIn;
  return useCallback(
    (asked) => {
      if (!subjectStillCollected(asked.subject)) return 'onAnotherType';
      return live.current() === asked.fillsIn
        ? 'here'
        : 'besideAnotherAttribute';
    },
    [subjectStillCollected],
  );
}

/**
 * The authoritative section document a subject's attributes live in, for a
 * section that hands it to one of the codebook's own editors.
 *
 * Memoised on the definition the protocol context holds, so it changes exactly
 * when the codebook does rather than on every render.
 */
export function useCodebookSectionDocument(
  subject: CodebookSubject | undefined,
): SectionDoc | undefined {
  const protocolContext = useProtocolContext();
  return useMemo(
    () =>
      subject === undefined
        ? undefined
        : codebookDocument(protocolContext, subject),
    [protocolContext, subject],
  );
}

/** Which control the cache currently says an attribute is collected with. */
function variableComponent(
  protocolContext: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
  variableId: string,
): unknown {
  const variables = codebookDocument(protocolContext, subject)?.variables;
  const variable =
    typeof variables === 'object' && variables !== null
      ? Reflect.get(variables, variableId)
      : undefined;
  return typeof variable === 'object' && variable !== null
    ? Reflect.get(variable, 'component')
    : undefined;
}

/** The authoritative section document one subject's attributes live in. */
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
