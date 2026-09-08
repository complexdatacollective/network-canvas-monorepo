import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StudyParticipationMode, StudyState } from '@codaco/studio-rpc';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { createUuid } from '../lib/createUuid.ts';
import { STUDY_STATE_MESSAGES, studyCountMessages } from '../lib/studyState.ts';
import { canManageTeam, teamRole } from '../lib/teamRoles.ts';

/**
 * The team's studies, at `/team/$teamId` (§5.2, #1262).
 *
 * This is the half of the shipped team screen that §5.4 keeps here: the
 * list a researcher chooses their work from, and where a new study starts.
 * Membership and invitations moved to `/team/$teamId/members`, and the
 * screen's own "Active team" panel went with the header's team chip, which
 * says the same thing on every screen instead of only on this one.
 *
 * **These are studies now, not protocols.** `studies.list` reports what the
 * caller may see of the team's `studies` rows — every one for a team Admin or
 * Owner, and the studies they hold a study-role grant on for a team Member
 * (#1257) — so what the list omits is an answer about access rather than an
 * accident of which table was being read. `/study/$studyId` addresses the
 * study itself, and the protocol the editor opens is resolved from it.
 *
 * The team comes from the URL, never from the active-team setting: §2.2's
 * invariant is that the URL is authoritative and the setting follows it, which
 * is what the app shell's reconciler does (§6.6).
 */

/**
 * The identity a creation keeps across retries, and everything that has to
 * match for a submission to BE the same attempt.
 *
 * The team is part of that, not context around it. The header switches teams
 * without remounting this screen, so one instance sees both — and every one of
 * these identifiers is unique across the whole instance rather than within a
 * team. Keyed on the name alone, the same name submitted in another team
 * reuses the first team's ids, and if the ambiguous request had in fact
 * committed, the ids are taken: the second team's creation is refused outright
 * rather than duplicated.
 */
type StudyCreationAttempt = {
  teamId: string;
  name: string;
  studyId: string;
  protocolId: string;
  draftId: string;
};

const messages = defineMessages({
  heading: {
    id: 'studio.teamStudies.heading',
    defaultMessage: 'Studies',
    description: "Heading of a team's studies screen.",
  },
  intro: {
    id: 'studio.teamStudies.intro',
    defaultMessage: 'Every study this team owns, and where a new one starts.',
    description: "Introduction under the studies screen's heading.",
  },
  listHeading: {
    id: 'studio.teamStudies.listHeading',
    defaultMessage: 'This team\u2019s studies',
    description: 'Heading of the study list section.',
  },
  loadFailed: {
    id: 'studio.teamStudies.loadFailed',
    defaultMessage: 'Studies could not be loaded. Try again.',
    description: "Shown when the team's study list could not be fetched.",
  },
  empty: {
    id: 'studio.teamStudies.empty',
    defaultMessage: 'No studies have been created for this team.',
    description: 'Shown when the team has no studies at all.',
  },
  managedParticipants: {
    id: 'studio.teamStudies.managedParticipants',
    defaultMessage: 'Managed participants',
    description:
      'Participation mode of a study whose participants are individually known and invited.',
  },
  anonymousParticipants: {
    id: 'studio.teamStudies.anonymousParticipants',
    defaultMessage: 'Anonymous participants',
    description:
      'Participation mode of a study whose participants arrive through an anonymous link.',
  },
  created: {
    id: 'studio.teamStudies.created',
    defaultMessage: 'Created {date}',
    description:
      'When a study was created; {date} is a formatted calendar date.',
  },
  noProtocol: {
    id: 'studio.teamStudies.noProtocol',
    defaultMessage: 'No protocol to edit',
    description: 'Shown on a study card whose study has no protocol yet.',
  },
  openEditor: {
    id: 'studio.teamStudies.openEditor',
    defaultMessage: 'Open the protocol editor',
    description: "Link on a study card into the study's protocol editor.",
  },
  newStudyHeading: {
    id: 'studio.teamStudies.newStudyHeading',
    defaultMessage: 'New study',
    description: 'Heading of the study creation section.',
  },
  createFailed: {
    id: 'studio.teamStudies.createFailed',
    defaultMessage:
      'The study could not be created. Wait a moment and try again.',
    description: 'Form error when creating a study failed.',
  },
  nameLabel: {
    id: 'studio.teamStudies.nameLabel',
    defaultMessage: 'Study name',
    description: "Label of the creation form's study name field.",
  },
  create: {
    id: 'studio.teamStudies.create',
    defaultMessage: 'Create study',
    description: 'Submit button of the study creation form.',
  },
  onlyAdminsCreate: {
    id: 'studio.teamStudies.onlyAdminsCreate',
    defaultMessage: 'Only team owners and admins can create studies.',
    description:
      'Shown in place of the creation form to a member who may not create studies.',
  },
});

