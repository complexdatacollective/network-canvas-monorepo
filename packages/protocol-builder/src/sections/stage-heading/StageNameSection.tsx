import { createElement, useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { useEnclosingHeadingLevel } from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import StageNameInput from '../../fields/StageNameInput.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useOutlineSection } from '../../form/useOutlineSection.ts';
import { interfaceDisplayName } from '../../interfaces/interfaceNames.ts';
import StageTypeImage from '../../interfaces/StageTypeImage.tsx';
import {
  type AutoStageNamePanel,
  useAutoStageName,
} from '../../naming/useAutoStageName.ts';

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
  /**
   * Whether the name field takes focus when the editor opens.
   *
   * The edit's own answer by default, for the same reason `autoName` reads it:
   * naming the stage is the first thing there is to do in a stage that does
   * not exist yet, and an existing stage was opened to be looked at rather
   * than renamed. An editor with a reason to differ overrides it either way.
   */
  autoFocus?: boolean;
  /**
   * What a proposed name is derived from, and whether to propose one at all.
   *
   * Whether to propose is the edit's own answer by default — only a stage being
   * created is named automatically, and an existing stage's name is already the
   * researcher's — so an editor that serves both cases leaves `propose` out and
   * gets the right behaviour in each. `propose` overrides that answer, in
   * either direction, for an editor that has a reason to.
   *
   * `panels` is supplied by the editor rather than read from the draft here,
   * because only an interface that HAS panels may ask about them: the schema
   * gives `panels` to two of the three name generators and to nothing else, so
   * a heading that read the path itself would be asking every stage about a
   * key most of them do not have.
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
  autoFocus,
  autoName,
}: StageNameSectionProps) {
  const { identity, creation } = useStageEditorForm();
  const isNewStage = creation !== undefined;
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
    isNewStage: autoName?.propose ?? isNewStage,
    panels: autoName?.panels,
  });

  return (
    <section
      id={sectionId}
      tabIndex={-1}
      aria-labelledby={headingId}
      // `mb-14` is the 3.5rem Architect puts between the heading and the first
      // section (`StageEditor.tsx:758`'s `pt-14` wrapper). A margin rather than
      // padding because the sections are flat children of one form here, so
      // there is no wrapper to pad — and a `gap-*` on the form would also
      // change the 2.5rem rhythm between sections that `Section` owns.
      //
      // The two columns are a CONTAINER query, not Architect's viewport
      // breakpoint: this editor is drawn inside whatever panel a host gives
      // it, and a heading that read the window would go two-column in a narrow
      // pane on a wide screen.
      //
      // It splits at `56rem` because that is where the column the shell draws
      // reaches its own `max-w-4xl` cap, which is the state Architect's
      // heading was always in when it went two-column: Architect split at
      // `tablet-landscape` (1024px of viewport, `StageHeading.tsx:72`) and its
      // column was capped from that width up, so the picture rail never took
      // room the name did not have. The cap here is 896px INCLUDING the
      // column's own gutters, so from 56rem of container the heading is 848px
      // and the name block is 848 − 20rem − `gap-8` = 496px, the widest this
      // column can give it and the same at every width above. Splitting
      // earlier spends room the name has not got: at the 48rem this used to
      // say, a 768px container left the name block 368px.
      className="mb-14 flex w-full flex-col gap-5 pt-7 outline-none @min-[56rem]:grid @min-[56rem]:grid-cols-[20rem_auto] @min-[56rem]:gap-8 @min-[56rem]:pt-10"
    >
      <div className="flex items-center justify-center">
        {/*
          Decorative timeline rail behind the stage thumbnail, as Architect
          draws it:
          - image height h-28 (7rem); rail height h-56 (14rem) extends 3.5rem
            above and below to bleed past both ends
          - -top-13 (-3.25rem) centres the rail vertically on the image
          - border-l-10 (10px) matches the badge timeline accent width
        */}
        <div className="before:border-neon-coral relative before:absolute before:-top-13 before:left-[50%] before:h-56 before:border-l-10 before:mask-[linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]">
          {/*
            Decorative: the interface is NAMED in the badge below, so an image
            that announced it too would say the same thing twice to a reader
            who cannot see it. Architect's alt text predates that badge.
          */}
          <StageTypeImage
            type={identity.type}
            ratio="4:3"
            sizes="10rem"
            alt=""
            className="border-navy-taupe relative h-28 w-auto rounded-sm border-2"
          />
        </div>
      </div>
      {/* The field's own margin is dropped so the hero input sits directly
          under the position line, as one block of heading. */}
      <div className="flex min-w-0 flex-col justify-center *:data-[field-name=label]:m-0">
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
        <Field<typeof StageNameInput>
          name="label"
          component={StageNameInput}
          // The hero input is the visible heading, so the label exists for
          // assistive technology — but it still has to exist, because it is
          // what the outline and a host's problem panel call this field.
          label={stageNameLabel}
          labelHidden
          placeholder={intl.formatMessage(messages.placeholder)}
          characterLimit={STAGE_NAME_LIMIT}
          required={REQUIRED}
          autoFocus={autoFocus ?? isNewStage}
          onFieldBlur={onLabelBlur}
        />
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
      </div>
    </section>
  );
}
