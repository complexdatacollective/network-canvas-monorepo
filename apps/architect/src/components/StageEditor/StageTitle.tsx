import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import StageNameField from '@codaco/protocol-builder/fields/StageNameField';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import { useStageTypeInfo } from '@codaco/protocol-builder/interfaces/useStageTypeInfo';
import { useAutoStageName } from '@codaco/protocol-builder/naming/useAutoStageName';
import { useStageName } from '@codaco/protocol-builder/naming/useStageName';
const messages = defineMessages({
  position: {
    id: 'architect.stageEditor.stageTitle.position',
    defaultMessage: 'Stage {index, number} of {total, number}',
    description:
      'Where the stage being edited sits in the interview, shown above its name. index is one-based. A stage is one step of an interview.',
  },
  documentation: {
    id: 'architect.stageEditor.stageTitle.documentation',
    defaultMessage: 'Documentation',
    description:
      'Link beside the name of the stage being edited, to the documentation for this type of interview interface.',
  },
});

/**
 * The stage being edited, at the top of its page: what kind of stage it is,
 * where it sits in the interview, and what the researcher calls it.
 *
 * Architect's rather than the package's, for the same reason the section list
 * is: the package publishes the name as a field and the facts about the
 * interface, and what a title LOOKS like belongs to the app. Architect also
 * opts into the proposed name, which is this app's decision about authoring
 * rather than the protocol's.
 *
 * Rendered from the editor's HEADER slot: inside the stage form's provider,
 * because the name is a field of it, and above the form's own fields.
 */
export default function StageTitle({
  position,
}: Readonly<{
  /**
   * Where this stage sits in the interview. Handed in rather than read here:
   * it is the only thing this draws that comes from Redux rather than from the
   * open edit, and a title that reached for the store could not be drawn
   * anywhere else.
   */
  position?: Readonly<{ index: number; total: number }>;
}>) {
  const intl = useAppIntl();
  const headingId = useId();
  const { stageType, interfaceName, documentationUrl } = useStageTypeInfo();
  const { label } = useStageName();
  const { onBlur } = useAutoStageName();

  return (
    <div
      aria-labelledby={headingId}
      // 1.75rem above the title and 3.5rem below it, of which only 2rem is
      // stated: the shell lays its slots out with `gap-6`, so the other 1.5rem
      // is already there.
      //
      // Two columns from `48rem` of the editor's own column, which is what
      // answers the query from the header slot. The editor pads that column by
      // 24px a side, so at the threshold the name has 768 − 48 − 14rem − 32 =
      // 464px; below it the rail would take room the name has not got.
      className="mb-8 flex w-full flex-col gap-5 pt-7 @min-[48rem]:grid @min-[48rem]:grid-cols-[14rem_auto] @min-[48rem]:gap-8 @min-[48rem]:pt-10"
    >
      <div className="flex items-center justify-center">
        {/*
          Decorative timeline rail behind the thumbnail: `h-56` is the `h-28`
          image plus 3.5rem of bleed each end, `-top-13` centres it on the
          image, and `border-l-10` matches the badge timeline accent.
        */}
        <div className="before:border-neon-coral relative before:absolute before:-top-13 before:left-[50%] before:h-56 before:border-l-10 before:mask-[linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]">
          {/* Decorative: the badge below names the interface. */}
          <StageTypeImage
            type={stageType}
            ratio="4:3"
            sizes="10rem"
            alt=""
            className="border-navy-taupe relative h-28 w-auto rounded-sm border-2"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center">
        {/*
          A heading rather than a label: the visible one is the name field,
          which is a control and cannot be a heading. `h2` because the route's
          own `h1` is the stage's name, and everything the editor draws counts
          from here. Hidden, so the hero input is the only title on screen.
        */}
        <h2 id={headingId} className="sr-only">
          {label}
        </h2>
        {position && (
          <Paragraph
            emphasis="muted"
            className={headingVariants({
              level: 'label',
              variant: 'all-caps',
              margin: 'none',
            })}
          >
            {intl.formatMessage(messages.position, {
              index: position.index,
              total: position.total,
            })}
          </Paragraph>
        )}
        <StageNameField onBlur={onBlur} />
        <div className="mt-2 flex flex-wrap items-center gap-5 text-sm">
          <Badge color="neon-coral">{interfaceName}</Badge>
          <NativeLink
            href={documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {intl.formatMessage(messages.documentation)}
          </NativeLink>
        </div>
      </div>
    </div>
  );
}
