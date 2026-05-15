import { get } from 'es-toolkit/compat';
import { useId } from 'react';

import type { StageType } from '@codaco/protocol-validation';
import Badge from '~/components/Badge';
import ExternalLink from '~/components/ExternalLink';
import timelineImages from '~/images/timeline';
import { cn } from '~/utils/cn';

import { useFormContext } from '../Editor';
import ValidatedField from '../Form/ValidatedField';
import IssueAnchor from '../IssueAnchor';
import { getInterface } from './Interfaces';

const getTimelineImage = (type: string) =>
  get(timelineImages, type, timelineImages.Default);

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
};

const HeadingInput = ({
  input = {},
  meta = {},
  placeholder,
  maxLength,
  autoFocus,
}: HeadingInputProps) => {
  const errorId = useId();
  const hasError = !!(meta.invalid && meta.touched && meta.error);
  return (
    <>
      <input
        {...input}
        type="text"
        placeholder={placeholder}
        maxLength={maxLength}
        // biome-ignore lint/a11y/noAutofocus: stage name is the primary action in this hero
        autoFocus={autoFocus}
        aria-label="Stage name"
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
        className={cn(
          'h1 my-0 w-full border-none bg-transparent p-0 outline-none placeholder:opacity-40',
          hasError && 'text-error',
        )}
      />
      {hasError && (
        <div id={errorId} className="text-error mt-(--space-xs) text-sm">
          {meta.error}
        </div>
      )}
    </>
  );
};

type StageHeadingProps = {
  stageNumber: number;
  totalStages: number;
};

const StageHeading = ({ stageNumber, totalStages }: StageHeadingProps) => {
  const { values, initialValues } = useFormContext();

  const type = get(values, 'type') as string | undefined;
  const isNewStage = !get(initialValues, 'label');

  if (!type) {
    return null;
  }

  const interfaceMeta = getInterface(type as StageType);
  const typeLabel = interfaceMeta.name;
  const documentationLink = interfaceMeta.documentation;

  return (
    <div className="w-full pt-(--space-lg) max-lg:flex max-lg:flex-col max-lg:gap-(--space-md) sm:pt-(--space-xl) lg:grid lg:grid-cols-[20rem_auto] lg:gap-8">
      <div className="flex items-center justify-center">
        {/*
         * Decorative timeline rail behind the stage thumbnail.
         * - image height: h-28 (7rem); rail height h-56 (14rem) extends 3.5rem above and below to bleed past both ends
         * - -top-13 (-3.25rem) shifts the rail up so it is vertically centered on the image
         * - border-l-10 (10px) stroke matches the badge timeline accent width
         */}
        <div className="before:border-neon-coral relative before:absolute before:-top-13 before:left-[50%] before:h-56 before:border-l-10 before:mask-[linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]">
          <img
            src={getTimelineImage(type)}
            alt={`${typeLabel} interface`}
            title={`${typeLabel} interface`}
            className="relative h-28 w-auto rounded"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-(--space-md)">
        <p className="small-heading text-muted-foreground m-0">
          Stage {stageNumber} of {totalStages}
        </p>
        <IssueAnchor fieldName="label" description="Stage name" />
        <ValidatedField
          name="label"
          component={HeadingInput}
          placeholder="Enter stage name..."
          maxLength={50}
          validation={{ required: true }}
          autoFocus={isNewStage}
        />
        <div className="flex flex-wrap items-center gap-(--space-md) text-sm">
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
