import type { Metadata } from 'next';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';
import { Footer } from '~/components/layout/Footer';
import { Header } from '~/components/layout/Header';
import { Container } from '~/components/ui/Container';
import { cn } from '~/lib/cn';
import { externalLinks } from '~/lib/content';

export const metadata: Metadata = {
  title: 'Download',
  description: 'Download links for the current Network Canvas software.',
};

type Os = 'windows' | 'macos' | 'linux';

const osMeta: Record<Os, { label: string; icon: string }> = {
  windows: { label: 'Windows', icon: '/images/icons/windows.svg' },
  macos: { label: 'macOS', icon: '/images/icons/apple.svg' },
  linux: { label: 'Linux', icon: '/images/icons/linux.svg' },
};

type DownloadCard = {
  name: string;
  description: string;
  icon: string;
  pill: string;
  links: Record<Os, string>;
  googlePlay?: string;
};

const apps: DownloadCard[] = [
  {
    name: 'Interviewer',
    description: 'A tool for administering interviews in the field',
    icon: '/images/icons/interviewer.svg',
    pill: 'bg-neon-coral',
    links: {
      windows:
        'https://github.com/complexdatacollective/Interviewer/releases/download/v6.5.4/Network.Canvas.Interviewer.Setup.6.5.4.exe',
      macos:
        'https://github.com/complexdatacollective/Interviewer/releases/download/v6.5.4/Network.Canvas.Interviewer-6.5.4.dmg',
      linux:
        'https://github.com/complexdatacollective/Interviewer/releases/tag/v6.5.4',
    },
    googlePlay:
      'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
  },
  {
    name: 'Architect',
    description: 'A tool for building Network Canvas interview protocols',
    icon: '/images/icons/architect.svg',
    pill: 'bg-sea-green',
    links: {
      windows:
        'https://github.com/complexdatacollective/Architect/releases/download/v6.5.4/Network.Canvas.Architect.Setup.6.5.4.exe',
      macos:
        'https://github.com/complexdatacollective/Architect/releases/download/v6.5.4/Network.Canvas.Architect-6.5.4.dmg',
      linux:
        'https://github.com/complexdatacollective/Architect/releases/tag/v6.5.4',
    },
  },
];

const serverLinks: Record<Os, string> = {
  windows:
    'https://github.com/complexdatacollective/Server/releases/download/v6.1.1/Network-Canvas-Server-Setup-6.1.1.exe',
  macos:
    'https://github.com/complexdatacollective/Server/releases/download/v6.1.1/Network-Canvas-Server-6.1.1.dmg',
  linux: 'https://github.com/complexdatacollective/Server/releases/tag/v6.1.1',
};

function OsButton({ os, href, pill }: { os: Os; href: string; pill: string }) {
  const meta = osMeta[os];
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'focusable font-heading elevation-low flex items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm font-bold tracking-wide text-white uppercase transition-transform hover:-translate-y-0.5',
        pill,
      )}
    >
      <img src={meta.icon} alt="" aria-hidden className="size-4" />
      {meta.label}
    </a>
  );
}

export default function DownloadPage() {
  return (
    <main>
      <Header />

      <Container className="tablet-landscape:py-16 py-12 text-center">
        <h1 className="font-heading text-cyber-grape tablet-landscape:text-[3rem] text-3xl font-bold">
          Download Network Canvas
        </h1>
        <p className="text-text/80 tablet-landscape:text-lg mt-4 text-base">
          Please find download links for our current software below.
        </p>
      </Container>

      <Container className="tablet-landscape:grid-cols-2 grid gap-8 pb-16">
        {apps.map((app) => (
          <div
            key={app.name}
            className="bg-surface flex flex-col items-center rounded-[1.75rem] p-10 text-center shadow-lg"
          >
            <img src={app.icon} alt="" aria-hidden className="size-24" />
            <h2 className="font-heading text-cyber-grape mt-5 text-2xl font-bold">
              {app.name}
            </h2>
            <p className="text-text/70 mt-2 text-base">{app.description}</p>
            <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
              <OsButton os="windows" href={app.links.windows} pill={app.pill} />
              <OsButton os="macos" href={app.links.macos} pill={app.pill} />
              <OsButton os="linux" href={app.links.linux} pill={app.pill} />
              {app.googlePlay ? (
                <a
                  href={app.googlePlay}
                  target="_blank"
                  rel="noreferrer"
                  className="focusable mt-1 flex justify-center"
                  aria-label="Get it on Google Play"
                >
                  <img
                    src="/images/icons/google-play.png"
                    alt="Get it on Google Play"
                    className="h-12 w-auto"
                  />
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </Container>

      <Container className="tablet-landscape:py-16 py-12 text-center">
        <h2 className="font-heading text-cyber-grape tablet-landscape:text-4xl text-3xl font-bold">
          Server
        </h2>
        <div className="text-text/80 mx-auto mt-6 max-w-2xl space-y-4 text-base leading-relaxed">
          <p>
            You may be familiar with a third app, Server. We learned throughout
            the course of the project that the features provided by Server were
            better accomplished using Interviewer. We therefore reimplemented
            functionality such as data export and case management within the
            Interviewer app.
          </p>
          <p>
            As a result, we no longer recommend that new projects use Server. If
            you still need Server for an existing project, you can download it
            using the links below.
          </p>
        </div>
        <div className="phone-landscape:flex-row phone-landscape:justify-center mx-auto mt-8 flex max-w-xl flex-col gap-3">
          <OsButton os="windows" href={serverLinks.windows} pill="bg-mustard" />
          <OsButton os="macos" href={serverLinks.macos} pill="bg-mustard" />
          <OsButton os="linux" href={serverLinks.linux} pill="bg-mustard" />
        </div>
      </Container>

      <Container className="tablet-landscape:py-16 py-12">
        <h2 className="font-heading text-cyber-grape tablet-landscape:text-4xl text-center text-3xl font-bold">
          More information
        </h2>
        <div className="bg-surface mx-auto mt-8 max-w-3xl rounded-[1.75rem] p-8 shadow-lg">
          <Accordion>
            <AccordionItem value="requirements">
              <AccordionHeader>
                <AccordionTrigger>System Requirements</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <p className="text-text/80 text-base leading-relaxed">
                  Architect and Interviewer are desktop applications that run on
                  recent versions of Windows, macOS, and Linux. Interviewer is
                  also available for tablets. For detailed, up-to-date system
                  requirements, please see the{' '}
                  <a
                    href={externalLinks.documentation}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link font-bold hover:underline"
                  >
                    documentation
                  </a>
                  .
                </p>
              </AccordionPanel>
            </AccordionItem>
            <AccordionItem value="app-store">
              <AccordionHeader>
                <AccordionTrigger>Apple App Store</AccordionTrigger>
              </AccordionHeader>
              <AccordionPanel>
                <p className="text-text/80 text-base leading-relaxed">
                  An iPad version of Interviewer is distributed through the
                  Apple App Store. Please see the{' '}
                  <a
                    href={externalLinks.documentation}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link font-bold hover:underline"
                  >
                    documentation
                  </a>{' '}
                  for installation details.
                </p>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </div>
      </Container>

      <Footer />
    </main>
  );
}
