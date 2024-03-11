import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { type ReactNode } from 'react';
import PopoutBox from '~/components/PopoutBox';
import { cn } from '~/lib/utils';

export type TipBoxProps = {
  children: ReactNode;
  danger: boolean;
};

const TipBox = ({ children, danger = false }: TipBoxProps) => {
  const t = useTranslations('TipBox');
  const type = danger ? 'warning' : 'info';
  const title = t(type);

  return (
    <PopoutBox
      title={title}
      iconClassName={cn(
        type === 'info' && 'bg-info',
        type === 'warning' && 'bg-warning',
      )}
      icon={
        <Image
          src={
            type === 'info' ? '/images/tip-info.svg' : '/images/tip-caution.svg'
          }
          alt={title}
          width={32}
          height={32}
        />
      }
      className={cn(
        type === 'info' && 'bg-info/10 [--link:var(--info)]',
        type === 'warning' && 'bg-warning/10 [--link:var(--warning)]',
      )}
    >
      {children}
    </PopoutBox>
  );
};

export default TipBox;
