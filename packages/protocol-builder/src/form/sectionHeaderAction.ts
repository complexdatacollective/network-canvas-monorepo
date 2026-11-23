import { createContext, type ReactNode } from 'react';

import type { SectionKey } from '../sections/sectionKeys.ts';

/**
 * Renders a control a host shows beside the title of each section of the
 * stage editor, such as a link into its own help for that section. Called
 * inside the stage edit, so what it renders can read the stage it belongs to.
 *
 * Given the section's key as well as its title: the title is translated and
 * its wording changes, so a host that must decide WHICH section this is
 * decides by the key.
 */
export const SectionHeaderActionContext = createContext<
  ((section: Readonly<{ key: SectionKey; title: string }>) => ReactNode) | null
>(null);
