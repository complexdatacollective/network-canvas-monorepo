import type { StageSection } from '../../editors/defineStageEditor.tsx';
import PageContentSection from './PageContentSection.tsx';

/** A page the participant reads, written as one text (`PageContentSection`). */
export const pageContent = (): StageSection => () => <PageContentSection />;
