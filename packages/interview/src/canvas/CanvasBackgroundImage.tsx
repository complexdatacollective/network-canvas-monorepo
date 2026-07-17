type CanvasBackgroundImageProps = {
  src: string;
};

export default function CanvasBackgroundImage({
  src,
}: CanvasBackgroundImageProps) {
  return (
    <img
      src={src}
      className="size-full object-cover object-center portrait:object-contain"
      alt="Background"
    />
  );
}
