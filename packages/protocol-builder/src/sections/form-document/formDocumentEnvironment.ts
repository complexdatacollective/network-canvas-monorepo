import { createContext, useContext } from 'react';

import type { MessageDescriptor, IntlShape } from '@codaco/app-i18n/messages';
import type {
  InterfaceText,
  LocaleTag,
  Variables,
} from '@codaco/protocol-validation';

import {
  attributeAvailabilityMessages,
  attributeChoices,
  formCannotCollectReason,
  markCrossClassUses,
  markListed,
} from '../../codebook/attributeAvailability.ts';
import {
  buildVariableRoleMap,
  type VariableRoleMap,
} from '../../codebook/variableRoles.ts';
import { attributeGroupMessages } from '../../fields/attributeGroups.ts';
import type { DynamicMessageSite } from '../../fields/dynamicText/messageSite.ts';
import type { VariablePickerGroup } from '../../fields/VariablePickerList.tsx';
import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import type {
  CodebookSubject,
  ProtocolBuilderProtocolContext,
} from '../../protocol-context.ts';
import { isCollectableType } from '../collectableTypes.ts';
import type { FieldCodebookWrites } from './fieldCodebookWrites.ts';
import { formDocumentMessages } from './formDocumentMessages.ts';
import type { FormFieldDraft } from './formDocumentValue.ts';

/**
 * What a field block's view can do to its own block, registered by the view
 * so that the attribute picker, which stands outside the block, can finish
 * the block it was opened for.
 */
export type FieldBlockHandle = Readonly<{
  update: (
    changes: Partial<Readonly<{ fieldId: string; variable: string }>>,
  ) => void;
  remove: () => void;
  /** Selects the block, as a click on it does. */
  select: () => void;
  /** Whether the block's question and hint are both empty. */
  isEmpty: () => boolean;
  element: () => HTMLElement | null;
  /**
   * Moves the keyboard to the first control of the field's settings, while
   * they are open; does nothing otherwise.
   */
  focusSettings: () => void;
}>;

/** Which field's attribute picker is open, and what it stands beside. */
export type FieldPickerTarget = Readonly<{
  fieldId: string;
  /** The block itself (Mod-Shift-F, or its pill), or the Field button. */
  anchor: HTMLElement;
  origin: 'toolbar' | 'block';
  /**
   * The field has an attribute that the codebook no longer has, and another
   * is chosen for it. Dismissing the list leaves the field as it is.
   */
  repair?: true;
}>;

/** What the attributes a form cannot collect are refused with, by its host. */
export type FormAttributeRules = Readonly<{
  /** See `FormDocumentSectionProps.draftUnvalidatedVariables`. */
  draftUnvalidated: ReadonlySet<string>;
  draftUnvalidatedReason: ((variableId: string) => string) | undefined;
  /** See `FormDocumentSectionProps.reservedVariables`. */
  reserved: ReadonlySet<string>;
  reservedReason: MessageDescriptor | undefined;
  /** Said when a save finds a field collecting a reserved attribute. */
  reservedRefusal: MessageDescriptor | undefined;
  /** The stage whose saved unvalidated writes the draft replaces. */
  answeredFor: string | undefined;
}>;

/**
 * What a stage editor's form editor adds: whose codebook the form collects
 * into, and what the fields' settings read and write. Each field's question
 * and hint are typed in its block, and its settings open beside it.
 */
export type FormDocumentStageEnvironment = Readonly<{
  kind: 'stage';
  subject: CodebookSubject | undefined;
  protocolContext: ProtocolBuilderProtocolContext;
  /** The id of the stage being edited. */
  stageId: string;
  rules: FormAttributeRules;
  writes: FieldCodebookWrites;
  /**
   * The field that answers for the problems of the form's fields, while a
   * refused save shows them: its block carries the attributes that name the
   * form's fields (`data-field-path` and its kin), so the list of problems
   * names that field and takes the researcher to it.
   */
  fieldsIssue: Readonly<{ fieldId: string; seam: FieldErrorSeam }> | undefined;
}>;

/**
 * Where the form is written: in a stage editor (`FormDocumentStageEnvironment`),
 * or in the translation table, where only the text is translated. There each
 * field's question and hint are shown, and translated in rows of their own,
 * and the fields that can be put in are the ones that the form already has.
 */
export type FormDocumentEditingEnvironment =
  | FormDocumentStageEnvironment
  | Readonly<{ kind: 'translation' }>;

/**
 * Everything the views inside the form editor read: the form's fields, the
 * language being edited, the attribute picker, and where the form is
 * written (`editing`).
 */
export type FormDocumentEnvironment = Readonly<{
  /** The subject's attributes, with the stage's codebook changes laid over. */
  variables: Readonly<Variables>;
  localization: ProtocolLocalization | undefined;
  locale: LocaleTag;
  interfaceText: InterfaceText | undefined;
  /** The form's fields in every language. */
  fields: readonly FormFieldDraft[];
  /** The form's documents, by language. */
  content: Readonly<Record<string, string>>;
  editable: boolean;
  registerBlock: (fieldId: string, handle: FieldBlockHandle) => () => void;
  openPicker: (target: FieldPickerTarget) => void;
  /** A field is being put in (see `FormDocumentStageEditing.onFieldStarted`). */
  startField: (fieldId: string) => void;
  /**
   * Makes the block `handle` the form's field `fieldId`, which collects
   * `variable`, with its question and hint in this language where the block
   * contains them.
   */
  takeField: (
    handle: FieldBlockHandle,
    fieldId: string,
    variable: string,
  ) => void;
  /** What the form's text can show, for drawing the fields' questions. */
  site: DynamicMessageSite;
  editing: FormDocumentEditingEnvironment;
}>;

