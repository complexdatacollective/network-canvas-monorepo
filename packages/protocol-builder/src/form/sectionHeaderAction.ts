import { createContext, type ReactNode } from 'react';

/**
 * Renders a control a host shows beside the title of each section of the
 * stage editor, such as a link into its own help for that section. Called
 * inside the stage edit, so what it renders can read the stage it belongs to.
 */
export const SectionHeaderActionContext = createContext<
  ((title: string) => ReactNode) | null
>(null);
