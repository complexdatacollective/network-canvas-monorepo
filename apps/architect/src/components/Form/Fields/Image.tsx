import { BackgroundImage } from '../../Assets';
import type { FileInputProps } from './File';
import File from './File';

type ImageInputProps = Omit<FileInputProps, 'children' | 'type'> & {
  canvasBackgroundPreview?: boolean;
};

export const ImagePreview = ({
  id,
  canvasBackground = false,
}: {
  id: string;
  canvasBackground?: boolean;
}) => (
  <div
    data-theme-interview={canvasBackground ? '' : undefined}
    className={
      canvasBackground
        ? 'bg-background h-[30vh] w-full overflow-hidden rounded'
        : 'bg-rich-black w-full rounded p-5'
    }
  >
    <BackgroundImage
      id={id}
      className={
        canvasBackground
          ? 'size-full'
          : 'h-[30vh] w-full bg-contain bg-center bg-no-repeat'
      }
      imageClassName={
        canvasBackground ? 'size-full object-contain object-center' : undefined
      }
    />
  </div>
);

const ImageInput = ({
  canvasBackgroundPreview = false,
  ...props
}: ImageInputProps) => (
  <File
    type="image"
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  >
    {(id: string) => (
      <ImagePreview id={id} canvasBackground={canvasBackgroundPreview} />
    )}
  </File>
);

export default ImageInput;
