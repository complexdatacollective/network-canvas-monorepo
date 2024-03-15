import { Heading, Paragraph, buttonVariants } from '@codaco/ui';
import { useTranslations } from 'next-intl';
import { Link } from '~/navigation';
import DocSearchComponent from './DocSearchComponent';
import { BackgroundBlobs } from '@codaco/art';

export function Hero() {
  const t = useTranslations();

  return (
    <div className="h-full overflow-hidden">
      <div className="absolute inset-0 z-[-1] bg-gradient-to-br opacity-30">
        <BackgroundBlobs large={2} medium={3} small={8} speedFactor={3} />
      </div>
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="mx-auto grid grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:max-w-6xl lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative md:text-center lg:text-left">
            <div className="relative">
              <Heading variant="h1">{t('Hero.title')}</Heading>
              <Paragraph variant="lead" className="font-normal">
                {t('Hero.tagline')}
              </Paragraph>
              <div className="hidden pt-8 lg:block">
                <DocSearchComponent className="lg:w-3/4" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-8 flex gap-4 md:justify-center lg:justify-start">
          <Link
            href="/desktop"
            className={buttonVariants({ variant: 'accent' })}
          >
            {t('ProjectSwitcher.desktop.label')}
          </Link>
          <Link
            href="/fresco"
            className={buttonVariants({ variant: 'secondary' })}
          >
            {t('ProjectSwitcher.fresco.label')}
          </Link>
        </div>
      </div>
    </div>
  );
}
