import { z } from 'zod';

import { toCanonicalText } from './canonical-text.ts';

/**
 * The rule for codebook record keys — the ids node types, edge types and
 * variables are stored under — and for any other internal identifier that has
 * to stay in the same alphabet. Never the rule for text a researcher types:
 * that is `CodebookNameSchema`.
 */
export const CodebookIdSchema = z.string().regex(/^[a-zA-Z0-9._:-]+$/); // TODO: think about using branding here

// Unicode category Cc: U+0000–U+001F and U+007F–U+009F.
const CONTROL_CHARACTER = /\p{Cc}/u;

// U+FFFE and U+FFFF are the only noncharacters XML 1.0's `Char` production
// excludes; the supplementary-plane ones are legal XML and stay allowed.
const XML_EXCLUDED_NONCHARACTERS = [0xfffe, 0xffff].map((codeUnit) =>
  String.fromCharCode(codeUnit),
);

/**
 * The rule for a name a researcher types: an entity type's name, a variable's
 * name, an option's value. Any script, spaces and punctuation are allowed.
 *
 * What it refuses is exactly what XML 1.0 cannot carry (lone surrogates,
 * U+FFFE, U+FFFF, and every C0 control but tab, line feed and carriage
 * return), plus every Cc control including those three, so a valid name is
 * written into a GraphML attribute value unchanged: a parser normalises tab
 * and line breaks in attribute values to spaces. Leading or trailing
 * whitespace and non-NFC spellings are refused rather than repaired; editors
 * apply `normalizeCodebookName` as the name is written.
 */
export const CodebookNameSchema = z
  .string()
  .min(1, { message: 'A name cannot be empty' })
  .refine((value) => value === value.trim(), {
    message: 'A name cannot start or end with whitespace',
  })
  .refine((value) => value === value.normalize('NFC'), {
    message: 'A name must be in Unicode normalization form C (NFC)',
  })
  .refine((value) => value.isWellFormed(), {
    message: 'A name cannot contain a lone surrogate',
  })
  .refine(
    (value) =>
      !CONTROL_CHARACTER.test(value) &&
      !XML_EXCLUDED_NONCHARACTERS.some((character) =>
        value.includes(character),
      ),
    { message: 'A name cannot contain control characters, U+FFFE or U+FFFF' },
  );

/** The form a typed name is stored in: NFC, then trimmed. */
export const normalizeCodebookName = (value: string): string =>
  toCanonicalText(value).trim();

// TODO: Should be with protocol definitions.

export type InputControlDefinition = {
  label: string;
  description: string;
  image?: string;
};

export const textInput = {
  label: 'Text Input',
  description:
    'This is a standard text input, allowing for simple data entry up to approximately 30 characters.',
};

export const textArea = {
  label: 'Text Area',
  description:
    'This is an extra large text input, allowing for simple data entry for more than 30 characters.',
};

export const numberInput = {
  label: 'Number Input',
  description:
    'This input is optimized for collecting numerical data, and will show a number pad if available.',
};

export const checkboxGroup = {
  label: 'Checkbox Group',
  description:
    'This component provides a group of checkboxes so that multiple values can be toggled on or off.',
};

export const toggle = {
  label: 'Toggle',
  description:
    'This component renders a switch, which can be tapped or clicked to indicate "on" or "off". By default it is in the "off" position. If you require a boolean input without a default, use the BooleanChoice component',
};

export const radioGroup = {
  label: 'Radio Group',
  description:
    'This component renders a group of options and allow the user to choose one.',
};

export const toggleButtonGroup = {
  label: 'Toggle Button Group',
  description:
    'This component provides a colorful button that can be toggled "on" or "off". It is an alternative to the Checkbox Group, and allows multiple selection by default.',
};

export const likertScale = {
  label: 'LikertScale',
  description:
    'A component providing a likert-type scale in the form of a slider. Values are derived from the option properties of this variable, with labels for each option label.',
};

export const visualAnalogScale = {
  label: 'VisualAnalogScale',
  description:
    'A Visual Analog Scale (VAS) component, which sets a normalized value between 0 and 1 representing the position of the slider between each end of the scale.',
};

export const datePicker = {
  label: 'DatePicker',
  description:
    'A calendar date picker that allows a respondent to quickly enter year, month, and day data.',
};

export const relativeDatePicker = {
  label: 'RelativeDatePicker',
  description:
    'A calendar date picker that automatically limits available dates relative to an "anchor date", which can be configured to the date of the interview session. ',
};

export const booleanChoice = {
  label: 'BooleanChoice',
  description:
    'A component for boolean variables that requires the participant to actively select an option. Unlike the toggle component, this component accepts the "required" validation.',
};

export const inputControls = {
  textInput,
  textArea,
  numberInput,
  checkboxGroup,
  toggle,
  radioGroup,
  toggleButtonGroup,
  likertScale,
  visualAnalogScale,
  datePicker,
  relativeDatePicker,
  booleanChoice,
};
