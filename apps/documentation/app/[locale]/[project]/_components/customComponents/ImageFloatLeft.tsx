import Image from 'next/image';

type ImageFloatLeftProps = {
  src: string;
  name?: string;
};

const ImageFloatLeft = ({ src, name }: ImageFloatLeftProps) => {
  return (
    <>
      <Image
        width={300}
        height={300}
        src={src}
        alt={name ?? src}
        style={{ marginBlock: '10px' }}
        className="float-left mx-5 w-[18%] object-cover"
      />
    </>
  );
};

export default ImageFloatLeft;
