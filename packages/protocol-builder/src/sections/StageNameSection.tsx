import { createElement, useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { useEnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import StageNameInput from '../fields/StageNameInput.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import {
  SectionScopeContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import { useOutlineSection } from '../form/useOutlineSection.ts';
import { interfaceDisplayName } from '../interfaces/interfaceNames.ts';
import {
  type AutoStageNamePanel,
  useAutoStageName,
} from '../naming/useAutoStageName.ts';

/** The character limit is the control's own; it is not a validation rule. */
const STAGE_NAME_LIMIT = 50;

const messages = defineMessages({
  stageName: {
    id: 'protocolBuilder.stageName.name',
    defaultMessage: 'Stage name',
    description:
      'Section heading and accessible field label for the researcher-authored stage name.',
  },
  placeholder: {
    id: 'protocolBuilder.stageName.placeholder',
    defaultMessage: 'Enter stage name...',
    description: 'Placeholder for the researcher-authored stage name field.',
  },
  position: {
    id: 'protocolBuilder.stageName.position',
    defaultMessage: 'Stage {index, number} of {total, number}',
    description:
      'The current stage position in the interview. index is one-based.',
  },
  documentation: {
    id: 'protocolBuilder.stageName.documentation',
    defaultMessage: 'Documentation',
    description:
      'Link to the documentation for this type of interview interface.',
  },
});

export type StageNameSectionProps = Readonly<{
  /** Where this stage sits in the interview, for orientation. */
  position?: Readonly<{ index: number; total: number }>;
  /** Where this interface is documented. */
  documentationUrl?: string;
  /** A stage being created starts with its name focused. */
  autoFocus?: boolean;
  /**
   * What a proposed name is derived from, and whether to propose one at all.
   *
   * Whether to propose is the session's answer by default — only a stage being
   * created is named automatically, and an existing stage's name is already the
   * researcher's — so an editor that serves both cases leaves `propose` out and
   * gets the right behaviour in each. `propose` overrides that answer, in
   * either direction, for an editor that has a reason to.
   *
   * `panels` is supplied by the editor rather than read from the draft, because
   * a name generator's panels are held in the form as per-index leaves that
   * only the section writing them can assemble.
   */
  autoName?: Readonly<{
    propose?: boolean;
    panels?: readonly AutoStageNamePanel[];
  }>;
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
  autoName,
}: StageNameSectionProps) {
  const { identity, creation } = useStageEditorForm();
  const intl = useAppIntl();
  // One descriptor read twice: the section's name in the outline and the
  // field's own label are the same words, and a translator moves them once.
  const stageNameLabel = intl.formatMessage(messages.stageName);
  const { sectionId } = useOutlineSection(stageNameLabel);
  const headingId = useId();
  // AT the level the shell states rather than one below it: this section wears
  // the page's heading, so it IS the heading everything else in the editor
  // counts down from. Absent a shell — a section rendered on its own — an `h2`
  // is what a page heading is.
  const headingLevel = useEnclosingHeadingLevel() ?? 'h2';
  const interfaceName =
    interfaceDisplayName(identity.type, intl) ?? identity.type;
  const { onLabelBlur } = useAutoStageName({
    isNewStage: autoName?.propose ?? creation !== undefined,
    panels: autoName?.panels,
  });

  return (
    <section
      id={sectionId}
      tabIndex={-1}
      aria-labelledby={headingId}
      // The field's own margin is dropped so the hero input sits directly
      // under the position line, as one block of heading.
      className="flex min-w-0 flex-col justify-center pt-7 outline-none *:data-[field-name=label]:m-0"
    >
      {/*
        A real heading rather than a label: the visible one is the name field
        itself, which is a control and cannot be a heading, so without this the
        stage editor has no heading at the rung every section below counts
        from — nothing for a reader navigating by headings to arrive at, and a
        level the shell states that nothing in the document occupies. Visually
        hidden, so the hero input is still the only stage title on screen.
      */}
      {createElement(
        headingLevel,
        { id: headingId, className: 'sr-only' },
        stageNameLabel,
      )}
      {position && (
        <Paragraph
          className={headingVariants({
            level: 'label',
            variant: 'all-caps',
            margin: 'none',
            className: 'text-current/70',
          })}
        >
          {intl.formatMessage(messages.position, {
            index: position.index,
            total: position.total,
          })}
        </Paragraph>
      )}
      <SectionScopeContext value={sectionId}>
        <ProtocolField<typeof StageNameInput>
          name="label"
          component={StageNameInput}
          // The hero input is the visible heading, so the label exists for
          // assistive technology — but it still has to exist, because it is
          // what the outline and a host's problem panel call this field.
          label={stageNameLabel}
          labelHidden
          placeholder={intl.formatMessage(messages.placeholder)}
          characterLimit={STAGE_NAME_LIMIT}
          required
          autoFocus={autoFocus}
          onFieldBlur={onLabelBlur}
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
            {intl.formatMessage(messages.documentation)}
          </NativeLink>
        )}
      </div>
    </section>
  );
}
