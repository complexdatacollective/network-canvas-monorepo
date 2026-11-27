import { useLayoutEffect, useMemo, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import {
  type Codebook,
  dynamicValueNameFor,
  type LocalizedString,
  nodeLabelValueContext,
} from '@codaco/protocol-validation';

import { LocalizedStringField } from '../localization/LocalizedStringControl.tsx';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import { DynamicMessageEditor } from './dynamicText/DynamicMessageEditor.tsx';
import { translatableStringsUsing } from './DynamicTextField.tsx';

const messages = defineMessages({
  textPlaceholder: {
    id: 'protocolBuilder.nodeLabel.placeholder',
    defaultMessage: 'Write the label, and insert attributes from the toolbar…',
    description:
      'Placeholder inside the text field where a researcher writes the label shown on every node of a node type. The Attribute button in the toolbar above the text puts in one of the node’s attributes, or a dynamic attribute: a word or phrase that reads differently for different nodes.',
  },
});

/**
 * A node type's own label as the field holds it while it is being written:
 * the schema's `NodeLabel`, any part of which may still be missing.
 */
export type NodeLabelDraft = Readonly<{
  text?: LocalizedString;
  /**
   * The conditions that its dynamic attributes test, by id, as the schema
   * stores them.
   */
  conditions?: Readonly<Record<string, unknown>>;
  /** The dynamic attributes its text shows, by id, as the schema stores them. */
  dynamicAttributes?: Readonly<Record<string, unknown>>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asDraft = (value: unknown): NodeLabelDraft =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the field's own value, which only this field writes; each part is read defensively where it is used
  isRecord(value) ? (value as NodeLabelDraft) : {};

/** `draft` without the parts that hold nothing, as the schema stores it. */
const withoutEmptyParts = (draft: NodeLabelDraft): NodeLabelDraft => ({
  ...(draft.text !== undefined &&
    Object.keys(draft.text).length > 0 && { text: draft.text }),
  ...(draft.conditions !== undefined &&
    Object.keys(draft.conditions).length > 0 && {
      conditions: draft.conditions,
    }),
  ...(draft.dynamicAttributes !== undefined &&
    Object.keys(draft.dynamicAttributes).length > 0 && {
      dynamicAttributes: draft.dynamicAttributes,
    }),
});

export type NodeLabelFieldProps = CreateFormFieldProps<
  NodeLabelDraft,
  'div',
  {
    /** The protocol's codebook, as it is stored. */
    codebook: Readonly<Codebook> | undefined;
    /**
     * The id of the node type the label belongs to; undefined while a new
     * type is being created, which has no attributes for a rule to name.
     */
    nodeType: string | undefined;
  }
>;

/**
 * How a node type labels its nodes: one line of text a participant reads on
 * every node of the type, which shows values as a stage's text does (the
 * same editor and Attribute menu). What it can show is about the node the
 * label is on: its attributes, the label the interview would otherwise have
 * chosen for it, and the label's own dynamic attributes, whose rules are
 * about that node (its attributes, and the edges that join it to others).
 *
 * The whole label is one value of the surrounding form, as a rule set is:
 * its text, the dynamic attributes the text shows and the conditions they
 * test. A dynamic attribute or a condition that nothing uses any more stays
 * until the node type is saved, which drops it
 * (`withoutUnusedTextDefinitions`), so a pill
 * cut from the label and pasted back, or brought back by an undo, keeps its
 * settings.
 */
export default function NodeLabelField({
  id,
  name,
  value,
  onChange,
  disabled = false,
  readOnly = false,
  codebook,
  nodeType,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: NodeLabelFieldProps) {
  const intl = useAppIntl();
  const { editingLocale } = useEditingLanguage();
  const draft = useMemo(() => asDraft(value), [value]);

  // The text's editor writes the text and then the conditions it tests, one
  // after the other, before this field is drawn again: each write builds on
  // the one before it rather than on the value this render was given.
  const pending = useRef<NodeLabelDraft | null>(null);
  useLayoutEffect(() => {
    pending.current = null;
  });
  const write = (patch: Partial<NodeLabelDraft>) => {
    const next = withoutEmptyParts({ ...(pending.current ?? draft), ...patch });
    pending.current = next;
    onChange?.(next);
  };

  const context = useMemo(
    () =>
      nodeLabelValueContext({
        codebook,
        nodeType: nodeType ?? '',
        conditions: draft.conditions,
        dynamicAttributes: draft.dynamicAttributes,
      }),
    [codebook, nodeType, draft.conditions, draft.dynamicAttributes],
  );

  return (
    <LocalizedStringField
      value={draft.text}
      onChange={(text) => write({ text })}
    >
      {(translation) => (
        <DynamicMessageEditor
          id={id ?? name ?? 'node-label'}
          name={name ?? 'dynamicLabel'}
          ariaDescribedBy={ariaDescribedBy ?? ''}
          ariaLabelledBy={ariaLabelledBy}
          ariaInvalid={ariaInvalid === true}
          ariaRequired={ariaRequired === true}
          placeholder={intl.formatMessage(messages.textPlaceholder)}
          disabled={disabled}
          readOnly={readOnly || translation.readOnly}
          markdown={false}
          singleLine
          message={translation.message}
          onMessageChange={translation.onMessageChange}
          locale={editingLocale}
          site={{
            context,
            conditions: {
              values: draft.conditions ?? {},
              set: (next) => write({ conditions: next }),
              codebook,
              // A type being created has no attributes for a rule to
              // name, and no id for one to name it by.
              subject:
                nodeType === undefined
                  ? undefined
                  : { entity: 'node', type: nodeType },
              // The label is drawn on many nodes at once, on every stage.
              allowEgoRules: false,
            },
            dynamicAttributes: {
              values: draft.dynamicAttributes ?? {},
              set: (next) => write({ dynamicAttributes: next }),
            },
            owner: 'nodeLabel',
            dynamicAttributeUsage: (dynamicAttributeId) =>
              translatableStringsUsing(
                { text: draft.text },
                dynamicValueNameFor({
                  kind: 'dynamicAttribute',
                  id: dynamicAttributeId,
                }),
              ),
          }}
        />
      )}
    </LocalizedStringField>
  );
}
