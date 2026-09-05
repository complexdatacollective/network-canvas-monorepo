import { useId } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
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
  /**
   * Propose a name for a stage being created, derived from what it is being
   * configured to do, until the researcher names it themselves.
   *
   * Present means propose, so an editor opening an existing stage simply
   * leaves it out: an existing stage's name is already the researcher's.
   * `panels` is supplied by the editor rather than read from the draft,
   * because a name generator's panels are held in the form as per-index
   * leaves that only the section writing them can assemble.
   */
  autoName?: Readonly<{ panels?: readonly AutoStageNamePanel[] }>;
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
  autoName,
  copy,
}: StageNameSectionProps) {
  const { identity } = useStageEditorForm();
  const words = { ...DEFAULT_COPY, ...copy };
  const { sectionId } = useOutlineSection(words.sectionTitle);
  const headingId = useId();
  const interfaceName = interfaceDisplayName(identity.type) ?? identity.type;
  const { onLabelBlur } = useAutoStageName({
    isNewStage: autoName !== undefined,
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
        <ProtocolField<typeof StageNameInput>
          name="label"
          component={StageNameInput}
          // The hero input is the visible heading, so the label exists for
          // assistive technology — but it still has to exist, because it is
          // what the outline and a host's problem panel call this field.
          label={words.fieldLabel}
          labelHidden
          placeholder={words.placeholder}
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
            Documentation
          </NativeLink>
        )}
      </div>
    </section>
  );
}