const PARTICIPATION_MODE_LABELS: Record<
  StudyParticipationMode,
  MessageDescriptor
> = {
  managed: messages.managedParticipants,
  anonymous: messages.anonymousParticipants,
};

/**
 * A Live study is the one whose state carries consequence — participants can
 * reach it — so it is the one the badge fills, and a Closed one is filled more
 * quietly because it is finished rather than wrong. Nothing here is
 * destructive: closing a study archives it (#1262, 2026-08-07), and colouring
 * an archive like a failure would be a claim about the work.
 */
function stateVariant(state: StudyState): 'default' | 'secondary' | 'outline' {
  if (state === 'live') return 'default';
  if (state === 'closed') return 'secondary';
  return 'outline';
}

export default function TeamStudies({ teamId }: { teamId: string }) {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // A creation whose response was lost keeps its identifiers, so retrying the
  // same name cannot leave two studies behind.
  const creationAttempt = useRef<StudyCreationAttempt | undefined>(undefined);
  const studies = useQuery(
    orpc.studies.list.queryOptions({ input: { teamId } }),
  );
  const activeMember = authClient.useActiveMember();
  // Creating a study is a team Admin or Owner action (#1257), so a Member is
  // told that rather than offered a form the procedure refuses. The role is
  // read against the team in the URL, never against whichever team the active
  // membership currently names — the two disagree for the whole of every team
  // switch, and `TeamArea` reads it the same way for the same reason.
  const canCreateStudies = canManageTeam(teamRole(activeMember.data, teamId));
  // No `onSuccess`. A mutation's callbacks are read from the options object
  // the LATEST render supplied — TanStack Query re-points a pending mutation
  // at it on every re-render — so a callback here would run against whichever
  // team the header had switched to by the time the response landed, not the
  // team the study was created in. The continuation belongs to the submit
  // handler below, whose closure is the one that started the request.
  const createStudy = useMutation(orpc.studies.create.mutationOptions());

  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.intro)}
        </Paragraph>
      </div>

      <Surface spacing="lg">
        <section aria-labelledby="studies-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading id="studies-heading" level="h2" margin="none">
              {intl.formatMessage(messages.listHeading)}
            </Heading>
            {studies.isPending && <Spinner size="sm" />}
          </div>
          {studies.isError && (
            <Alert className="mt-4" variant="destructive">
              {intl.formatMessage(messages.loadFailed)}
            </Alert>
          )}
          {studies.data?.length === 0 && (
            <Paragraph>{intl.formatMessage(messages.empty)}</Paragraph>
          )}
          {studies.data && studies.data.length > 0 && (
            <ul className="tablet-portrait:grid-cols-2 mt-4 grid list-none gap-3 p-0">
              {studies.data.map((study) => (
                <li
                  key={study.id}
                  className="bg-surface-1 text-surface-1-contrast elevation-low flex flex-col gap-1 rounded p-4"
                >
                  <Link
                    className="focusable font-heading rounded font-bold no-underline"
                    to="/study/$studyId"
                    params={{ studyId: study.id }}
                  >
                    {study.name}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={stateVariant(study.state)}>
                      {intl.formatMessage(STUDY_STATE_MESSAGES[study.state])}
                    </Badge>
                    <span className="text-sm">
                      {intl.formatMessage(
                        PARTICIPATION_MODE_LABELS[study.participationMode],
                      )}
                    </span>
                  </div>
                  <span className="text-sm">
                    {intl.formatMessage(messages.created, {
                      date: intl.formatDate(study.createdAt),
                    })}
                  </span>
                  {/*
                    Counts only where there are any: a Draft study has neither,
                    its badge already says so, and "0 waves" on every new study
                    is a row of noise between the researcher and the study they
                    came for.
                  */}
                  {(study.waveCount > 0 || study.participantCount > 0) && (
                    <div className="flex flex-wrap gap-x-4 text-sm">
                      {/* Two whole phrases side by side rather than one
                          sentence assembled from fragments and a separator. */}
                      <span>
                        {intl.formatMessage(studyCountMessages.waves, {
                          count: study.waveCount,
                        })}
                      </span>
                      <span>
                        {intl.formatMessage(studyCountMessages.participants, {
                          count: study.participantCount,
                        })}
                      </span>
                    </div>
                  )}
                  {study.protocolId === null ? (
                    <span className="text-sm opacity-70">
                      {intl.formatMessage(messages.noProtocol)}
                    </span>
                  ) : (
                    <Link
                      className="focusable rounded text-sm"
                      to="/study/$studyId/editor"
                      params={{ studyId: study.id }}
                    >
                      {intl.formatMessage(messages.openEditor)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Surface>

      <Surface spacing="lg">
        <section aria-labelledby="new-study-heading">
          <Heading id="new-study-heading" level="h2" margin="none">
            {intl.formatMessage(messages.newStudyHeading)}
          </Heading>
          {canCreateStudies ? (
            <Form
              className="mt-4 max-w-xl"
              onSubmit={async (values) => {
                const name = typeof values.name === 'string' ? values.name : '';
                const previous = creationAttempt.current;
                const attempt =
                  previous?.name === name && previous.teamId === teamId
                    ? previous
                    : {
                        teamId,
                        name,
                        studyId: createUuid(),
                        protocolId: createUuid(),
                        draftId: createUuid(),
                      };
                creationAttempt.current = attempt;
                setCreating(true);
                // Where the researcher was when they asked for this. The header
                // is on every screen, so a slow creation can resolve after they
                // have switched teams or left the team area entirely, and a
                // continuation that assumes it is still the current one drags
                // them back into stale context.
                //
                // Both ends read `state.location` deliberately: it is the
                // PENDING location, so a navigation that has started but not yet
                // committed already reads as "they have moved" — which is the
                // answer that keeps this from landing on top of a navigation the
                // researcher asked for. What matters is that the same source is
                // read at both ends.
                const startedAt = router.state.location.pathname;
                // §6.5's generation, and what the comparison above cannot be:
                // a pathname is a place, not an occasion. Leaving `/team/A` and
                // coming back to it before the response lands reads as never
                // having left, and the continuation then pulls the researcher
                // into an editor from a navigation they made two screens ago.
                //
                // Recorded from the router rather than from this component,
                // because the component is not always there to see it: leaving
                // the team area unmounts this screen while its continuation goes
                // on running. `hrefChanged` is what makes an idle reload — the
                // session revalidation a tab switch triggers is one — not count
                // as having moved.
                let navigated = false;
                const stopWatchingNavigation = router.subscribe(
                  'onResolved',
                  (event) => {
                    if (event.hrefChanged) navigated = true;
                  },
                );
                try {
                  // The attempt IS the request: its team, name and identifiers
                  // are exactly what the procedure takes, so a retry cannot
                  // send them against a different team than the one they were
                  // minted for.
                  const created = await createStudy.mutateAsync(attempt);
                  if (creationAttempt.current === attempt) {
                    creationAttempt.current = undefined;
                  }
                  await queryClient.invalidateQueries({
                    queryKey: orpc.studies.list.key({ input: { teamId } }),
                  });
                  // Straight into the editor: a new study's first act is
                  // designing its protocol, and an empty overview would be a
                  // screen nobody wants (§10.2 makes the same choice at the end
                  // of the sign-up funnel). Only from where the request was
                  // made, and only if nothing has committed since: the study
                  // exists and the list above names it, so a researcher who has
                  // moved at all loses nothing by staying where they chose to
                  // be.
                  if (
                    !navigated &&
                    router.state.location.pathname === startedAt
                  ) {
                    await navigate({
                      to: '/study/$studyId/editor',
                      params: { studyId: created.studyId },
                    });
                  }
                  return { success: true };
                } catch {
                  return {
                    success: false,
                    formErrors: [intl.formatMessage(messages.createFailed)],
                  };
                } finally {
                  stopWatchingNavigation();
                  setCreating(false);
                }
              }}
            >
              <Field
                name="name"
                label={intl.formatMessage(messages.nameLabel)}
                component={InputField}
                required
              />
              <SubmitButton disabled={creating}>
                {intl.formatMessage(messages.create)}
              </SubmitButton>
            </Form>
          ) : (
            <Alert className="mt-4">
              {intl.formatMessage(messages.onlyAdminsCreate)}
            </Alert>
          )}
        </section>
      </Surface>
    </div>
  );
}
