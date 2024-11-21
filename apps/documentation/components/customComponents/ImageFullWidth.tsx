import Image from "next/image";

type ImageFullWidthProps = {
	src: string;
	alt: string;
};

const ImageFullWidth = ({ src, alt }: ImageFullWidthProps) => {
	return <Image width={450} height={450} src={src} alt={alt ?? src} className="my-2.5 h-full w-full object-cover" />;
};

export default ImageFullWidth;
