import FeedbackPopover, {
  type FeedbackPopoverProps,
} from '@codaco/fresco-ui/navigation/FeedbackPopover';
import { appFeedbackSurvey } from '@codaco/shared-consts';
import { posthog } from '~/analytics';
import { cx } from '~/utils/cva';

const survey = appFeedbackSurvey((event, properties) =>
  posthog.capture(event, properties),
);

type NavFeedbackProps = {
  /** The trigger's look: the row it sits among supplies it. */
  className: string;
  display?: FeedbackPopoverProps['display'];
};

/** The header's feedback control, dressed as one of its navigation items. */
export default function NavFeedback({ className, display }: NavFeedbackProps) {
  return (
    <FeedbackPopover
      {...survey}
      display={display}
      renderTrigger={
        // Named by the popover.
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label
        <button
          type="button"
          className={cx(
            'inline-flex cursor-pointer items-center border-0 bg-transparent p-0',
            className,
          )}
        />
      }
    />
  );
}
