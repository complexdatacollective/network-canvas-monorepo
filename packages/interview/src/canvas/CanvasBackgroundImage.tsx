type CanvasBackgroundImageProps = {
  src: string;
};

export default function CanvasBackgroundImage({
  src,
}: CanvasBackgroundImageProps) {
  return (
    <img
      src={src}
      className="pointer-events-none size-full object-contain object-center"
      alt=""
      aria-hidden="true"
    />
  );
}
