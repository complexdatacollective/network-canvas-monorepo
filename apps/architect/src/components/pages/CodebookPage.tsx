import { useCallback, useState } from 'react';
import { useSearchParams } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { focusRouteTarget } from '@codaco/fresco-ui/navigation/RouteFocus';
import Codebook from '~/components/Codebook/Codebook';
import { readCodebookLink } from '~/components/Codebook/codebookLinks';
import EntityTypeDialog from '~/components/Codebook/EntityTypeDialog';
import UnusedVariablesAlert from '~/components/Codebook/UnusedVariablesAlert';
import VariableLabelDialog from '~/components/Codebook/VariableLabelDialog';
import PageHeading from '~/components/ProjectNav/PageHeading';
import { pageInsetClasses } from '~/components/ProjectNav/pageInset';
import { useAppSelector } from '~/ducks/hooks';
import { getCodebook } from '~/selectors/protocol';
const messages = defineMessages({
  codebook: {
    id: 'architect.pages.codebookPage.codebook',
    defaultMessage: 'Codebook',
    description: 'The title text in components / pages / CodebookPage.',
  },
  overviewOfTheEgoNodeAnd: {
    id: 'architect.pages.codebookPage.overviewOfTheEgoNodeAnd',
    defaultMessage:
      'Overview of the ego, node and edge types, their attributes, and network assets defined in your protocol. Create, edit, and delete types and attributes here. Unused entities can be deleted.',
    description: 'The description text in components / pages / CodebookPage.',
  },
});

type DialogState = {
  entity?: string;
  type?: string;
};

// A dialog opened by a link has no trigger on this page to return focus to.
const returnFocusToHeading = () => focusRouteTarget() ?? true;

const CodebookPage = () => {
  const intl = useAppIntl();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const link = readCodebookLink(searchParams);
  // A link to a type that no longer exists opens nothing: the dialog would
  // otherwise write a new type under the stale id.
  const linkedTypeExists = useAppSelector(
    (state) =>
      link?.kind === 'type' &&
      getCodebook(state)?.[link.entity]?.[link.type] !== undefined,
  );
  const linkedType =
    link?.kind === 'type' && linkedTypeExists ? link : undefined;
  const linkedVariable = link?.kind === 'variable' ? link.variable : undefined;

  const handleOpenEntityDialog = useCallback(
    (entity: string, type?: string) => {
      setDialogState({ entity, type });
      setDialogOpen(true);
    },
    [],
  );

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogState({});
  }, []);

  const handleCloseLink = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return (
    <>
      <div className={pageInsetClasses}>
        <PageHeading
          title={intl.formatMessage(messages.codebook)}
          description={intl.formatMessage(messages.overviewOfTheEgoNodeAnd)}
        />
        <div className="mx-auto mt-6 w-full max-w-6xl">
          <UnusedVariablesAlert />
          <Codebook onEditEntity={handleOpenEntityDialog} />
        </div>
      </div>
      <EntityTypeDialog
        show={linkedType !== undefined || dialogOpen}
        entity={linkedType?.entity ?? dialogState.entity}
        type={linkedType?.type ?? dialogState.type}
        onClose={linkedType ? handleCloseLink : handleCloseDialog}
        finalFocus={linkedType ? returnFocusToHeading : undefined}
      />
      <VariableLabelDialog
        variable={linkedVariable}
        onClose={handleCloseLink}
        finalFocus={returnFocusToHeading}
      />
    </>
  );
};

export default CodebookPage;
