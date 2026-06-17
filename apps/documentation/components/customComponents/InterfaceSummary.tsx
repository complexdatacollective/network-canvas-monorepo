import type { ReactNode } from 'react';

import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';
import Paragraph from '~/components/ui/typography/Paragraph';

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

// "NameGeneratorRoster" -> "Name Generator Roster" for alt text.
const humanizeType = (type: string) => type.replace(/([a-z])([A-Z])/g, '$1 $2');

export const InterfaceSummary = ({
  type,
  children,
}: {
  /** Manifest key for the interface; renders its generated screenshot as the
   * hero image (square on narrow screens, 16:9 otherwise). */
  type: string;
  children: ReactNode;
}) => {
  if (!isInterfaceType(type)) {
    throw new Error(
      `<InterfaceSummary> received unknown interface type "${type}"`,
    );
  }
  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center">
      <div className="my-10 w-full px-8">
        <InterfacePicture
          type={type}
          ratio="16:9"
          artDirection={[{ media: '(max-width: 40rem)', ratio: '1:1' }]}
          sizes="(min-width: 40rem) 28rem, 100vw"
          alt={`${humanizeType(type)} interface`}
          className="w-full rounded"
        />
      </div>
      {children}
    </div>
  );
};

export const InterfaceMeta = ({
  type,
  creates,
  usesprompts,
}: {
  type: string;
  creates: string;
  usesprompts: string;
}) => {
  return (
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
  );
};
