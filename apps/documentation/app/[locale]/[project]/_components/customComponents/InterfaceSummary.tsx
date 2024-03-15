import { Paragraph } from '@codaco/ui';
import Image from 'next/image';

export const InterfaceSummary = ({
  title,
  image,
  type,
  creates,
  usesprompts,
}: {
  title: string;
  image: string;
  type: string;
  creates: string;
  usesprompts: string;
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center">
      <Image
        width={500}
        height={500}
        src={image}
        alt={title}
        className="my-3.5 h-full w-full object-cover sm:w-2/3"
      />
      <div className="flex flex-col content-center justify-center space-y-6 sm:pl-6">
        <Paragraph>
          <strong className="uppercase">Type:</strong> <br /> {type}
        </Paragraph>
        <Paragraph>
          <strong className="uppercase">Creates:</strong> <br /> {creates}
        </Paragraph>
        <Paragraph>
          <strong className="uppercase">Uses Prompts:</strong> <br />
          {usesprompts}
        </Paragraph>
      </div>
    </div>
  );
};
