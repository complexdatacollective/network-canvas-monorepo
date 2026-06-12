'use client';

import { ChartNetwork } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { forwardRef } from 'react';

import { type Locale, type Project, projects } from '~/app/types';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '~/components/ui/select';
import Heading from '~/components/ui/typography/Heading';
import Paragraph from '~/components/ui/typography/Paragraph';
import { cn } from '~/lib/utils';
import { useRouter } from '~/navigation';

const getImageForProject = (project: Project) => {
  if (project === 'get-started') {
    return (
      <Image
        src="/images/mark.svg"
        alt=""
        className="h-10 w-10"
        width={40}
        height={40}
      />
    );
  }

  if (project === 'design-protocols') {
    return (
      <Image
        src="/images/architect-icon.png"
        alt=""
        className="h-10 w-10"
        width={40}
        height={40}
      />
    );
  }

  if (project === 'collect-data') {
    return (
      <div className="flex items-center gap-1">
        <Image
          src="/images/interviewer.png"
          alt=""
          className="h-8 w-8"
          width={32}
          height={32}
        />
        <Image
          src="/images/fresco.png"
          alt=""
          className="h-8 w-8"
          width={32}
          height={32}
        />
      </div>
    );
  }

  if (project === 'analyze-data') {
    return (
      <div className="bg-cerulean-blue flex h-10 w-10 items-center justify-center rounded-xl text-white">
        <ChartNetwork className="h-6 w-6" />
      </div>
    );
  }
};

const ProjectValue = forwardRef<
  HTMLDivElement,
  {
    project: Project;
    showDescription?: boolean;
  }
>(({ project, showDescription }, ref) => {
  const t = useTranslations('ProjectSwitcher');
  return (
    <div className="flex flex-1 items-center" ref={ref}>
      <div
        className={cn(
          'mr-2 flex items-center justify-start',
          showDescription && 'min-w-18.75',
        )}
      >
        {getImageForProject(project)}
      </div>
      <div className="flex flex-col">
        <Heading variant="h4" margin={showDescription ? 'default' : 'none'}>
          {t(`${project}.label`)}
        </Heading>
        {showDescription && (
          <Paragraph
            className="max-w-80 max-[450px]:max-w-48 sm:max-w-full"
            variant="smallText"
          >
            {t(`${project}.description`)}
          </Paragraph>
        )}
      </div>
    </div>
  );
});

ProjectValue.displayName = 'ProjectValue';

export default function ProjectSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  // biome-ignore lint/style/noNonNullAssertion: path structure is known
  const project = pathname.split('/')[2]! as Project;
  const locale = useLocale() as Locale;

  return (
    <Select
      value={project}
      onValueChange={(val) => {
        router.push(`/${val}`, { locale });
      }}
    >
      <SelectTrigger className="my-4 h-16">
        <ProjectValue project={project} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {projects.map((p) => (
            <SelectItem key={p} value={p} className="sm:w-100">
              <ProjectValue project={p} showDescription />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
