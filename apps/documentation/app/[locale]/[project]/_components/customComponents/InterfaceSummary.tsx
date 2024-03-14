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
    <div className="flex h-96">
      <Image
        width={500}
        height={500}
        src={image}
        alt={title}
        style={{ marginBlock: '15px' }}
      />
      <div className="flex flex-col content-center justify-center space-y-6 pl-6">
        <Paragraph>
          <strong className="uppercase">Type:</strong> {type}
        </Paragraph>
        <Paragraph>
          <strong className="uppercase">Creates:</strong> {creates}
        </Paragraph>
        <Paragraph>
          <strong className="uppercase">Uses Prompts:</strong> {usesprompts}
        </Paragraph>
      </div>
    </div>
  );
};
