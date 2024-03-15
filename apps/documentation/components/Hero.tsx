import { Heading, Paragraph, buttonVariants } from '@codaco/ui';
import { HeroBackground } from '~/components/HeroBackground';
import { useTranslations } from 'next-intl';
import { Link } from '~/navigation';
import DocSearchComponent from './DocSearchComponent';
import { BackgroundBlobs } from '@codaco/art';

export function Hero() {
  const t = useTranslations();

  return (
    <div className="h-screen overflow-hidden bg-primary text-primary-foreground">
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="mx-auto grid grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:max-w-6xl lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative md:text-center lg:text-left">
            <div className="relative">
              <Heading variant="h1">{t('Hero.title')}</Heading>
              <Paragraph variant="lead" className="font-normal">
                {t('Hero.tagline')}
              </Paragraph>
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
              <div className="hidden pt-8 lg:block">
                <DocSearchComponent className="lg:w-3/4" />
              </div>
            </div>
          </div>
          <div className="relative lg:static xl:pl-10">
            <div className="absolute inset-x-[-50vw] -bottom-48 -top-10 [mask-image:linear-gradient(transparent,white,white)] dark:[mask-image:linear-gradient(transparent,white,transparent)] lg:-bottom-32 lg:-top-32 lg:left-[calc(50%+14rem)] lg:right-0 lg:[mask-image:none] lg:dark:[mask-image:linear-gradient(white,white,transparent)]">
              <HeroBackground className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-0 lg:translate-x-0 lg:translate-y-[-60%]" />
            </div>
            <div className="relative">
              <div className="from-sky-300 via-sky-300/70 to-blue-300 absolute inset-0 rounded-2xl bg-gradient-to-tr opacity-10 blur-lg" />
              <div className="from-sky-300 via-sky-300/70 to-blue-300 absolute inset-0 rounded-2xl bg-gradient-to-tr opacity-10" />
              <div className="relative  rounded-2xl bg-[#0A101F]/80 ring-1 ring-white/10 backdrop-blur">
                <div className="from-sky-300/0 via-sky-300/70 to-sky-300/0 absolute -top-px left-20 right-11 h-px bg-gradient-to-r" />
                <div className="from-blue-400/0 via-blue-400 to-blue-400/0 absolute -bottom-px left-11 right-20 h-px bg-gradient-to-r" />
              </div>
            </div>
            <BackgroundBlobs large={0} medium={3} small={4} />
          </div>
        </div>
      </div>
    </div>
  );
}
