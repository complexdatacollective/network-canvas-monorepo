import { Badge } from '@codaco/fresco-ui/Badge';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import HeadingInput from '@codaco/protocol-builder/fields/StageNameInput';
import type { StageType } from '@codaco/protocol-validation';
import ExternalLink from '~/components/ExternalLink';
import StageTypeImage from '~/components/StageTypeImage';

import ArchitectField from '../Form/ArchitectField';
import IssueAnchor from '../IssueAnchor';
import { useAutoStageName } from './autoStageName/useAutoStageName';
import { getInterface } from './Interfaces';
import { useStageInitialValue } from './stageFormHooks';

type StageHeadingProps = {
  stageNumber: number;
  totalStages: number;
  isNewStage: boolean;
};

const StageHeading = ({
  stageNumber,
  totalStages,
  isNewStage,
}: StageHeadingProps) => {
  const type = useStageInitialValue<string>('type');
  const initialLabel = useStageInitialValue<string>('label');
  const { onLabelBlur } = useAutoStageName(isNewStage);

  if (!type) {
    return null;
  }

  const interfaceMeta = getInterface(type as StageType);
  const typeLabel = interfaceMeta.name;
  const documentationLink = interfaceMeta.documentation;

  return (
    <div className="max-tablet-landscape:flex max-tablet-landscape:flex-col max-tablet-landscape:gap-5 tablet-portrait:pt-10 tablet-landscape:grid tablet-landscape:grid-cols-[20rem_auto] tablet-landscape:gap-8 w-full pt-7">
      <div className="flex items-center justify-center">
        {/*
         * Decorative timeline rail behind the stage thumbnail.
         * - image height: h-28 (7rem); rail height h-56 (14rem) extends 3.5rem above and below to bleed past both ends
         * - -top-13 (-3.25rem) shifts the rail up so it is vertically centered on the image
         * - border-l-10 (10px) stroke matches the badge timeline accent width
         */}
        <div className="before:border-neon-coral relative before:absolute before:-top-13 before:left-[50%] before:h-56 before:border-l-10 before:mask-[linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]">
          <StageTypeImage
            type={type}
            ratio="4:3"
            sizes="10rem"
            alt={`${typeLabel} interface`}
            className="border-navy-taupe relative h-28 w-auto rounded-sm border-2"
          />
        </div>
      </div>
      {/** *:data-[field-name=label] is because there's no way to add classes to the Field */}
      <div className="flex min-w-0 flex-col justify-center *:data-[field-name=label]:m-0">
        <Paragraph
          className={headingVariants({
            level: 'label',
            variant: 'all-caps',
            margin: 'none',
            className: 'text-current/70',
          })}
        >
          Stage {stageNumber} of {totalStages}
        </Paragraph>
        <IssueAnchor fieldName="label" description="Stage name" />
        <ArchitectField<typeof HeadingInput>
          name="label"
          component={HeadingInput}
          // The hero input is the visible heading; the label exists for
          // assistive technology, and its exact text is an e2e contract.
          label="Stage name"
          labelHidden
          initialValue={initialLabel}
          onFieldBlur={onLabelBlur}
          placeholder="Enter stage name..."
          characterLimit={50}
          validation={{ required: true }}
          autoFocus={isNewStage}
        />
        <div className="mt-2 flex flex-wrap items-center gap-5 text-sm">
          <Badge color="neon-coral">{typeLabel}</Badge>
          {documentationLink && (
            <ExternalLink href={documentationLink}>Documentation</ExternalLink>
          )}
        </div>
      </div>
    </div>
  );
};

export default StageHeading;
