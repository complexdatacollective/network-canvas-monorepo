import { useTranslations } from 'next-intl';

type ResponsiveSvgPreviewProps = {
  src: string;
  alt: string;
};

const previewSizes = [
  { label: 'landscape', alt: 'landscapeAlt', className: 'aspect-video' },
  { label: 'portrait', alt: 'portraitAlt', className: 'aspect-[3/4]' },
] as const;

const ResponsiveSvgPreview = ({ src, alt }: ResponsiveSvgPreviewProps) => {
  const t = useTranslations('ResponsiveSvgPreview');
  return (
    <div className="tablet-portrait:grid-cols-2 my-10 grid items-start gap-6">
      {previewSizes.map(({ label, alt: altMessage, className }) => (
        <figure key={label} className="m-0 flex w-full flex-col">
          <div
            className={`bg-rich-black w-full overflow-hidden rounded ${className}`}
          >
            <img src={src} alt={t(altMessage, { alt })} className="size-full" />
          </div>
          <figcaption className="mt-2 text-center text-sm italic">
            {t(label)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
};

export type { ResponsiveSvgPreviewProps };
export default ResponsiveSvgPreview;
