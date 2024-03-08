'use client';

import {
  Heading,
  Paragraph,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '@acme/ui';
import { useRouter } from '~/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { type LocalesEnum, type ProjectsEnum, projects } from '~/app/types';
import Image from 'next/image';
import { forwardRef } from 'react';
import { cn } from '~/lib/utils';

const getImageForProject = (project: ProjectsEnum) => {
  if (project === 'desktop') {
    return (
      <Image src="/images/desktop.png" width={65} height={40} alt={project} />
    );
  }

  if (project === 'fresco') {
    return (
      <Image src="/images/fresco.png" width={40} height={40} alt={project} />
    );
  }
};

const ProjectValue = forwardRef<
  HTMLDivElement,
  {
    project: ProjectsEnum;
    showDescription?: boolean;
  }
>(({ project, showDescription }, ref) => {
  const t = useTranslations('ProjectSwitcher');
  return (
    <div className="flex flex-1 items-center" ref={ref}>
      <div
        className={cn(
          'mr-2 flex items-center justify-start',
          showDescription && 'min-w-[75px]',
        )}
      >
        {getImageForProject(project)}
      </div>
      <div className="flex flex-col">
        <Heading variant="h4" margin={showDescription ? 'default' : 'none'}>
          {t(`${project}.label`)}
        </Heading>
        {showDescription && (
          <Paragraph variant="smallText">
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
  const project = pathname.split('/')[2]! as ProjectsEnum;
  const locale = useLocale() as LocalesEnum;

  return (
    <Select
      value={project}
      onValueChange={(val) => {
        router.push(`/${val}`, { locale });
      }}
    >
      <SelectTrigger className="my-4 h-16 sm:w-full md:w-[90%] lg:w-full">
        <ProjectValue project={project} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {projects.map((p) => (
            <SelectItem key={p} value={p} className="w-[20rem] sm:w-[30rem]">
              <ProjectValue project={p} showDescription />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
