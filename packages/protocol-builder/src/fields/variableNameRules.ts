import {
  createMessageError,
  defineMessages,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { Variable } from '@codaco/protocol-validation';
import {
  CodebookNameSchema,
  findExportColumnConflicts,
  findLayoutExportColumnConflicts,
  normalizeCodebookName,
  normalizeForComparison,
  type ExportColumnConflict,
  type ExportColumnEntity,
  type ExportColumnOrigin,
  type ExportColumnVariable,
} from '@codaco/shared-consts';

const layoutMessages = defineMessages({
  layoutNameTaken: {
    id: 'protocolBuilder.layoutPicker.nameTaken',
    defaultMessage: 'the codebook already has a layout called that',
    description:
      'Reason given on the switched-off create row of the layout list, on the line under “A layout cannot be named “positions””, when another layout has the name typed. A layout is a named set of positions that a researcher places nodes in on a canvas. Written as a clause rather than a sentence.',
  },
  layoutNameTakenByAttribute: {
    id: 'protocolBuilder.layoutPicker.nameTakenByAttribute',
    defaultMessage:
      'the node type “{nodeType}” already has an attribute called that',
    description:
      'Reason given on the switched-off create row of the layout list when an attribute of a node type has the name typed. nodeType is the name of that node type and is the researcher’s own text, not translated. Written as a clause rather than a sentence.',
  },
  layoutColumnTaken: {
    id: 'protocolBuilder.layoutPicker.columnTaken',
    defaultMessage:
      'the export would write its positions to the column “{column}”, which is already used',
    description:
      'Reason given on the switched-off create row of the layout list when one of the position columns that the export writes for a layout, named after it, is already a column of the export. column is that column name and is not translated. The export is the file a researcher analyses after the interviews. Written as a clause rather than a sentence.',
  },
});

const messages = defineMessages({
  nameTaken: {
    id: 'protocolBuilder.variablePicker.nameTaken',
    defaultMessage: 'this type already has an attribute called that',
    description:
      'Reason given on the switched-off create row of the attribute list, on the line under “An attribute cannot be named “age””. Written as a clause rather than a sentence.',
  },
  nameTakenByLayout: {
    id: 'protocolBuilder.variablePicker.nameTakenByLayout',
    defaultMessage: 'the codebook already has a layout called that',
    description:
      'Reason given on the switched-off create row of the attribute list, on the line under “An attribute cannot be named “positions””, when a layout in the codebook already has the name typed. A layout is a named set of positions that a researcher places nodes in on a canvas. Written as a clause rather than a sentence.',
  },
  nameInvalid: {
    id: 'protocolBuilder.variablePicker.nameInvalid',
    defaultMessage:
      'a name cannot contain line breaks, tabs or other control characters',
    description:
      'Reason given on the switched-off create row of the attribute list when the name typed contains a character that cannot be stored in a name, such as a line break or a tab. Shown on the line under “An attribute cannot be named “…””, as a clause rather than a sentence. Names may otherwise be written in any language or script, with spaces and punctuation.',
  },
});

/*
 * One whole sentence for each way two export columns can meet. In every
 * description the export is the file a researcher analyses after the
 * interviews and a column is one field in it. Attribute names, option values
 * and column names are the researcher's own text, shown as given inside the
 * quotation marks, and are never translated.
 */
const reservedMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.reservedName',
    defaultMessage:
      'The export already has a built-in column called “{reservedColumn}”, so an attribute cannot be named “{column}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of a column the export always writes itself. column is the name typed; reservedColumn is the built-in column it matches, which can differ in capital letters. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.reservedOption',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a built-in column called “{reservedColumn}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to a column the export always writes itself. name is the attribute; value is the option; column is where it would be written; reservedColumn is the built-in column it matches. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.reservedLayout',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a built-in column called “{reservedColumn}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to a column the export always writes itself. name is the attribute; column is the position column; reservedColumn is the built-in column it matches. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

const siblingNameMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.siblingNameWithName',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for the attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of a column another attribute already writes. siblingColumn is that column; siblingName is the other attribute. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.siblingNameWithOption',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for option “{siblingValue}” of the attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of the column an option of a categorical attribute is exported to, such as “foo_bar” for option “bar” of “foo”. siblingColumn is that column; siblingValue is the option; siblingName is the categorical attribute. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.siblingNameWithLayout',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for the position of the layout attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute is the name of one of the position columns a layout attribute is exported to, such as “position_x”. siblingColumn is that column; siblingName is the layout attribute. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

const siblingOptionMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.siblingOptionWithName',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the attribute “{siblingName}” already has a column called “{siblingColumn}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to a column another attribute already writes. name is the categorical attribute; value is the option; column is where it would be written; siblingName is the other attribute; siblingColumn is its column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.siblingOptionWithOption',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for option “{siblingValue}” of the attribute “{siblingName}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of one categorical attribute would be exported to the same column as an option of another, which happens when two names and values run together the same way. name and value are the option being saved; column is where it would be written; siblingName and siblingValue are the other option; siblingColumn is its column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.siblingOptionWithLayout',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for the position of the layout attribute “{siblingName}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to the same column as a position of a layout attribute. name and value are the option being saved; column is where it would be written; siblingName is the layout attribute; siblingColumn is its position column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
});

const siblingLayoutMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.siblingLayoutWithName',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the attribute “{siblingName}” already has a column called “{siblingColumn}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to a column another attribute already writes. name is the layout attribute; column is the position column; siblingName is the other attribute; siblingColumn is its column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.siblingLayoutWithOption',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for option “{siblingValue}” of the attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when a position column of a layout attribute would be the same as the column an option of a categorical attribute is exported to. name is the layout attribute; column is the position column; siblingName and siblingValue are the categorical attribute and its option; siblingColumn is the option’s column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.siblingLayoutWithLayout',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for the position of the layout attribute “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when a position column of one layout attribute would be the same as a position column of another. name is the layout attribute being saved; column is its position column; siblingName is the other layout attribute; siblingColumn is its position column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

/*
 * For a column that a layout in the codebook already writes. A layout is a
 * named set of positions that a researcher places nodes in on a canvas, and
 * the export writes each node's position in it to columns named after it,
 * such as “seating_x”. Keyed by what produces the column being saved.
 */
const codebookLayoutMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.codebookLayoutWithName',
    defaultMessage:
      'The export already has a column called “{siblingColumn}” for the positions in the layout “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for a node attribute is the name of one of the position columns a layout is exported to, such as “seating_x” for the layout “seating”. A layout is a named set of positions that a researcher places nodes in on a canvas. siblingColumn is that column; siblingName is the layout. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.codebookLayoutWithOption',
    defaultMessage:
      'Option “{value}” of “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for the positions in the layout “{siblingName}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical node attribute would be exported to the same column as one of the position columns of a layout. A layout is a named set of positions that a researcher places nodes in on a canvas. name and value are the attribute and the option being saved; column is where it would be written; siblingName is the layout; siblingColumn is its position column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.codebookLayoutWithLayout',
    defaultMessage:
      'A layout attribute named “{name}” would be exported to a column called “{column}”, but the export already has a column called “{siblingColumn}” for the positions in the layout “{siblingName}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to the same column as a position column of a layout in the codebook. A layout is a named set of positions that a researcher places nodes in on a canvas. name is the layout attribute; column is its position column; siblingName is the layout; siblingColumn is its position column. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

/*
 * For a column that is different text from a column a layout in the codebook
 * writes, but that the export writes the same way. Keyed by what produces the
 * column being saved.
 */
const writtenCodebookLayoutMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.writtenCodebookLayoutName',
    defaultMessage:
      'In the export, the name “{column}” and the position column “{siblingColumn}” of the layout “{siblingName}” would become the same column, “{writtenColumn}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for a node attribute differs from a position column of a layout, but the export would write both as the same column name. A layout is a named set of positions that a researcher places nodes in on a canvas. The export changes some characters in a column name: GraphML files replace spaces and most punctuation with “_”, and CSV files put an apostrophe before a name that starts with =, +, - or @. column is the name typed; siblingColumn is the position column; siblingName is the layout; writtenColumn is the column name both would be written as. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.writtenCodebookLayoutOption',
    defaultMessage:
      'In the export, the column “{column}” for option “{value}” of “{name}” and the position column “{siblingColumn}” of the layout “{siblingName}” would become the same column, “{writtenColumn}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical node attribute would be exported to a column that differs from a position column of a layout, but the export would write both as the same column name. A layout is a named set of positions that a researcher places nodes in on a canvas. The export changes some characters in a column name: GraphML files replace spaces and most punctuation with “_”, and CSV files put an apostrophe before a name that starts with =, +, - or @. name is the categorical attribute; value is the option; column is where it would be written; siblingName is the layout; siblingColumn is its position column; writtenColumn is the column name both would be written as. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.writtenCodebookLayoutLayout',
    defaultMessage:
      'In the export, the position column “{column}” of the layout attribute “{name}” and the position column “{siblingColumn}” of the layout “{siblingName}” would become the same column, “{writtenColumn}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to a column that differs from a position column of a layout in the codebook, but the export would write both as the same column name. A layout is a named set of positions that a researcher places nodes in on a canvas. The export changes some characters in a column name: GraphML files replace spaces and most punctuation with “_”, and CSV files put an apostrophe before a name that starts with =, +, - or @. name is the layout attribute; column is its position column; siblingName is the layout; siblingColumn is its position column; writtenColumn is the column name both would be written as. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

