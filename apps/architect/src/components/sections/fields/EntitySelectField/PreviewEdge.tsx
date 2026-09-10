import type { ButtonHTMLAttributes, CSSProperties } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Icon from '@codaco/fresco-ui/Icon';
import type { ColorReference } from '@codaco/protocol-validation';
import { cx } from '~/utils/cva';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';
const chromeMessages = defineMessages({
  selectEdge: {
    id: 'architect.chrome.sections.fields.entitySelectField.previewEdge.selectEdge',
    defaultMessage: 'Select edge {label}',
    description:
      'The aria-label text in components / sections / fields / EntitySelectField / PreviewEdge.',
  },
});

type PreviewEdgeProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'color'
> & {
  label: string;
  color: ColorReference;
  selected?: boolean;
  surface?: 1 | 2;
};

const PreviewEdge = ({
  label,
  color,
  onClick,
  selected = false,
  surface = 1,
  className,
  ...buttonProps
}: PreviewEdgeProps) => {
  const intl = useAppIntl();
  const wrapperStyle = {
    '--edge-color': resolveProtocolColor(color),
  } as CSSProperties;

  const iconStyle = {
    '--icon-tone-primary': resolveProtocolColor(color, { dark: true }),
    '--icon-tone-secondary': resolveProtocolColor(color),
  } as CSSProperties;

  const content = (
    <>
      <Icon name="links" className="mr-2.5 size-6" style={iconStyle} />
      {label}
    </>
  );

  const surfaceClasses =
    surface === 2
      ? 'bg-surface-2 text-surface-2-contrast'
      : 'bg-surface-1 text-surface-1-contrast';

  const baseClasses =
    'focusable relative flex flex-row items-center rounded-full border-4 border-transparent px-5 py-2.5 transition-[border-color] duration-300 ease-in-out';

  if (onClick) {
    return (
      <button
        {...buttonProps}
        type="button"
        className={cx(
          baseClasses,
          surfaceClasses,
          'clickable',
          selected && 'border-(--edge-color)',
          className,
        )}
        style={wrapperStyle}
        onClick={onClick}
        aria-label={
          buttonProps['aria-label'] ??
          intl.formatMessage(chromeMessages.selectEdge, { label: label })
        }
      >
        {content}
      </button>
    );
  }

  // A `<span>`, not a `<div>`: with no `onClick` this is a picture of an edge
  // type, and a rule card renders one inside its edit button — where only
  // phrasing content is valid. `display: flex` keeps the box identical.
  return (
    <span
      className={cx(
        baseClasses,
        surfaceClasses,
        selected && 'pointer-events-none border-(--edge-color)',
        className,
      )}
      style={wrapperStyle}
    >
      {content}
    </span>
  );
};

export default PreviewEdge;
