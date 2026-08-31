import { type FocusEvent, useId } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';

import ProtocolField from '../form/ProtocolField.tsx';
import {
  SectionScopeContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import { useOutlineSection } from '../form/useOutlineSection.ts';
import { interfaceDisplayName } from '../interfaces/interfaceNames.ts';

/** The character limit is the input's own; it is not a validation rule. */
const STAGE_NAME_LIMIT = 50;

type HeadingInputProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  'onBlur'?: (event: FocusEvent<HTMLInputElement>) => void;
  'placeholder'?: string;
  /**
   * A hard cap on typed characters. Not called `maxLength`: that name belongs
   * to Fresco's validation catalogue, where it would become an error after the
   * fact instead of the input's own limit.
   */
  'characterLimit'?: number;
  'autoFocus'?: boolean;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/**
 * The stage's name, at the size of the page's own heading — because it is:
 * naming the stage is the first thing a researcher does and the thing they
 * recognise it by afterwards. The label and any error come from the field
 * around it, so this is only the control.
 */
export function HeadingInput({
  value = '',
  onChange,
  characterLimit,
  'aria-invalid': ariaInvalid,
  ...rest
}: HeadingInputProps) {
  return (
    <input
      {...rest}
      type="text"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      maxLength={characterLimit}
      aria-invalid={ariaInvalid}
      className={cx(
        headingVariants({ level: 'h1', margin: 'none' }),
        'focusable w-full border-none bg-transparent p-0 outline-none placeholder:opacity-40',
        ariaInvalid && 'text-destructive',
      )}
    />
  );
}

/**
 * What this host calls a stage.
 *
 * Architect says "stage"; Studio says "screen". Each string is whole rather
 * than assembled from a noun and a frame, so a host can say the thing its
 * researchers already read everywhere else in it.
 */
export type StageNameCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  fieldLabel: string;
  placeholder: string;
  position: (index: number, total: number) => string;
}>;

const DEFAULT_COPY: StageNameCopy = {
  sectionTitle: 'Stage name',
  fieldLabel: 'Stage name',
  placeholder: 'Enter stage name...',
  position: (index, total) => `Stage ${index} of ${total}`,
};

export type StageNameSectionProps = Readonly<{
  /** Where this stage sits in the interview, for orientation. */
  position?: Readonly<{ index: number; total: number }>;
  /** Where this interface is documented. */
  documentationUrl?: string;
  /** A stage being created starts with its name focused. */
  autoFocus?: boolean;
  copy?: Partial<StageNameCopy>;
}>;

/**
 * The stage's name and what kind of stage it is.
 *
 * A section like any other — it appears in the outline, and it owns a field
 * that can be incomplete — but it wears the page's heading rather than a card,
 * because it identifies the stage rather than configuring part of it.
 */
export default function StageNameSection({
  position,
  documentationUrl,
  autoFocus = false,
  copy,
}: StageNameSectionProps) {
  const { identity } = useStageEditorForm();
  const words = { ...DEFAULT_COPY, ...copy };
  const { sectionId } = useOutlineSection(words.sectionTitle);
  const headingId = useId();
  const interfaceName = interfaceDisplayName(identity.type) ?? identity.type;

  return (
    <section
      id={sectionId}
      tabIndex={-1}
      aria-labelledby={headingId}
      // The field's own margin is dropped so the hero input sits directly
      // under the position line, as one block of heading.
      className="flex min-w-0 flex-col justify-center pt-7 outline-none *:data-[field-name=label]:m-0"
    >
      <span id={headingId} className="sr-only">
        {words.sectionTitle}
      </span>
      {position && (
        <Paragraph
          className={headingVariants({
            level: 'label',
            variant: 'all-caps',
            margin: 'none',
            className: 'text-current/70',
          })}
        >
          {words.position(position.index, position.total)}
        </Paragraph>
      )}
      <SectionScopeContext value={sectionId}>
        <ProtocolField<typeof HeadingInput>
          name="label"
          component={HeadingInput}
          // The hero input is the visible heading, so the label exists for
          // assistive technology — but it still has to exist, because it is
          // what the outline and a host's problem panel call this field.
          label={words.fieldLabel}
          labelHidden
          placeholder={words.placeholder}
          characterLimit={STAGE_NAME_LIMIT}
          required
          autoFocus={autoFocus}
        />
      </SectionScopeContext>
      <div className="mt-2 flex flex-wrap items-center gap-5 text-sm">
        <Badge color="neon-coral">{interfaceName}</Badge>
        {documentationUrl !== undefined && (
          <NativeLink
            href={documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </NativeLink>
        )}
      </div>
    </section>
  );
}
