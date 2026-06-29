import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

/**
 * Renders the generated screenshot for a stage `type` as a responsive
 * `<picture>`, used as the `renderStagePreview` thumbnail in the interview's
 * stages menu. Stage types without a generated screenshot render nothing (the
 * menu falls back to its placeholder icon).
 */
export default function StagePreviewImage({ type }: { type: string }) {
  if (!isInterfaceType(type)) {
    return null;
  }
  return (
    <InterfacePicture
      type={type}
      ratio="16:9"
      sizes="8rem"
      alt=""
      className="size-full object-cover"
    />
  );
}
