import { cx } from '@codaco/fresco-ui/utils/cva';

type CanvasBackgroundImageProps = {
  'src': string;
  'className'?: string;
  'data-testid'?: string;
};

export default function CanvasBackgroundImage({
  src,
  className,
  ...props
}: CanvasBackgroundImageProps) {
  return (
    <img
      src={src}
      className={cx(
        'pointer-events-none size-full object-contain object-center',
        className,
      )}
      alt=""
      aria-hidden="true"
      {...props}
    />
  );
}
