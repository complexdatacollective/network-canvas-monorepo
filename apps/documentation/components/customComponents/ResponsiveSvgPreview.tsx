type ResponsiveSvgPreviewProps = {
  src: string;
  alt: string;
};

const previewSizes = [
  { label: 'Landscape', className: 'aspect-video' },
  { label: 'Portrait', className: 'aspect-[3/4]' },
] as const;

const ResponsiveSvgPreview = ({ src, alt }: ResponsiveSvgPreviewProps) => (
  <div className="tablet-portrait:grid-cols-2 my-10 grid items-start gap-6">
    {previewSizes.map(({ label, className }) => (
      <figure key={label} className="m-0 flex w-full flex-col">
        <div
          className={`bg-rich-black w-full overflow-hidden rounded ${className}`}
        >
          <img
            src={src}
            alt={`${alt} in ${label.toLowerCase()} orientation`}
            className="size-full"
          />
        </div>
        <figcaption className="mt-2 text-center text-sm italic">
          {label}
        </figcaption>
      </figure>
    ))}
  </div>
);

export type { ResponsiveSvgPreviewProps };
export default ResponsiveSvgPreview;
