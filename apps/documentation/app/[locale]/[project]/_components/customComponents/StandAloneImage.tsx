type StandAloneImgProps = {
  src: string;
  content: string;
  name?: string;
};

const StandAloneImage = ({ src, content, name }: StandAloneImgProps) => {
  return (
    <figure className="my-5 flex w-full flex-col items-center justify-center gap-2">
      <img src={src} alt={name ?? src} className="w-full px-4" />
      <figcaption className="text-center text-sm italic">{content}</figcaption>
    </figure>
  );
};

export default StandAloneImage;
