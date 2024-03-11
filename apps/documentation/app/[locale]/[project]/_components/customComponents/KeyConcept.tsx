import Image from 'next/image';
import { type ReactNode } from 'react';
import PopoutBox from '~/components/PopoutBox';

type KeyConceptProps = {
  title: string;
  children: ReactNode;
};

const KeyConcept = ({ children, title }: KeyConceptProps) => {
  return (
    <PopoutBox
      title={title}
      className="bg-accent/10 [--link:var(--accent)]"
      icon={
        <Image
          src="/images/key-concept.svg"
          width={32}
          height={32}
          alt={title}
        />
      }
    >
      {children}
    </PopoutBox>
  );
};

export default KeyConcept;