/*
 * For two columns that are different text but that the export writes the same
 * way, such as GraphML's `close friend` and `close_friend`. Keyed by what
 * produces the column being saved; the column it meets is named as it is, so
 * one sentence serves whatever produces it.
 */
const writtenMessages = defineMessages({
  name: {
    id: 'protocolBuilder.exportColumn.writtenName',
    defaultMessage:
      'In the export, the name “{column}” and the column “{siblingColumn}” of the attribute “{siblingName}” would become the same column, “{writtenColumn}”. Choose a different name.',
    description:
      'Refusal shown when the name typed for an attribute differs from a column another attribute already writes, but the export would write both as the same column name. The export changes some characters in a column name: GraphML files replace spaces and most punctuation with “_”, and CSV files put an apostrophe before a name that starts with =, +, - or @. column is the name typed; siblingColumn is the other column; siblingName is the other attribute; writtenColumn is the column name both would be written as. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
  option: {
    id: 'protocolBuilder.exportColumn.writtenOption',
    defaultMessage:
      'In the export, the column “{column}” for option “{value}” of “{name}” and the column “{siblingColumn}” of the attribute “{siblingName}” would become the same column, “{writtenColumn}”. Change the option value or the attribute name.',
    description:
      'Refusal shown when an option of a categorical attribute would be exported to a column that differs from a column another attribute already writes, but the export would write both as the same column name. The export changes some characters in a column name: GraphML files replace spaces and most punctuation with “_”, and CSV files put an apostrophe before a name that starts with =, +, - or @. name is the categorical attribute; value is the option; column is where it would be written; siblingName is the other attribute; siblingColumn is its column; writtenColumn is the column name both would be written as. The export is the file a researcher analyses after the interviews and a column is one field in it. Names, values and columns are the researcher’s own text and are not translated.',
  },
  layout: {
    id: 'protocolBuilder.exportColumn.writtenLayout',
    defaultMessage:
      'In the export, the position column “{column}” of the layout attribute “{name}” and the column “{siblingColumn}” of the attribute “{siblingName}” would become the same column, “{writtenColumn}”. Choose a different name.',
    description:
      'Refusal shown when a layout attribute, which is exported as several position columns named after it, would write one of them to a column that differs from a column another attribute already writes, but the export would write both as the same column name. The export changes some characters in a column name: GraphML files replace spaces and most punctuation with “_”, and CSV files put an apostrophe before a name that starts with =, +, - or @. name is the layout attribute; column is the position column; siblingName is the other attribute; siblingColumn is its column; writtenColumn is the column name both would be written as. The export is the file a researcher analyses after the interviews and a column is one field in it. Names and columns are the researcher’s own text and are not translated.',
  },
});

/**
 * Keyed by what produces the column being saved, then by what produces the one
 * it meets. A name meeting a name as the same text cannot happen — equal
 * columns mean equal names, which the duplicate-name check refuses first — but
 * the pair is kept so the lookup is total and a column is never left without a
 * sentence.
 */
const siblingMessages = {
  name: siblingNameMessages,
  option: siblingOptionMessages,
  layout: siblingLayoutMessages,
} as const satisfies Record<
  ExportColumnOrigin['kind'],
  Record<ExportColumnOrigin['kind'], MessageDescriptor>
>;

/** One attribute of a type, as far as the columns it exports depend on it. */
export type ScopedVariable = ExportColumnVariable & Readonly<{ id: string }>;

/** A layout in the codebook, as far as a node attribute's name depends on it. */
export type ScopedLayout = Readonly<{ name: string }>;

/**
 * What a name is judged against: the attributes of one node type, one edge type
 * or the participant themselves, and which of those it is. Each carries its
 * record id so the attribute being renamed can be left out of its own way.
 * For a node type, also the codebook's layouts, whose names and position
 * columns a node attribute may not share.
 */
export type VariableNameScope = Readonly<{
  entity: ExportColumnEntity;
  variables: readonly ScopedVariable[];
  layouts: readonly ScopedLayout[];
}>;

/** One clash of export columns, in the words the codebook refuses it with. */
export type ExportColumnRefusal = Readonly<{
  /** What in the attribute being saved produces the column that clashes. */
  origin: ExportColumnOrigin;
  /** Encoded, so it is read in the language it is shown in. */
  message: string;
}>;

const refusalValues = (
  name: string,
  conflict: ExportColumnConflict,
): Record<string, string> => ({
  name,
  column: conflict.column,
  ...(conflict.origin.kind === 'option'
    ? { value: String(conflict.origin.value) }
    : {}),
  ...(conflict.kind === 'reserved'
    ? { reservedColumn: conflict.reservedColumn }
    : conflict.kind === 'own'
      ? // Another of the attribute's own columns, said as a column of it.
        {
          siblingName: name,
          siblingColumn: conflict.otherColumn,
          writtenColumn: conflict.writtenColumn,
        }
      : {
          siblingName: conflict.sibling.name,
          siblingColumn: conflict.siblingColumn,
          ...(conflict.siblingOrigin.kind === 'option'
            ? { siblingValue: String(conflict.siblingOrigin.value) }
            : {}),
          ...(conflict.writtenColumn === undefined
            ? {}
            : { writtenColumn: conflict.writtenColumn }),
        }),
});

const refusalMessage = (
  conflict: ExportColumnConflict,
  layouts: ReadonlySet<ExportColumnVariable>,
): MessageDescriptor => {
  switch (conflict.kind) {
    case 'reserved':
      return reservedMessages[conflict.origin.kind];
    case 'own':
      return writtenMessages[conflict.origin.kind];
    case 'sibling':
      if (layouts.has(conflict.sibling)) {
        return conflict.writtenColumn === undefined
          ? codebookLayoutMessages[conflict.origin.kind]
          : writtenCodebookLayoutMessages[conflict.origin.kind];
      }
      return conflict.writtenColumn === undefined
        ? siblingMessages[conflict.origin.kind][conflict.siblingOrigin.kind]
        : writtenMessages[conflict.origin.kind];
    default: {
      const unhandled: never = conflict;
      throw new Error('Unhandled export column conflict', {
        cause: unhandled,
      });
    }
  }
};

/**
 * Every way the export would write two things to one column if `candidate`
 * were saved beside `siblings`, each said as its own whole sentence.
 *
 * The rule behind all of them is `findExportColumnConflicts`, which derives
 * columns the way the exporters do; this only says which clash it found. It is
 * asked by every control that changes what an attribute's columns would be — a
 * name typed, an option added or renamed, a type changed — and by the codebook
 * write, which has the last word.
 *
 * `siblings` are the other attributes of the same type, and never the
 * candidate itself. `layouts` are the codebook's layouts, which export
 * position columns beside every node type's attributes and so count only for
 * a node attribute.
 */
export const exportColumnRefusals = ({
  entity,
  candidate,
  siblings,
  layouts,
}: Readonly<{
  entity: ExportColumnEntity;
  candidate: ExportColumnVariable;
  siblings: readonly ExportColumnVariable[];
  layouts: readonly ScopedLayout[];
}>): readonly ExportColumnRefusal[] => {
  const layoutSiblings: ExportColumnVariable[] =
    entity === 'node'
      ? layouts.map(({ name }) => ({ name, type: 'layout' }))
      : [];
  const layoutSet: ReadonlySet<ExportColumnVariable> = new Set(layoutSiblings);
  return findExportColumnConflicts({
    entity,
    candidate,
    siblings: [...siblings, ...layoutSiblings],
  }).map((conflict) => ({
    origin: conflict.origin,
    message: createMessageError(
      refusalMessage(conflict, layoutSet),
      refusalValues(candidate.name, conflict),
    ),
  }));
};

/**
 * The attributes of one type, as far as export columns are concerned.
 *
 * Built from the codebook's own records, so the only thing a caller decides is
 * which type it is asking about. `layouts` is the codebook's record of them,
 * which counts only for a node type.
 */
export const variableNameScope = (
  entity: ExportColumnEntity,
  variables: Readonly<Record<string, Variable>>,
  layouts: Readonly<Record<string, ScopedLayout>> | undefined,
): VariableNameScope => ({
  entity,
  layouts:
    entity === 'node'
      ? Object.values(layouts ?? {}).map(({ name }) => ({ name }))
      : [],
  variables: Object.entries(variables).map(([id, variable]) => ({
    id,
    name: variable.name,
    type: variable.type,
    ...('options' in variable && Array.isArray(variable.options)
      ? { options: variable.options }
      : {}),
  })),
});

/**
 * Why a name typed for an attribute cannot be used, or `undefined` while it
 * can.
 *
 * Asked of the whole type rather than of whatever list a control is offering,
 * and against the codebook's own rules rather than a second opinion about
 * them: the codebook is what refuses the write, and a control that offered a
 * name the codebook would refuse would spend a round trip to say so.
 *
 * Which is why the name is judged as it will be stored — `normalizeCodebookName`
 * trims it and puts it in Unicode canonical form — and compared through
 * `normalizeForComparison`, the helper the codebook write judges a duplicate
 * with: it case-folds and canonicalises, so `AGE` is the name `age` and a
 * decomposed `café` is the precomposed one. A raw comparison would offer a name
 * the codebook holds and then answer with a duplicate-name refusal about a name
 * the researcher believed was free.
 *
 * A node attribute is refused a name that a layout in the codebook has, and
 * any name that would put one of its columns on a layout's position column.
 *
 * A name is also refused when it would make the export write two things to one
 * column. A categorical or layout attribute takes every one of its columns from
 * its name, so a rename is judged as the attribute it renames — its own type
 * and options — while a name typed for an attribute that does not exist yet is
 * judged as one that exports a single column, or as `type` where the caller
 * already knows what it will create.
 *
 * One rule for every control that asks it — the attribute picker's create row,
 * and Architect's codebook screen, which renames an attribute — so they
 * cannot come to disagree about what a name may be. `excluding` is the
 * rename's own record id: an attribute is not the thing standing in its own
 * way.
 */
export const variableNameRefusal = (
  typed: string,
  {
    scope,
    excluding,
    type = 'text',
    intl,
  }: Readonly<{
    scope?: VariableNameScope;
    excluding?: string;
    type?: string;
    intl: IntlShape;
  }>,
): string | undefined => {
  const name = normalizeCodebookName(typed);
  const others = scope?.variables.filter(({ id }) => id !== excluding) ?? [];
  const comparable = normalizeForComparison(name);
  if (others.some((held) => normalizeForComparison(held.name) === comparable)) {
    return intl.formatMessage(messages.nameTaken);
  }
  if (
    scope?.layouts.some(
      (layout) => normalizeForComparison(layout.name) === comparable,
    )
  ) {
    return intl.formatMessage(messages.nameTakenByLayout);
  }
  if (!CodebookNameSchema.safeParse(name).success) {
    return intl.formatMessage(messages.nameInvalid);
  }
  if (scope === undefined) return undefined;
  const renamed = scope.variables.find(({ id }) => id === excluding);
  const [refusal] = exportColumnRefusals({
    entity: scope.entity,
    candidate: renamed === undefined ? { name, type } : { ...renamed, name },
    siblings: others,
    layouts: scope.layouts,
  });
  return refusal === undefined
    ? undefined
    : (formatMessageError(refusal.message, intl) ?? refusal.message);
};

/**
 * Why a name typed for a new layout cannot be used, or `undefined` while it
 * can: the codebook's rules for a layout's name, which no other layout and no
 * attribute of any node type may have, and whose position columns no other
 * column of the export may have.
 */
export const layoutNameRefusal = (
  typed: string,
  {
    layouts,
    nodeTypes,
    intl,
  }: Readonly<{
    layouts: Readonly<Record<string, ScopedLayout>>;
    nodeTypes: Readonly<
      Record<
        string,
        Readonly<{
          name: string;
          variables?: Readonly<Record<string, Variable>>;
        }>
      >
    >;
    intl: IntlShape;
  }>,
): string | undefined => {
  const name = normalizeCodebookName(typed);
  const comparable = normalizeForComparison(name);
  if (
    Object.values(layouts).some(
      (layout) => normalizeForComparison(layout.name) === comparable,
    )
  ) {
    return intl.formatMessage(layoutMessages.layoutNameTaken);
  }
  const owner = Object.values(nodeTypes).find(({ variables }) =>
    Object.values(variables ?? {}).some(
      (variable) => normalizeForComparison(variable.name) === comparable,
    ),
  );
  if (owner !== undefined) {
    return intl.formatMessage(layoutMessages.layoutNameTakenByAttribute, {
      nodeType: owner.name,
    });
  }
  if (!CodebookNameSchema.safeParse(name).success) {
    return intl.formatMessage(messages.nameInvalid);
  }
  const candidate = '\u0000candidate';
  const conflict = findLayoutExportColumnConflicts(
    { ...layouts, [candidate]: { name } },
    Object.fromEntries(
      Object.entries(nodeTypes).map(([type, { variables }]) => [
        type,
        variables ?? {},
      ]),
    ),
  ).find(({ layoutId }) => layoutId === candidate);
  return conflict === undefined
    ? undefined
    : intl.formatMessage(layoutMessages.layoutColumnTaken, {
        column: conflict.conflict.column,
      });
};
