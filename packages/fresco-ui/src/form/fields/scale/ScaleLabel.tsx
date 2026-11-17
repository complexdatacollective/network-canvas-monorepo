import type { CSSProperties } from 'react';

import OptionLabel from '../../../OptionLabel';
import type { PresentationalText } from '../../../PresentationalText';
import { controlLabelVariants } from '../../../styles/controlVariants';
import { cx } from '../../../utils/cva';

type ScaleLabelProps = {
  label: PresentationalText;
  /** Where the scale puts the label and how it aligns it. */
  className?: string;
  style?: CSSProperties;
};

/**
 * A label where a scale puts it.
 *
 * Two directions meet in a scale label and they are not always the same one.
 * Where the label sits, and which edge its lines align to, follow the track:
 * the first value's label belongs at the track's start whatever it is written
 * in. How its own words run follows the label, which carries a language and
 * direction of its own when the interview shows it in another language than
 * the page: an answer left untranslated, say.
 *
 * So the element the scale places has no direction of its own and inherits the
 * track's, and the label's language and direction go on the text inside it. A
 * logical position or alignment on an element that also took the label's
 * direction would be resolved against the label instead of the track.
 */
export default function ScaleLabel({
  label,
  className,
  style,
}: ScaleLabelProps) {
  return (
    <div
      className={cx(controlLabelVariants({ size: 'sm' }), className)}
      style={style}
    >
      <OptionLabel label={label} />
    </div>
  );
}
