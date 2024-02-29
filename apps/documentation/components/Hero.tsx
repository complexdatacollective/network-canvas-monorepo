import { Fragment } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Highlight } from 'prism-react-renderer';

import { Button, Heading, Paragraph } from '@acme/ui';

import { HeroBackground } from '~/components/HeroBackground';

const codeLanguage = 'javascript';
const code = `export default {
  strategy: 'predictive',
  engine: {
    cpus: 12,
    backups: ['./storage/cache.wtf'],
  },
}`;

const tabs = [
  { name: 'cache-advance.config.js', isActive: true },
  { name: 'package.json', isActive: false },
];

function TrafficLightsIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 42 10" fill="none" {...props}>
      <circle cx="5" cy="5" r="4.5" />
      <circle cx="21" cy="5" r="4.5" />
      <circle cx="37" cy="5" r="4.5" />
    </svg>
  );
}

export function Hero() {
  return (
    <div className="overflow-hidden bg-primary text-primary-foreground">
      <div className="py-16 sm:px-2 lg:relative lg:px-0 lg:py-20">
        <div className="lg:max-w-8xl mx-auto grid grid-cols-1 items-center gap-x-8 gap-y-16 px-4 lg:grid-cols-2 lg:px-8 xl:gap-x-16 xl:px-12">
          <div className="relative z-10 md:text-center lg:text-left">
            <div className="relative">
              <Heading variant="h1">Network Canvas Documentation</Heading>
              <Paragraph className="text-slate-400 mt-3 text-2xl tracking-tight">
                A home for tutorials, guides, and information about the Network
                Canvas project.
              </Paragraph>
              <div className="mt-8 flex gap-4 md:justify-center lg:justify-start">
                <Link href="/en/desktop">
                  <Button variant="accent">Desktop Software</Button>
                </Link>
                <Link href="/en/fresco">
                  <Button variant="secondary">Fresco</Button>
                </Link>
              </div>
            </div>
          </div>
          <div className="relative lg:static xl:pl-10">
            <div className="absolute inset-x-[-50vw] -bottom-48 -top-32 [mask-image:linear-gradient(transparent,white,white)] dark:[mask-image:linear-gradient(transparent,white,transparent)] lg:-bottom-32 lg:-top-32 lg:left-[calc(50%+14rem)] lg:right-0 lg:[mask-image:none] lg:dark:[mask-image:linear-gradient(white,white,transparent)]">
              <HeroBackground className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:left-0 lg:translate-x-0 lg:translate-y-[-60%]" />
            </div>
            <div className="relative">
              <div className="from-sky-300 via-sky-300/70 to-blue-300 absolute inset-0 rounded-2xl bg-gradient-to-tr opacity-10 blur-lg" />
              <div className="from-sky-300 via-sky-300/70 to-blue-300 absolute inset-0 rounded-2xl bg-gradient-to-tr opacity-10" />
              <div className="relative rounded-2xl bg-[#0A101F]/80 ring-1 ring-white/10 backdrop-blur">
                <div className="from-sky-300/0 via-sky-300/70 to-sky-300/0 absolute -top-px left-20 right-11 h-px bg-gradient-to-r" />
                <div className="from-blue-400/0 via-blue-400 to-blue-400/0 absolute -bottom-px left-11 right-20 h-px bg-gradient-to-r" />
                <div className="pl-4 pt-4">
                  <TrafficLightsIcon className="stroke-slate-500/30 h-2.5 w-auto" />
                  <div className="mt-4 flex space-x-2 text-xs">
                    {tabs.map((tab) => (
                      <div
                        key={tab.name}
                        className={clsx(
                          'flex h-6 rounded-full',
                          tab.isActive
                            ? 'from-sky-400/30 via-sky-400 to-sky-400/30 text-sky-300 bg-gradient-to-r p-px font-medium'
                            : 'text-slate-500',
                        )}
                      >
                        <div
                          className={clsx(
                            'flex items-center rounded-full px-2.5',
                            tab.isActive && 'bg-slate-800',
                          )}
                        >
                          {tab.name}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 flex items-start px-1 text-sm">
                    <div
                      aria-hidden="true"
                      className="border-slate-300/5 text-slate-600 select-none border-r pr-4 font-mono"
                    >
                      {Array.from({
                        length: code.split('\n').length,
                      }).map((_, index) => (
                        <Fragment key={index}>
                          {(index + 1).toString().padStart(2, '0')}
                          <br />
                        </Fragment>
                      ))}
                    </div>
                    <Highlight
                      code={code}
                      language={codeLanguage}
                      theme={{ plain: {}, styles: [] }}
                    >
                      {({
                        className,
                        style,
                        tokens,
                        getLineProps,
                        getTokenProps,
                      }) => (
                        <pre
                          className={clsx(
                            className,
                            'flex overflow-x-auto pb-6',
                          )}
                          style={style}
                        >
                          <code className="px-4">
                            {tokens.map((line, lineIndex) => (
                              <div key={lineIndex} {...getLineProps({ line })}>
                                {line.map((token, tokenIndex) => (
                                  <span
                                    key={tokenIndex}
                                    {...getTokenProps({ token })}
                                  />
                                ))}
                              </div>
                            ))}
                          </code>
                        </pre>
                      )}
                    </Highlight>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
