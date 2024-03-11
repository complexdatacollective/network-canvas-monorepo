import { Heading } from '@codaco/ui';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { type ReactNode } from 'react';
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
    <aside
      className={cn(
        'relative mx-6 my-10  rounded-lg px-10 py-8',
        type === 'info' && 'bg-info/10 [--link:var(--info)]',
        type === 'warning' && 'bg-warning/10 [--link:var(--warning)]',
      )}
    >
      <div
        className={cn(
          type === 'info' && 'bg-info',
          type === 'warning' && 'bg-warning',
          'absolute -left-4 -top-4 flex h-12 w-12 items-center justify-center rounded-full',
        )}
      >
        <Image
          src={
            type === 'info' ? '/images/tip-info.svg' : '/images/tip-caution.svg'
          }
          alt={title}
          width={32}
          height={32}
        />
      </div>
      <div className="flex-auto">
        <Heading variant="h4">{title}</Heading>
        {children}
      </div>
    </aside>
  );
};

export default TipBox;
