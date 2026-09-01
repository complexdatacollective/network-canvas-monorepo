import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc } from '../lib/api.ts';
import { createUuid } from '../lib/createUuid.ts';

/**
 * The team's studies, at `/team/$teamId` (§5.2, #1262).
 *
 * This is the half of the shipped team workspace that §5.4 keeps here: the
 * list a researcher chooses their work from, and where a new study starts.
 * Membership and invitations moved to `/team/$teamId/members`, and the
 * workspace's own "Active team" panel went with the header's team chip, which
 * says the same thing on every screen instead of only on this one.
 *
 * **A study is a protocol until #1262 lands the model.** `protocols.list` is
 * what answers "what does this team have?", and `/study/$studyId` addresses
 * the protocol that study work is being done against — the same parameter the
 * route tree already names for what the product has decided to have. The
 * screen speaks the product's vocabulary; the procedure behind it keeps its
 * own until there is a table to rename.
 *
 * The team comes from the URL, never from the active-team setting: §2.2's
 * invariant is that the URL is authoritative and the setting follows it, which
 * is what the app shell's reconciler does (§6.6).
 */

type StudyCreationAttempt = {
  name: string;
  protocolId: string;
  draftId: string;
};

export default function TeamStudies({ teamId }: { teamId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // A creation whose response was lost keeps its identifiers, so retrying the
  // same name cannot leave two studies behind.
  const creationAttempt = useRef<StudyCreationAttempt | undefined>(undefined);
  const studies = useQuery(
    orpc.protocols.list.queryOptions({ input: { teamId } }),
  );
  const createStudy = useMutation(
    orpc.protocols.create.mutationOptions({
      onSuccess: async (created) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.protocols.list.key({ input: { teamId } }),
        });
        // Straight into the editor: a new study's first act is designing its
        // protocol, and an empty overview would be a screen nobody wants
        // (§10.2 makes the same choice at the end of the sign-up funnel).
        await navigate({
          to: '/study/$studyId/editor',
          params: { studyId: created.protocolId },
        });
      },
    }),
  );

  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          Studies
        </Heading>
        <Paragraph margin="none">
          Every study this team owns, and where a new one starts.
        </Paragraph>
      </div>

      <Surface spacing="lg">
        <section aria-labelledby="studies-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading id="studies-heading" level="h2" margin="none">
              This team&rsquo;s studies
            </Heading>
            {studies.isPending && <Spinner size="sm" />}
          </div>
          {studies.isError && (
            <Alert className="mt-4" variant="destructive">
              Studies could not be loaded. Try again.
            </Alert>
          )}
          {studies.data?.length === 0 && (
            <Paragraph>No studies have been created for this team.</Paragraph>
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
                  <span className="text-sm">
                    Created {study.createdAt.toLocaleDateString()}
                  </span>
                  {study.draftId === null ? (
                    <span className="text-sm opacity-70">
                      No editable draft
                    </span>
                  ) : (
                    <Link
                      className="focusable rounded text-sm"
                      to="/study/$studyId/editor"
                      params={{ studyId: study.id }}
                    >
                      Open the protocol editor
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
            New study
          </Heading>
          <Form
            className="mt-4 max-w-xl"
            onSubmit={async (values) => {
              const name = typeof values.name === 'string' ? values.name : '';
              const previous = creationAttempt.current;
              const attempt =
                previous?.name === name
                  ? previous
                  : {
                      name,
                      protocolId: createUuid(),
                      draftId: createUuid(),
                    };
              creationAttempt.current = attempt;
              setCreating(true);
              try {
                await createStudy.mutateAsync({ teamId, ...attempt });
                if (creationAttempt.current === attempt) {
                  creationAttempt.current = undefined;
                }
                return { success: true };
              } catch {
                return {
                  success: false,
                  formErrors: [
                    'The study could not be created. Wait a moment and try again.',
                  ],
                };
              } finally {
                setCreating(false);
              }
            }}
          >
            <Field
              name="name"
              label="Study name"
              component={InputField}
              required
            />
            <SubmitButton disabled={creating}>Create study</SubmitButton>
          </Form>
        </section>
      </Surface>
    </div>
  );
}
