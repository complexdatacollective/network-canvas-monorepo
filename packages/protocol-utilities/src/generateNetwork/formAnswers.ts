import {
  type FormDocumentReading,
  formDocumentReading,
  formShownFields,
  type LogicSources,
} from '@codaco/network-query';
import {
  fieldBlockMarkdown,
  type LocalizationDeclaration,
  type LocalizedString,
  resolveLocalizedString,
} from '@codaco/protocol-validation';
import type { VariableValue } from '@codaco/shared-consts';

/**
 * Which of a form's fields a synthetic participant answers.
 *
 * The interview asks the fields that the form's document places in the
 * participant's language, and shows those that its logic blocks choose. When
 * the form is submitted, the answer to a field that logic hides is cleared
 * (`formValuesToAttributePatch` in `@codaco/interview`). The generator draws a
 * form's fields first and then settles them here, so that it stores an answer
 * only where a participant could have given one.
 *
 * Which fields logic shows is decided by the code that the interview uses:
 * `formShownFields` in `@codaco/network-query`.
 */

/**
 * A form of a stage, as the generator reads it. Synthetic data is also made
 * for protocols that are still being written, whose stage may have no form
 * yet, or a form without a document.
 */
type StageForm = Readonly<{
  content?: LocalizedString | undefined;
  fields?: readonly Readonly<{ id: string; variable: string }>[] | undefined;
}>;

/**
 * A form's document in the language that the participant reads, with the
 * fields that it asks (`fieldVariables`).
 */
export type FormReading = FormDocumentReading &
  Readonly<{
    /** The variables of the form's fields that the document does not place. */
    unasked: ReadonlySet<string>;
  }>;

/**
 * Reads `form` in `language`, as the interview reads it with the protocol's
 * languages (`localization`): a language without a document of its own reads
 * the closest related language, else the protocol's default language
 * (`resolveLocalizedString`). A form without a document asks each of its
 * fields in turn, and a stage without a form asks nothing.
 */
export function readForm(
  form: StageForm | undefined,
  language: string,
  localization: LocalizationDeclaration,
): FormReading {
  const fields = form?.fields ?? [];
  const content = form?.content;
  const written = content === undefined ? [] : Object.keys(content);
  const [first] = written;
  const resolved =
    content === undefined || first === undefined
      ? undefined
      : resolveLocalizedString(
          content,
          {
            defaultLocale: localization.defaultLocale,
            // A form of a protocol still being written may be in a language
            // that the protocol does not declare yet.
            locales: [...new Set([...localization.locales, ...written])],
          },
          [language],
        );
  // A form without a document asks each of its fields in turn, as a
  // document that places them would. Such a form may be one still being
  // written, whose fields have no ids yet: each is then known by its place.
  const listed =
    content === undefined
      ? fields.map((field, index) => ({
          id: typeof field.id === 'string' ? field.id : `field-${index}`,
          variable: field.variable,
        }))
      : fields;
  const text =
    content === undefined
      ? listed.map((field) => fieldBlockMarkdown(field.id)).join('\n\n')
      : (resolved?.text ?? '');
  const reading = formDocumentReading(
    { fields: listed },
    { text, locale: resolved?.locale ?? first ?? '' },
  );
  const asked = new Set(reading.fieldVariables.values());
  return {
    ...reading,
    unasked: new Set(
      fields
        .map((field) => field.variable)
        .filter((variable) => !asked.has(variable)),
    ),
  };
}

/**
 * What a form's logic reads about the entities that the form describes, and
 * the network that they are in (`LogicSources`), with the role whose
 * attributes the form's fields write.
 */
export type FormSubjects = LogicSources &
  Readonly<{ answers: 'ego' | 'node' | 'edge' }>;

/**
 * The variables whose answers a form leaves unanswered when it is submitted
 * with `values` as the answers to its fields: the fields that it asks but
 * does not show (`formShownFields`, which the interview shows them by).
 */
export function hiddenFormVariables(
  reading: FormReading,
  values: Readonly<Record<string, VariableValue>>,
  subjects: FormSubjects,
): Set<string> {
  const { shown } = formShownFields(
    reading,
    {
      ...subjects,
      attributes: { ...subjects.attributes, [subjects.answers]: values },
    },
    subjects.answers,
  );
  const showing = new Set(shown);
  const hidden = new Set<string>();
  for (const [fieldId, variable] of reading.fieldVariables) {
    if (!showing.has(fieldId)) hidden.add(variable);
  }
  return hidden;
}
