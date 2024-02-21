import Image from 'next/image';

type ImageFullWithProps = {
  src: string;
  name?: string;
};

const ImageFullWith = ({ src, name }: ImageFullWithProps) => {
  return (
    <Image
      width={450}
      height={450}
      src={src}
      alt={name ?? src}
      style={{ marginBlock: '10px' }}
      className="h-full w-full object-cover"
    />
  );
};

export default ImageFullWith;
