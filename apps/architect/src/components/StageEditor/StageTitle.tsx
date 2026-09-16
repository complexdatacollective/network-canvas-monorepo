import { useId } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';
import { BaseField } from '@codaco/fresco-ui/form/Field/BaseField';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import StageNameInput from '@codaco/protocol-builder/fields/StageNameInput';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import { useStageTypeInfo } from '@codaco/protocol-builder/interfaces/useStageTypeInfo';
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
 * list is: the package publishes the name's bindings (`useStageName`) and the
 * facts about the interface (`useStageTypeInfo`), and what a stage title LOOKS
 * like belongs to the app the editor is drawn in. Everything about the NAME —
 * its value, the proposal a new stage arrives with, the refusal an unnamed one
 * earns — comes from the hook; this decides that it is drawn at hero size
 * beside a picture of the interface.
 *
 * Rendered from the editor's action slot, so it is inside the stage form's own
 * provider and the name is a field of that form, and portalled above the
 * route's two columns, so it spans both. That is also what dissolves the
 * section list's old top offset: the list and the form now begin at the same
 * point, because nothing of the editor's is drawn above either of them.
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
  const { label, error, id, containerProps, fieldProps, isNewStage } =
    useStageName();

  return (
    <div
      aria-labelledby={headingId}
      // The rhythm Architect's stage editor has always had between the top of
      // the page and its first section: 1.75rem above the title, 3.5rem below
      // it. Both columns begin under this, so the section list beside the form
      // is spaced by it too.
      //
      // Two columns from `56rem` of CONTAINER, which is the route's own column
      // rather than the editor's: this block spans both, so at the threshold
      // the name has 896 − 20rem of rail − `gap-8` = 544px, which is what
      // Architect's heading gave it before the editor moved into a package.
      // Below that the rail would be taking room the name has not got.
      className="mb-14 flex w-full flex-col gap-5 pt-7 @min-[56rem]:grid @min-[56rem]:grid-cols-[20rem_auto] @min-[56rem]:gap-8 @min-[56rem]:pt-10"
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
      {/* The field's own margin is dropped so the hero input sits directly
          under the position line, as one block of heading. */}
      <div className="flex min-w-0 flex-col justify-center *:data-[field-name=label]:m-0">
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
        <BaseField
          id={id}
          name={fieldProps.name}
          // The hero input is the visible heading, so the label exists for
          // assistive technology — but it still has to exist, because it is
          // what the editor's outline and the Issues panel call this field.
          label={label}
          labelHidden
          required
          errors={error === undefined ? undefined : [error]}
          showErrors={error !== undefined}
          containerProps={containerProps}
        >
          {/*
            Focus lands here only for a stage being created, where naming the
            stage IS the next step — and the route's own focus handling leaves
            a destination that has already claimed focus alone, so the two do
            not fight. Opening an edit the researcher did not ask for would be
            worse than a silent arrival on an existing stage.
          */}
          <StageNameInput {...fieldProps} autoFocus={isNewStage} />
        </BaseField>
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
