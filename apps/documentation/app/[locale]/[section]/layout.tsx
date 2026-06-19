import type { ReactNode } from 'react';

import { sections } from '~/app/types';

export function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;

  return sections.map((section) => {
    return {
      locale,
      section,
    };
  });
}

type Props = {
  children: ReactNode;
};

export default function Layout({ children }: Props) {
  return children;
}
