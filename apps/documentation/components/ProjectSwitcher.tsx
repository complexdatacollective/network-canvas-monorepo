'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import React from 'react';
import { projects, type LocalesEnum, type ProjectsEnum } from '~/app/types';
import { useRouter } from '~/navigation';
import SelectProject from './SelectProject';
import z from 'zod';

export const OptionsSchema = z.object({
  value: z.string(),
  label: z.string(),
  description: z.string(),
  image: z.custom<React.ReactNode>((value) => React.isValidElement(value)),
});

const getImageForProject = (project: ProjectsEnum) => {
  if (project === 'desktop') {
    return (
      <img src="/images/desktop.png" alt={project} className="h-10 w-auto" />
    );
  }

  if (project === 'fresco') {
    return (
      <img src="/images/fresco.png" alt={project} className="h-10 w-auto" />
    );
  }
};

export default function ProjectSwitcher() {
  const t = useTranslations('ProjectSwitcher');
  const router = useRouter();
  const pathname = usePathname();
  const project = pathname.split('/')[2]! as ProjectsEnum;
  const locale = useLocale() as LocalesEnum;

  const defaultOption = {
    value: project,
    label: t(`${project}.label`),
    description: t(`${project}.description`),
    image: getImageForProject(project),
  };

  const options = projects.map((p) => ({
    value: p,
    label: t(`${p}.label`),
    description: t(`${p}.description`),
    image: getImageForProject(p),
  }));

  return (
    <SelectProject
      className="mt-4"
      value={defaultOption}
      onChange={(selectedOption) => {
        const parsedOption = OptionsSchema.safeParse(selectedOption);
        if (!parsedOption.success) return;
        router.push(`/${parsedOption.data.value}`, { locale });
      }}
      options={options}
    />
  );
}
