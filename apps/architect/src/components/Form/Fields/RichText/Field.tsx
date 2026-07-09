import type React from 'react';
import { useRef } from 'react';
import { v4 as uuid } from 'uuid';

import RichTextEditorField from '@codaco/fresco-ui/form/fields/RichTextEditor';
import MarkdownLabel from '~/components/Form/Fields/MarkdownLabel';
import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
  type RichTextContent,
} from './markdownAdapter';

type RichTextFieldProps = {
  input: {
    name?: string;
    value: string | null | undefined;
    onChange: (value: string) => void;
    onFocus?: React.FocusEventHandler;
    onBlur?: React.FocusEventHandler;
  };
  meta?: {
    error?: string;
    active?: boolean;
    invalid?: boolean;
    touched?: boolean;
  };
  label?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  inline?: boolean;
  disallowedTypes?: string[];
  className?: string | null;
};

const RichTextField = ({
  input,
  meta = {},
  label = null,
  placeholder,
  autoFocus = false,
  inline = false,
  disallowedTypes = [],
  className = null,
}: RichTextFieldProps) => {
  const _id = useRef(uuid());

  const anyLabel = label;
  const hasError = !!(meta.invalid && meta.touched && meta.error);
  const toolbarOptions = {
    bold: !disallowedTypes.includes('bold'),
    italic: !disallowedTypes.includes('italic'),
    links: !inline,
    headings: !inline && !disallowedTypes.includes('headings'),
    lists: !inline && !disallowedTypes.includes('lists'),
    thematicBreak: !inline && !disallowedTypes.includes('thematic_break'),
    history: !disallowedTypes.includes('history'),
  };

  const editorValue = markdownToRichTextContent(input.value, inline);

  const handleChange = (value: RichTextContent | undefined) => {
    input.onChange(richTextContentToMarkdown(value, inline));
  };

  return (
    <div className="m-0 w-full [&>h4]:m-0">
      {anyLabel && (
        <h4>
          <MarkdownLabel label={anyLabel} />
        </h4>
      )}
      <div className={cx(className)}>
        <RichTextEditorField
          id={_id.current}
          name={input.name ?? _id.current}
          onChange={handleChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          value={editorValue}
          changeMode="input"
          toolbarOptions={toolbarOptions}
          aria-describedby={`${_id.current}-error`}
          aria-invalid={hasError}
        />
        {hasError && (
          <div
            id={`${_id.current}-error`}
            className="bg-destructive text-destructive-contrast flex items-center rounded-b-sm px-1 py-2.5 [&_svg]:max-h-5"
          >
            <Icon name="warning" />
            {meta.error}
          </div>
        )}
      </div>
    </div>
  );
};

export default RichTextField;
