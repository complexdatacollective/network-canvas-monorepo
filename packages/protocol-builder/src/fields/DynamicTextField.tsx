import { useContext, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import { presentationalTextValue } from '@codaco/fresco-ui/PresentationalText';
import {
  type DynamicValueSite,
  dynamicValueNameFor,
  dynamicValueNamesIn,
  escapeMessageText,
  isOwnTextOf,
  type LocalizedString,
  type LocalizedTextShape,
  type MessageNode,
  messageStructure,
  textPlaceOf,
} from '@codaco/protocol-validation';
import { isRecord } from '@codaco/shared-consts';

import { StageEditorFormContext } from '../form/stageEditorContext.ts';
import {
  type DynamicValueChoice,
  dynamicValueChoices,
} from '../localization/dynamicValueCatalog.ts';
import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import { textFieldPropsFor } from '../localization/textShape.ts';
import { useDynamicValueSite } from '../localization/useDynamicValueSite.ts';
import { stageFieldsOf } from '../stageDocument.ts';
import { StageAssetBlocks } from './assetBlocks/StageAssetBlocks.tsx';
import { DynamicMessageEditor } from './dynamicText/DynamicMessageEditor.tsx';
import type { DynamicMessageSite } from './dynamicText/messageSite.ts';
import { namingFor } from './dynamicText/valueNaming.ts';

const PLAIN_LINE: LocalizedTextShape = { format: 'plain', lines: 'single' };

/** Whether `value` is a translatable string: text by language. */
const isTranslations = (value: Record<string, unknown>): boolean => {
  const entries = Object.values(value);
  return (
    entries.length > 0 && entries.every((entry) => typeof entry === 'string')
  );
};

/**
 * How many translatable strings of the owner `value` (a stage, or a node
 * type's label) use the value named `name`, in any of their languages. The
 * wording of the owner's dynamic attributes is not counted (`isOwnTextOf`).
 */
export const translatableStringsUsing = (
  value: unknown,
  name: string,
): number => {
  const count = (item: unknown, path: readonly (string | number)[]): number => {
    if (Array.isArray(item)) {
      return item.reduce<number>(
        (total, entry, index) => total + count(entry, [...path, index]),
        0,
      );
    }
    if (!isRecord(item)) return 0;
    if (isTranslations(item)) {
      const uses = Object.values(item).some(
        (text) =>
          typeof text === 'string' &&
          text.includes(name) &&
          dynamicValueNamesIn(text).includes(name),
      );
      return uses && isOwnTextOf(textPlaceOf(path, 'owner'), []) ? 1 : 0;
    }
    return Object.entries(item).reduce<number>(
      (total, [key, entry]) => total + count(entry, [...path, key]),
      0,
    );
  };
  return count(value, []);
};

/**
 * `message` as a message that shows no values: each value written as the
 * name its pill shows, in brackets. For text a preview hands to a control
 * that takes only words (a scale's end labels), which has no participant to
 * fill a value in with.
 */
export const messageWithValueNames = (
  message: string,
  nameOf: (argument: string) => string,
): string => {
  const structure = messageStructure(message);
  if (!('nodes' in structure)) return message;
  const write = (
    nodes: readonly MessageNode[],
    plural: string | undefined,
  ): string =>
    nodes
      .map((node) => {
        switch (node.kind) {
          case 'text':
            return node.text;
          case 'argument':
            return `[${nameOf(node.name)}]`;
          case 'count':
            return plural === undefined ? '#' : `[${nameOf(plural)}]`;
          case 'switch':
            return `[${nameOf(node.argument)}]`;
          default: {
            const unhandled: never = node;
            throw new Error('Unhandled message node', { cause: unhandled });
          }
        }
      })
      .join('');
  return escapeMessageText(write(structure.nodes, undefined));
};

/**
 * The name each value text at `site` can show is shown as, by its name in the
 * text.
 */
export function useDynamicValueNames(
  site: Pick<
    DynamicMessageSite,
    'context' | 'conditions' | 'dynamicAttributes'
  >,
): (argument: string) => string {
  const intl = useAppIntl();
  const { context } = site;
  const codebook = site.conditions?.codebook;
  const conditions = site.conditions?.values;
  const dynamicAttributes = site.dynamicAttributes?.values;
  return useMemo(() => {
    const naming = namingFor(intl, {
      context,
      codebook,
      conditions,
      dynamicAttributes,
    });
    const choiceByName = new Map<string, DynamicValueChoice>(
      dynamicValueChoices(context).map((choice) => [choice.name, choice]),
    );
    return (argument: string) => {
      const choice = choiceByName.get(argument);
      // Written into the preview's text, so the words alone.
      return presentationalTextValue(
        choice === undefined
          ? naming.recordedLabel(argument)
          : naming.valueLabel(choice),
      );
    };
  }, [intl, context, codebook, conditions, dynamicAttributes]);
}

type DynamicTextFieldProps = CreateFormFieldProps<
  LocalizedString,
  'div',
  {
    'id': string;
    'name': string;
    'aria-describedby': string;
    /** Where the text sits, which decides what it can show. */
    'dynamicValues': DynamicValueSite;
    /**
     * Where the text sits in the row a dialog edits, for a form field's
     * caption (such as `['prompt']`): which fields come before it decides
     * which answers it can show.
     */
    'fieldPath'?: readonly string[];
    /**
     * What the text may hold, as its field declares it (see
     * `markdownTextShapeAt`); one plain line when absent.
     */
    'shape'?: LocalizedTextShape;
    'placeholder'?: string;
    'autoFocus'?: boolean;
    'hideUntranslatedNote'?: boolean;
  }
>;

/**
 * Text a participant reads, in each of the protocol's languages, that can
 * show values the interview fills in: the participant's answers, the people
 * a question is about, today's date, and the stage's dynamic attributes. What
 * it can show depends on where it sits (`dynamicValues`), by the same rules
 * the protocol is validated by.
 */
export default function DynamicTextField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  'dynamicValues': siteKind,
  fieldPath,
  shape = PLAIN_LINE,
  placeholder,
  autoFocus,
  hideUntranslatedNote,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: DynamicTextFieldProps) {
  const siteState = useDynamicValueSite(siteKind, fieldPath);
  const stageForm = useContext(StageEditorFormContext);
  const site: DynamicMessageSite = {
    context: siteState.context,
    conditions: siteState.conditions,
    dynamicAttributes: siteState.dynamicAttributes,
    owner: 'stage',
    dynamicAttributeUsage: (dynamicAttributeId) =>
      stageForm === null
        ? 1
        : translatableStringsUsing(
            stageFieldsOf(stageForm.liveDraft()),
            dynamicValueNameFor({
              kind: 'dynamicAttribute',
              id: dynamicAttributeId,
            }),
          ),
  };
  const {
    markdown,
    singleLine,
    assetBlocks: holdsAssetBlocks,
  } = textFieldPropsFor(shape);
  const { editingLocale } = useEditingLanguage();

  return (
    <StageAssetBlocks enabled={holdsAssetBlocks}>
      {(assetBlocks) => (
        <LocalizedStringField
          value={value}
          onChange={onChange}
          hideUntranslatedNote={hideUntranslatedNote}
        >
          {(translation) => (
            <DynamicMessageEditor
              id={id}
              name={name}
              ariaDescribedBy={ariaDescribedBy}
              ariaLabelledBy={ariaLabelledBy}
              ariaInvalid={ariaInvalid}
              ariaRequired={ariaRequired === true}
              placeholder={placeholder}
              autoFocus={autoFocus}
              disabled={disabled}
              readOnly={readOnly === true || translation.readOnly}
              markdown={markdown}
              singleLine={singleLine}
              {...(assetBlocks !== undefined && { assetBlocks })}
              message={translation.message}
              onMessageChange={translation.onMessageChange}
              locale={editingLocale}
              site={site}
              showsProblems={siteState.codebookRead}
            />
          )}
        </LocalizedStringField>
      )}
    </StageAssetBlocks>
  );
}
