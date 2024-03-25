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
        type === 'warning' && 'bg-warning ',
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
        type === 'info' &&
          cn(
            'bg-info/10 [--link:var(--info)]',
            '![background-color:color-mix(in_oklab,hsl(var(--background))_90%,hsl(var(--info)))]',
          ),
        type === 'warning' &&
          cn(
            'bg-warning/10 [--link:var(--warning)]',
            '![background-color:color-mix(in_oklab,hsl(var(--background))_80%,hsl(var(--warning)))]',
          ),
      )}
    >
      {children}
    </PopoutBox>
  );
};

export default TipBox;
