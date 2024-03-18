import { type ReactNode } from 'react';
import { projects } from '~/app/types';

export function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;

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
