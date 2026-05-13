import type { StageType } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { useId } from "react";
import Badge from "~/components/Badge";
import ExternalLink from "~/components/ExternalLink";
import timelineImages from "~/images/timeline";
import { cn } from "~/utils/cn";
import { useFormContext } from "../Editor";
import ValidatedField from "../Form/ValidatedField";
import IssueAnchor from "../IssueAnchor";
import { getInterface } from "./Interfaces";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

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

const HeadingInput = ({ input = {}, meta = {}, placeholder, maxLength, autoFocus }: HeadingInputProps) => {
	const errorId = useId();
	const hasError = !!(meta.invalid && meta.touched && meta.error);
	return (
		<>
			{/* biome-ignore lint/a11y/noAutofocus: stage name is the primary action in this hero */}
			<input
				{...input}
				type="text"
				placeholder={placeholder}
				maxLength={maxLength}
				autoFocus={autoFocus}
				aria-label="Stage name"
				aria-invalid={hasError}
				aria-describedby={hasError ? errorId : undefined}
				className={cn(
					"h1 my-0 w-full bg-transparent border-none outline-none p-0 placeholder:opacity-40",
					hasError && "text-error",
				)}
			/>
			{hasError && (
				<div id={errorId} className="text-error text-sm mt-(--space-xs)">
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

	const type = get(values, "type") as string | undefined;
	const isNewStage = !get(initialValues, "label");

	if (!type) {
		return null;
	}

	const interfaceMeta = getInterface(type as StageType);
	const typeLabel = interfaceMeta.name;
	const documentationLink = interfaceMeta.documentation;

	return (
		<div className="w-full pt-(--space-lg) sm:pt-(--space-xl) lg:grid lg:grid-cols-[20rem_auto] lg:gap-8 max-lg:flex max-lg:flex-col max-lg:gap-(--space-md)">
			<div className="flex items-center justify-center">
				{/*
				 * Decorative timeline rail behind the stage thumbnail.
				 * - image height: h-28 (7rem); rail height h-56 (14rem) extends 3.5rem above and below to bleed past both ends
				 * - -top-13 (-3.25rem) shifts the rail up so it is vertically centered on the image
				 * - border-l-10 (10px) stroke matches the badge timeline accent width
				 */}
				<div className="relative before:absolute before:left-[50%] before:border-l-10 before:h-56 before:border-neon-coral before:-top-13 before:mask-[linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]">
					<img
						src={getTimelineImage(type)}
						alt={`${typeLabel} interface`}
						title={`${typeLabel} interface`}
						className="relative rounded h-28 w-auto"
					/>
				</div>
			</div>
			<div className="flex flex-col gap-(--space-md) min-w-0 justify-center">
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
				<div className="flex items-center gap-(--space-md) flex-wrap text-sm">
					<Badge color="neon-coral">{typeLabel}</Badge>
					{documentationLink && <ExternalLink href={documentationLink}>Documentation</ExternalLink>}
				</div>
			</div>
		</div>
	);
};

export default StageHeading;
