'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Link } from '@/navigation';
import { useEffect, useState, type ReactNode } from 'react';

type MenuProps = {
  title: string;
  titleURL: string | null;
  itemValue: string;
  activeMenu: string | undefined;
  highlighted: boolean;
  children: ReactNode;
};

export default function Menu({
  title,
  titleURL,
  children,
  itemValue,
  activeMenu,
  highlighted,
}: MenuProps) {
  const [value, setValue] = useState<string>();

  useEffect(() => {
    setValue(activeMenu);
  }, [activeMenu]);

  return (
    <Accordion
      value={value}
      type="single"
      collapsible
      className="w-full"
      onValueChange={setValue}
    >
      <AccordionItem value={itemValue}>
        <AccordionTrigger className="text-xs">
          {titleURL ? (
            <Link
              className={`${highlighted && 'text-blue-600'} transition-colors`}
              href={titleURL}
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
