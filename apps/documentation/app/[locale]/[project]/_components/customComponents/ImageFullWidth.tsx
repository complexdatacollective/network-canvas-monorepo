import Image from 'next/image';

type ImageFullWidthProps = {
  src: string;
  name?: string;
};

const ImageFullWidth = ({ src, name }: ImageFullWidthProps) => {
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

export default ImageFullWidth;
