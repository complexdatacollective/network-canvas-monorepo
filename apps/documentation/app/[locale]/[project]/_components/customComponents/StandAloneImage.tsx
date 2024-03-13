import { cn } from '~/lib/utils';

export type StandAloneImgProps = {
  src: string;
  caption?: string;
  noGap?: boolean;
};

const StandAloneImage = ({ src, caption, noGap }: StandAloneImgProps) => {
  return (
    <figure
      className={cn(
        'my-5 flex w-full flex-col items-center justify-center',
        noGap ?? !caption ? 'gap-0' : 'gap-4',
      )}
    >
      <img src={src} alt={caption ?? src} className="w-full px-4" />
      {caption && (
        <figcaption
          className={cn(
            'text-center text-sm italic',
            noGap && 'relative -top-2',
          )}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

export default StandAloneImage;
