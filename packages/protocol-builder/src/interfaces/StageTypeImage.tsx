import InterfacePicture, {
  type InterfacePictureProps,
} from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';

/**
 * Placeholder for stage types that have no generated screenshot in
 * `@codaco/interface-images` — a type not yet implemented in the interview
 * package, or one an imported `.netcanvas` names that this build has never
 * heard of. Dimensions must match the file.
 *
 * Exported so a host can warm the browser cache for it alongside the
 * generated screenshots.
 */
export const defaultStageImage = {
  // `new URL(…, import.meta.url)` rather than a bundler-specific asset import:
  // this module is consumed as source by hosts with different pipelines, and
  // it is the form `@codaco/interface-images`' own manifest already uses.
  src: new URL('./assets/stage--Default.webp', import.meta.url).href,
  width: 448,
  height: 307,
};

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
