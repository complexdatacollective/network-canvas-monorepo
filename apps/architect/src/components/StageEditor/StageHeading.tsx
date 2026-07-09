import { get } from 'es-toolkit/compat';
import { useId } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageType } from '@codaco/protocol-validation';
import ExternalLink from '~/components/ExternalLink';
import StageTypeImage from '~/components/StageTypeImage';
import { cx } from '~/utils/cva';

import { useFormContext } from '../Editor';
import ValidatedField from '../Form/ValidatedField';
import IssueAnchor from '../IssueAnchor';
import { useAutoStageName } from './autoStageName/useAutoStageName';
import { getInterface } from './Interfaces';
type HeadingInputProps = {
  input?: {
    name?: string;
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
  };
  meta?: {
    error?: string;
    invalid?: boolean;
    touched?: boolean;
  };
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  onFieldBlur?: () => void;
};
const HeadingInput = ({
  input = {},
  meta = {},
  placeholder,
  maxLength,
  autoFocus,
  onFieldBlur,
}: HeadingInputProps) => {
  const errorId = useId();
  const hasError = !!(meta.invalid && meta.touched && meta.error);
  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    input.onBlur?.(event);
    onFieldBlur?.();
  };
  return (
    <>
      <input
        {...input}
        onBlur={handleBlur}
        type="text"
        placeholder={placeholder}
        maxLength={maxLength}
        // biome-ignore lint/a11y/noAutofocus: stage name is the primary action in this hero
        autoFocus={autoFocus}
        aria-label="Stage name"
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cx(
          headingVariants({ level: 'h1', margin: 'none' }),
          'w-full border-none bg-transparent p-0 outline-none placeholder:opacity-40',
          hasError && 'text-destructive',
        )}
      />
      {hasError && (
        <div id={errorId} className="text-destructive mt-1 text-sm">
          {meta.error}
        </div>
      )}
    </>
  );
};
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
  const { values } = useFormContext();
  const type = get(values, 'type') as string | undefined;
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
            className="relative h-28 w-auto rounded"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-5">
        <Paragraph
          className={headingVariants({
            level: 'label',
            variant: 'all-caps',
            margin: 'none',
            className: 'text-muted',
          })}
        >
          Stage {stageNumber} of {totalStages}
        </Paragraph>
        <IssueAnchor fieldName="label" description="Stage name" />
        <ValidatedField<{
          onFieldBlur?: () => void;
        }>
          name="label"
          component={HeadingInput}
          componentProps={{ onFieldBlur: onLabelBlur }}
          placeholder="Enter stage name..."
          maxLength={50}
          validation={{ required: true }}
          autoFocus={isNewStage}
        />
        <div className="flex flex-wrap items-center gap-5 text-sm">
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
