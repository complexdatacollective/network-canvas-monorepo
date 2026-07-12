import { createContext } from 'react';

/**
 * When true, suppresses the post-quick-start "Building the rest of your
 * pedigree" hint dialog. Storybook scenario stories set this so the finished
 * pedigree is shown without the tutorial overlay; it defaults to false, so the
 * hint shows normally for participants and in every other context.
 */
export const SuppressPedigreeHintContext = createContext(false);
