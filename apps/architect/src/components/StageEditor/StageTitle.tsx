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
 * Architect's rather than the editor package's, for the same reason the section
 * list is: the package publishes the name as a field (`StageNameField`) and the
 * facts about the interface (`useStageTypeInfo`), and what a stage title LOOKS
 * like belongs to the app the editor is drawn in. Everything about the NAME —
 * its value, the refusal an unnamed stage earns, the form the control belongs
 * to — comes from that field; this decides that it is drawn at hero size beside
 * a picture of the interface.
 *
 * Architect also opts into the proposed name (`useAutoStageName`): a new stage
 * arrives already called something rather than with an empty heading to fill in
 * first. That is this app's decision about authoring, not the protocol's, which
 * is why it is a hook the host calls rather than something the field does — and
 * it is why the name claims no focus: there is nothing left to fill in.
 *
 * Rendered from the editor's HEADER slot, so it is inside the stage form's own
 * provider — the name is a field of that form — and above the form's own
 * fields, which is where a title belongs.
 */
export default function StageTitle({
  position,
}: Readonly<{
  /**
   * Where this stage sits in the interview, for orientation.
   *
   * Handed in rather than read here, because it comes from this tab's Redux
   * store and everything else this draws comes from the open edit: the chrome
   * that renders this is already connected, and a title that reached for the
   * store as well could not be drawn anywhere else. A stage the order does not
   * contain yet — one being created — has no position to state.
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
      // The rhythm Architect's stage editor has always had between the top of
      // the page and its first section: 1.75rem above the title, 3.5rem below
      // it. Only 2rem of that is stated here — the editor lays its own slots
      // out in a column with `gap-6`, so the 1.5rem between this and the form
      // below is already there, and stating the whole 3.5rem again would put
      // 5rem between the title and the first card.
      //
      // Two columns from `48rem` of CONTAINER, which is the column the editor
      // was given — the title is drawn in the editor's header slot, so that is
      // what answers the query. The editor pads its own column by 24px a side,
      // so at the threshold the name has 768 − 48 of gutter − 14rem of rail −
      // `gap-8` = 464px, and about 580px at the route's widest. Below the
      // threshold the rail would be taking room the name has not got, so the
      // two stack and the name keeps the whole width.
      className="mb-8 flex w-full flex-col gap-5 pt-7 @min-[48rem]:grid @min-[48rem]:grid-cols-[14rem_auto] @min-[48rem]:gap-8 @min-[48rem]:pt-10"
    >
      <div className="flex items-center justify-center">
        {/*
          Decorative timeline rail behind the stage thumbnail:
          - image height h-28 (7rem); rail height h-56 (14rem) extends 3.5rem
            above and below to bleed past both ends
          - -top-13 (-3.25rem) centres the rail vertically on the image
          - border-l-10 (10px) matches the badge timeline accent width
        */}
        <div className="before:border-neon-coral relative before:absolute before:-top-13 before:left-[50%] before:h-56 before:border-l-10 before:mask-[linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]">
          {/*
            Decorative: the interface is NAMED in the badge below, so an image
            that announced it too would say the same thing twice to a reader
            who cannot see it.
          */}
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
          A real heading rather than a label: the visible one is the name field
          itself, which is a control and cannot be a heading. Written at `h2`
          because this route knows where it is — the page's own `h1` is the
          stage's name, stated above the columns — and everything the editor
          draws below counts from here, which is what the
          `EnclosingHeadingLevel` around the editor says.

          Visually hidden, so the hero input is still the only stage title on
          screen.
        */}
        <h2 id={headingId} className="sr-only">
          {label}
        </h2>
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
