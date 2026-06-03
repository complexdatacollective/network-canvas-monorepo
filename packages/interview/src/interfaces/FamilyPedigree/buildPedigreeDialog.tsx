import type { AcknowledgeDialog } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import contextMenuHintUrl from './pedigree-context-menu-hint.png';

export const buildPedigreeDialog: AcknowledgeDialog = {
  type: 'acknowledge',
  title: 'Building the rest of your pedigree',
  children: (
    <div className="tablet-landscape:flex-row flex flex-col items-start gap-6">
      <div>
        <Paragraph intent="lead">
          You now need to add family members to build out your pedigree.
        </Paragraph>
        <Paragraph>
          Click on any person in the diagram to open a menu where you can add
          parents, children, partners, and siblings. Not all options are
          available for every person — the menu will show the actions relevant
          to that family member.
        </Paragraph>
        <Paragraph>
          Please try to be as thorough as possible. Use the checklist to keep
          track of your progress.
        </Paragraph>
        <Paragraph>
          When you are finished, click the next button to continue.
        </Paragraph>
      </div>
      <figure className="phone-landscape:flex hidden shrink-0 flex-col items-center gap-2">
        <img
          src={contextMenuHintUrl}
          alt="Example of the context menu showing options to add parent, child, partner, sibling, edit name, or delete"
          className="w-40 rounded-lg shadow-lg"
        />
        <figcaption className="text-muted text-xs">
          Click a person to see this menu
        </figcaption>
      </figure>
    </div>
  ),
  actions: {
    primary: { label: 'Got it', value: true },
  },
};
