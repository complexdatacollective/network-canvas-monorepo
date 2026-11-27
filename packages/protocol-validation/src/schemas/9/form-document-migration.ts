import { isRecord } from '@codaco/shared-consts';

import { fieldBlockMarkdown } from '../../localization/fieldBlock.ts';
import type { LocalizationDeclaration } from '../../localization/localeTag.ts';
import {
  type InformationPagePart,
  informationPageContent,
} from './information-content-migration.ts';
import {
  legacyMarkdownAsStandard,
  type TextsWrittenAsStandard,
} from './legacy-markdown.ts';
import { createProtocolObjectId } from './protocol-object-id.ts';

/** The stages whose `form` schema 9 keeps as one document. */
const DOCUMENT_FORM_STAGES: ReadonlySet<unknown> = new Set([
  'EgoForm',
  'AlterForm',
  'AlterEdgeForm',
  'NameGenerator',
  'FamilyPedigree',
]);

const BETWEEN_BLOCKS = '\n\n';

/**
 * The heading and text of an Ego Form's introduction panel, as the parts of
 * the page at the top of its form. Its title is plain text, shown as the
 * heading; its text was markdown read the legacy way, and is written as
 * standard markdown (see `legacyMarkdownAsStandard`).
 */
const introductionParts = (panel: unknown): InformationPagePart[] => {
  if (!isRecord(panel)) return [];
  return [
    { kind: 'heading', text: panel.title },
    {
      kind: 'text',
      text:
        typeof panel.text === 'string'
          ? legacyMarkdownAsStandard(panel.text, { lines: 'multiple' })
          : panel.text,
    },
  ];
};

/**
 * Schema 9 keeps each form as one document per language, which places the
 * form's fields among its paragraphs (see `fieldBlock.ts`). A schema 8 form
 * was a list of fields, so each becomes a field block, in the order the form
 * showed them, and each field is given an id for its block to name. The id
 * is temporary: `assignProtocolObjectIds` replaces it with every other id
 * and points the field's block at its replacement.
 *
 * An Ego Form showed its introduction panel above its questions, so the
 * panel's title becomes a heading at the top of the document and its text
 * the paragraphs below it, as an Information page's title and text become
 * its document (see `informationPageContent`). The panel has already been
 * repaired (`moveIntroductionPanelsToInformationStages`): a title that showed
 * nothing is the stage's name, and text that showed nothing is left out.
 * Nothing else is written: no question, value or name is invented.
 *
 * Every form of an Ego Form, Alter Form, Alter Edge Form, Name Generator
 * and Family Pedigree is converted; a Network Composer's forms stay lists.
 * A form with no fields and no introduction is left as it is, for
 * validation to report. The
 * document is recorded in `written` as standard markdown, so that it is not
 * read the legacy way again when it is localized.
 */
export const convertFormsToDocuments = (
  protocol: unknown,
  { defaultLocale }: LocalizationDeclaration,
  written: TextsWrittenAsStandard,
) => {
  if (!isRecord(protocol) || !Array.isArray(protocol.stages)) return;
  for (const stage of protocol.stages) {
    if (!isRecord(stage) || !DOCUMENT_FORM_STAGES.has(stage.type)) continue;
    const { form } = stage;
    const panel =
      stage.type === 'EgoForm' ? stage.introductionPanel : undefined;
    if (stage.type === 'EgoForm') delete stage.introductionPanel;
    if (!isRecord(form)) continue;

    const fieldBlocks = (Array.isArray(form.fields) ? form.fields : []).flatMap(
      (field: unknown) => {
        if (!isRecord(field)) return [];
        const id = createProtocolObjectId();
        field.id = id;
        return [fieldBlockMarkdown(id)];
      },
    );
    const introduction = informationPageContent(introductionParts(panel), {
      defaultLocale,
    });
    const withFields = (text: string) =>
      [text, ...fieldBlocks]
        .filter((block) => block !== '')
        .join(BETWEEN_BLOCKS);
    const content =
      introduction === undefined || typeof introduction === 'string'
        ? withFields(introduction ?? '')
        : Object.fromEntries(
            Object.entries(introduction).map(([locale, message]) => [
              locale,
              withFields(message),
            ]),
          );
    // A form with neither fields nor an introduction is left for validation.
    if (content === '') continue;

    // The document before the fields, as schema 9 writes a form.
    const { title, fields: list, ...rest } = form;
    for (const key of Object.keys(form)) Reflect.deleteProperty(form, key);
    Object.assign(form, title === undefined ? {} : { title }, {
      content,
      fields: list,
      ...rest,
    });
    written.add(form, 'content');
  }
};
