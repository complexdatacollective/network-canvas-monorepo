'use client';

import { usePathname } from 'next/navigation';

export function DocsHeader({ title }: { title?: string }) {
  let pathname = usePathname();
  // let section = navigation.find((section) =>
  //   section.links.find((link) => link.href === pathname),
  // );

  const section = { title: 'Section Name' };

  if (!title && !section) {
    return null;
  }

  return (
    <header className="mb-9 space-y-1">
      {section && (
        <p className="font-display text-sky-500 text-sm font-medium">
          {section.title}
        </p>
      )}
      {title && (
        <h1 className="font-display text-slate-900 text-3xl tracking-tight dark:text-white">
          {title}
        </h1>
      )}
    </header>
  );
}
