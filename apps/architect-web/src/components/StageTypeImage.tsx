import InterfacePicture, {
  type InterfacePictureProps,
} from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';
import { defaultStageImage } from '~/images/timeline';

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

type StageTypeImageProps = Omit<InterfacePictureProps, 'type' | 'alt'> & {
  /** Stage type — falls back to the Default placeholder when no generated
   * screenshot exists for it. */
  type: string;
  alt?: string;
};

/**
 * Renders the generated screenshot for a stage type as a responsive
 * `<picture>`, or the static Default placeholder for stage types without
 * a generated image.
 */
const StageTypeImage = ({ type, alt, ...rest }: StageTypeImageProps) => {
  if (isInterfaceType(type)) {
    return (
      <InterfacePicture
        type={type}
        alt={alt ?? `${type} interface`}
        {...rest}
      />
    );
  }
  return (
    <img
      src={defaultStageImage.src}
      width={defaultStageImage.width}
      height={defaultStageImage.height}
      alt={alt ?? `${type} interface`}
      loading={rest.loading ?? 'lazy'}
      className={rest.className}
    />
  );
};

export default StageTypeImage;
