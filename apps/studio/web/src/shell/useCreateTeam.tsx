import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Redacted } from 'effect';
import { useCallback } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { RateLimited } from '@codaco/studio-contract/schema/errors';
import { TeamCommandError } from '@codaco/studio-contract/schema/team';

import { authClient } from '../lib/auth.ts';
import { rpcCall, rpcKey } from '../runtime/rpc.ts';

const messages = defineMessages({
  title: {
    id: 'studio.createTeam.title',
    defaultMessage: 'Create a team',
    description: 'Heading of the dialog that creates a new team.',
  },
  description: {
    id: 'studio.createTeam.description',
    defaultMessage:
      'You will be the team’s owner, and can invite others once it exists.',
    description: 'Explains what creating a team does, under its heading.',
  },
  nameLabel: {
    id: 'studio.createTeam.nameLabel',
    defaultMessage: 'Team name',
    description: 'Label of the field that names the new team.',
  },
  nameHint: {
    id: 'studio.createTeam.nameHint',
    defaultMessage: 'Usually your lab, group or project.',
    description: 'Hint under the field that names the new team.',
  },
  submit: {
    id: 'studio.createTeam.submit',
    defaultMessage: 'Create team',
    description: 'Button that creates the team named in the dialog.',
  },
  nameBlank: {
    id: 'studio.createTeam.nameBlank',
    defaultMessage: 'Enter a name that is not only spaces.',
    description: 'Shown when the team name contains only whitespace.',
  },
  forbidden: {
    id: 'studio.createTeam.forbidden',
    defaultMessage:
      'Only the owner of this Studio instance can create teams. Ask them to create one and invite you.',
    description:
      'Shown when the server refuses to let this researcher create a team.',
  },
  rateLimited: {
    id: 'studio.createTeam.rateLimited',
    defaultMessage:
      'You have created several teams recently. Wait a while, then try again.',
    description:
      'Shown when the researcher has created too many teams in a short time.',
  },
  unconfirmed: {
    id: 'studio.createTeam.unconfirmed',
    defaultMessage:
      'Studio could not confirm that the team was created. Check the team list before trying again.',
    description:
      'Shown when creating a team failed in a way that leaves its outcome unknown.',
  },
});

export function useCreateTeam(): () => Promise<void> {
  const intl = useAppIntl();
  const { openDialog } = useDialog();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const teams = authClient.useListOrganizations();

  return useCallback(async () => {
    let createdTeamId: string | undefined;

    const refreshTeams = () =>
      Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: rpcKey('me') }),
        teams.refetch(),
      ]);

    const result = await openDialog({
      type: 'form',
      title: intl.formatMessage(messages.title),
      description: intl.formatMessage(messages.description),
      submitLabel: intl.formatMessage(messages.submit),
      children: (
        <Field
          name="name"
          label={intl.formatMessage(messages.nameLabel)}
          hint={intl.formatMessage(messages.nameHint)}
          component={InputField}
          required
          maxLength={120}
        />
      ),
      onSubmit: async (values) => {
        const name = typeof values.name === 'string' ? values.name.trim() : '';
        if (name === '') {
          return {
            success: false,
            formErrors: [intl.formatMessage(messages.nameBlank)],
          };
        }
        try {
          const created = await rpcCall('team.create', {
            name: Redacted.make(name),
          });
          createdTeamId = created.teamId;
          return { success: true };
        } catch (error) {
          if (error instanceof TeamCommandError && error.code === 'FORBIDDEN') {
            return {
              success: false,
              formErrors: [intl.formatMessage(messages.forbidden)],
            };
          }
          if (error instanceof RateLimited) {
            return {
              success: false,
              formErrors: [intl.formatMessage(messages.rateLimited)],
            };
          }
          await refreshTeams();
          return {
            success: false,
            formErrors: [intl.formatMessage(messages.unconfirmed)],
          };
        }
      },
    });

    if (result === null || createdTeamId === undefined) return;
    await refreshTeams();
    await navigate({
      to: '/team/$teamId',
      params: { teamId: createdTeamId },
    });
  }, [intl, navigate, openDialog, queryClient, teams]);
}