/** The attributes that make an element the field that an error is about. */
export type FieldErrorSeam = Readonly<{
  'data-field-name': string;
  'data-field-path': string;
  'data-field-form': string | undefined;
}>;

export const FormDocumentEnvironmentContext =
  createContext<FormDocumentEnvironment | null>(null);

export function useFormDocumentEnvironment(): FormDocumentEnvironment {
  const environment = useContext(FormDocumentEnvironmentContext);
  if (environment === null) {
    throw new Error(
      'A field block was drawn outside the form editor, so it cannot know which attributes its form collects.',
    );
  }
  return environment;
}

/**
 * The stage editor's part of the form editor's environment, for a view that
 * only the stage editor draws (a field's settings, the creation of an
 * attribute).
 */
export function useFormStageEnvironment(): FormDocumentStageEnvironment {
  const { editing } = useFormDocumentEnvironment();
  if (editing.kind !== 'stage') {
    throw new Error(
      'A field’s settings were drawn outside a stage editor, where they have no codebook to change.',
    );
  }
  return editing;
}

/** The heading of the group of attributes that a form about `subject` lists. */
const subjectGroupLabel = (
  subject: CodebookSubject | undefined,
): MessageDescriptor =>
  subject?.entity === 'ego'
    ? attributeGroupMessages.ego
    : subject?.entity === 'edge'
      ? attributeGroupMessages.edge
      : attributeGroupMessages.node;

/** The role map, read once for every list that a form editor draws. */
export const roleMapFor = (
  protocolContext: ProtocolBuilderProtocolContext,
  answeredFor: string | undefined,
): VariableRoleMap => buildVariableRoleMap(protocolContext, answeredFor);

/**
 * The attributes that a field of the form can collect, as one group of the
 * attribute list, each that cannot be chosen marked with the reason, in its
 * place: a kind of attribute that no form can ask for, an attribute that
 * another field of this language's document already collects (`taken`), one
 * that the interface around the form collects itself, and one that is set
 * without validation elsewhere. `held` is the field's own attribute, which is
 * never refused.
 */
export const fieldAttributeGroup = ({
  intl,
  subject,
  variables,
  roleMap,
  rules,
  taken,
  held,
}: Readonly<{
  intl: IntlShape;
  subject: CodebookSubject | undefined;
  variables: Readonly<Variables>;
  roleMap: VariableRoleMap;
  rules: FormAttributeRules;
  taken: Iterable<string>;
  held: string | undefined;
}>): VariablePickerGroup => {
  const label = intl.formatMessage(subjectGroupLabel(subject));
  if (subject === undefined) return { id: 'attributes', label, options: [] };
  const pool = attributeChoices(
    variables,
    isCollectableType,
    formCannotCollectReason(intl),
  );
  const withoutReserved = markListed(
    pool,
    rules.reserved,
    intl.formatMessage(
      rules.reservedReason ?? attributeAvailabilityMessages.sameStageField,
    ),
    held,
  );
  const withoutDraft = markListed(
    withoutReserved,
    rules.draftUnvalidated,
    rules.draftUnvalidatedReason ??
      intl.formatMessage(attributeAvailabilityMessages.draftUnvalidatedHere),
    held,
  );
  const options = markListed(
    markCrossClassUses(roleMap, subject, withoutDraft, 'validated', intl, held),
    taken,
    intl.formatMessage(attributeAvailabilityMessages.sameStageField),
    held,
  );
  return { id: 'attributes', label, options };
};

/**
 * The fields that the translation table can put in the text of a form: the
 * form's own fields, by their attributes, those that the text in this
 * language already places dimmed with the reason. New attributes and fields
 * are made in the stage editor.
 */
export const formFieldsGroup = ({
  intl,
  variables,
  fields,
  placed,
}: Readonly<{
  intl: IntlShape;
  variables: Readonly<Variables>;
  fields: readonly FormFieldDraft[];
  placed: Iterable<string>;
}>): VariablePickerGroup => {
  const collected = new Set(
    fields.flatMap(({ variable }) => (variable === '' ? [] : [variable])),
  );
  const own = Object.fromEntries(
    Object.entries(variables).filter(([variableId]) =>
      collected.has(variableId),
    ),
  );
  const options = markListed(
    attributeChoices(
      own,
      () => true,
      () => '',
    ),
    placed,
    intl.formatMessage(formDocumentMessages.inThisDocument),
  );
  return {
    id: 'fields',
    label: intl.formatMessage(formDocumentMessages.tableAttributeTitle),
    options,
  };
};

/**
 * Marks a dialog that something in a form's editor opens through `useDialog`
 * (a confirmation), which is drawn outside the form's editor: focus that
 * moves into it has not left the form (`FormDocumentField`). Give the dialog
 * `dataAttributes: FORM_DOCUMENT_POPUP.attributes`.
 */
export const FORM_DOCUMENT_POPUP = {
  attributes: { 'data-form-document-popup': '' },
  selector: '[data-form-document-popup]',
} as const;
