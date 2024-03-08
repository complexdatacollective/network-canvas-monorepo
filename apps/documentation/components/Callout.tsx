import { Heading } from '@acme/ui';
import { FileWarning, Lightbulb } from 'lucide-react';
import { cn } from '~/lib/utils';

const styles = {
  info: {
    container: 'bg-info [--link:var(--info-foreground)]',
    title: 'text-info-foreground',
    body: 'text-info-foreground',
  },
  warning: {
    container: 'bg-warning [--link:var(--info-foreground)]',
    title: 'text-warning-foreground',
    body: 'text-warning-foreground',
  },
};

const icons = {
  info: (props) => <Lightbulb {...props} />,
  warning: (props) => <FileWarning {...props} />,
};

export function Callout({
  title,
  children,
  type = 'info',
}: {
  title: string;
  children: React.ReactNode;
  type?: keyof typeof styles;
}) {
  const IconComponent = icons[type];

  return (
    <div className={cn('my-8 flex rounded-3xl p-6', styles[type].container)}>
      <IconComponent className="h-8 w-8 flex-none" />
      <div className="ml-4 flex-auto">
        <Heading variant="h4-all-caps">{title}</Heading>
        <div className={cn(styles[type].body)}>{children}</div>
      </div>
    </div>
  );
}
