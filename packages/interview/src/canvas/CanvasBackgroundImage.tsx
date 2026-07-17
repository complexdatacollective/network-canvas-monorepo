type CanvasBackgroundImageProps = {
  src: string;
};

export default function CanvasBackgroundImage({
  src,
}: CanvasBackgroundImageProps) {
  return (
    <img
      src={src}
      className="pointer-events-none absolute inset-0 size-full object-contain object-center"
      alt="Background"
    />
  );
}
