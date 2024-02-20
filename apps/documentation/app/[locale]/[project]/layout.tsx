import { type ReactNode } from 'react';
import { getAllProjects } from '@/lib/docs';

export function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  const projects = getAllProjects();

  return projects.map((project) => {
    return {
      locale,
      project,
    };
  });
}

type Props = {
  children: ReactNode;
};

export default function Layout({ children }: Props) {
  return children;
}
