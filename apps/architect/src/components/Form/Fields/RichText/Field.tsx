import type { ComponentType } from 'react';
import type { WrappedFieldInputProps, WrappedFieldMetaProps } from 'redux-form';

import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from '~/utils/markdownAdapter';

type RichTextFieldProps = {
  input: WrappedFieldInputProps;
  meta?: Partial<WrappedFieldMetaProps>;
  label?: string | null;
  labelHidden?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  inline?: boolean;
  disallowedTypes?: string[];
  className?: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

const FrescoRichTextEditorField = RichTextEditorField as ComponentType<
  Record<string, unknown>
>;
const ReduxFieldAdapter = FrescoReduxField as ComponentType<
  Record<string, unknown>
>;

const asRichTextContent = (value: unknown): RichTextContent | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RichTextContent)
    : undefined;

const RichTextField = ({
  input,
  meta = {},
  label = null,
  labelHidden = false,
  placeholder,
  autoFocus = false,
  inline = false,
  disallowedTypes = [],
  className = null,
  disabled = false,
  readOnly = false,
  required = false,
}: RichTextFieldProps) => {
  const toolbarOptions = {
    bold: !disallowedTypes.includes('bold'),
    italic: !disallowedTypes.includes('italic'),
    links: !inline,
    headings: !inline && !disallowedTypes.includes('headings'),
    lists: !inline && !disallowedTypes.includes('lists'),
    thematicBreak: !inline && !disallowedTypes.includes('thematic_break'),
    history: !disallowedTypes.includes('history'),
  };

  return (
    <ReduxFieldAdapter
      input={input}
      meta={meta}
      fieldComponent={FrescoRichTextEditorField}
      label={label ?? input.name ?? ''}
      labelHidden={labelHidden}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className ?? undefined}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      changeMode="input"
      toolbarOptions={toolbarOptions}
      fromReduxValue={(value: unknown) =>
        markdownToRichTextContent(
          typeof value === 'string' ? value : null,
          inline,
        )
      }
      toReduxValue={(value: unknown) =>
        richTextContentToMarkdown(asRichTextContent(value), inline)
      }
    />
  );
};

export default RichTextField;
