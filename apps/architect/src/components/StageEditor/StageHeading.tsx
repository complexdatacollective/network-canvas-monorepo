import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { headingVariants } from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageType } from '@codaco/protocol-validation';
import ExternalLink from '~/components/ExternalLink';
import StageTypeImage from '~/components/StageTypeImage';
import { cx } from '~/utils/cva';

import ArchitectField from '../Form/ArchitectField';
import IssueAnchor from '../IssueAnchor';
import { useAutoStageName } from './autoStageName/useAutoStageName';
import { getInterface } from './Interfaces';
import { useStageInitialValue } from './stageFormHooks';

/**
 * Type and box metrics the control and its sizing replica below must share.
 * The replica only stands in for the textarea's layout while both break lines
 * in the same places, so every property that affects line breaking has to be
 * set here rather than on one of them.
 *
 * `text-wrap` (normal) overrides the `text-pretty` `headingVariants` sets:
 * `pretty` is a per-engine heuristic, and there is no guarantee a form
 * control's inner text applies it the same way a block does. Plain wrapping is
 * defined identically for both, and at these lengths `pretty` was not changing
 * where the heading broke anyway.
 */
const sharedTextLayout = cx(
  headingVariants({ level: 'h1', margin: 'none' }),
  'col-start-1 row-start-1 w-full border-none p-0 text-wrap whitespace-pre-wrap',
);

/**
 * The button a browser would use for this form's implicit submission: the
 * first submit button the form owns, in tree order. `form.elements` is the
 * right list because it includes controls associated by the `form` attribute —
 * the stage editor's "Finished Editing" button lives in the nav, outside the
 * `<form>`, and is only reachable this way.
 */
const findDefaultSubmitButton = (form: HTMLFormElement) =>
  Array.from(form.elements).find(
    (element): element is HTMLButtonElement | HTMLInputElement =>
      (element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement) &&
      element.type === 'submit',
  );

type HeadingInputProps = {
  'id'?: string;
  'name'?: string;
  'value'?: string;
  'onChange'?: (value: string) => void;
  /** Blur hook for auto-naming; the form's own blur handling is on the container. */
  'onFieldBlur'?: () => void;
  'placeholder'?: string;
  /**
   * Hard cap on typed characters. Not called `maxLength`: that name belongs to
   * fresco-ui's validation catalogue, where it would become a post-hoc error
   * instead of the input's own limit.
   */
  'characterLimit'?: number;
  'autoFocus'?: boolean;
  'disabled'?: boolean;
  'readOnly'?: boolean;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/**
 * The stage name, rendered at hero size. The label and error text come from
 * the surrounding `BaseField`, so this is only the control.
 *
 * It is a `<textarea>` rather than an `<input>` for one reason: an input lays
 * its value out on a single unwrappable line, so a stage name longer than the
 * column was cut off at the edge with nothing to say more of it existed. The
 * value itself stays one line — breaks are refused on keypress and collapsed
 * on paste — so nothing downstream has to cope with a multi-line stage name.
 */
export const HeadingInput = ({
  id,
  name,
  value = '',
  onChange,
  onFieldBlur,
  placeholder,
  characterLimit,
  autoFocus,
  disabled = false,
  readOnly = false,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: HeadingInputProps) => {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    // Reachable by paste and by drop, neither of which `onKeyDown` sees. A
    // space rather than nothing, so two pasted lines do not run together into
    // one word.
    //
    // One space per break, and deliberately NOT the surrounding whitespace as
    // well: `maxLength` is the browser's, applied to the raw value before this
    // runs. Anything that shortened the string here would hand the cap
    // characters to discard that the finished name had room for — an indented
    // 51-character paste that normalises to 45 came back cut at 44. Preserving
    // the length costs a run of spaces where the paste was indented, which the
    // researcher can see and tidy; the truncation silently took real text.
    onChange?.(event.target.value.replace(/[\r\n]/g, ' '));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // An IME sends Enter to commit the candidate the researcher is choosing.
    // Intercepting it would submit a name that is still being composed.
    if (event.nativeEvent.isComposing || event.key !== 'Enter') {
      return;
    }

    // A textarea would insert a line break here. The `<input>` this replaces
    // performed the form's implicit submission instead, so that is what Enter
    // still does.
    event.preventDefault();

    // Implicit submission CLICKS the default button rather than submitting the
    // form behind it, and that distinction is load-bearing here: "Finished
    // Editing" carries an `onClick` that reopens the Issues panel on a repeat
    // failed attempt, when neither `submitFailed` nor the error set changes and
    // the auto-open effect therefore does not re-fire. `requestSubmit()` would
    // skip it. A click also inherits the browser's own handling of the cases
    // with nothing to press: no default button (the stage editor renders one
    // only once there are unsaved changes) and a disabled one both do nothing.
    const form = event.currentTarget.form;
    if (form) {
      findDefaultSubmitButton(form)?.click();
    }
  };

  const handleBlur = (_event: FocusEvent<HTMLTextAreaElement>) => {
    onFieldBlur?.();
  };

  return (
    /*
     * A textarea cannot size itself to its own content, so the same text is
     * laid out behind it in an ordinary block, which can. Both occupy one grid
     * cell: the block gives the cell its height and the textarea stretches to
     * fill it. Layout does all of the work, so the height stays correct across
     * width changes, zoom, and a web font that arrives after first paint —
     * none of which a measured height notices without being told to look.
     *
     * `minmax(0,1fr)` is what stops the column from widening to the replica's
     * min-content width. Without it a stage name containing one long unbroken
     * word pushes the whole hero wider than its container instead of breaking.
     */
    <div className="grid w-full grid-cols-[minmax(0,1fr)]">
      <div aria-hidden="true" className={cx(sharedTextLayout, 'invisible')}>
        {/*
         * The trailing space holds the height of a line ending in whitespace,
         * which a block collapses away but the textarea still shows a caret
         * on. The placeholder stands in while the field is empty because the
         * textarea renders it at the same size, wrapped the same way.
         */}
        {value || placeholder}{' '}
      </div>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        rows={1}
        // The control wraps, but the value it holds is one line and Enter
        // never adds another. Without this a screen reader announces a
        // multiline textbox, describing an Enter that does not exist.
        aria-multiline={false}
        placeholder={placeholder}
        maxLength={characterLimit}
        autoFocus={autoFocus}
        disabled={disabled}
        readOnly={readOnly}
        aria-required={ariaRequired}
        aria-invalid={ariaInvalid}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={cx(
          sharedTextLayout,
          'focusable h-full resize-none overflow-hidden bg-transparent outline-none placeholder:opacity-40',
          ariaInvalid && 'text-destructive',
        )}
      />
    </div>
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
