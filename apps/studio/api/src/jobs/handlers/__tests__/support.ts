import { Context, Effect, Layer } from 'effect';
import {
  HttpClient,
  HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
} from 'effect/http';

import {
  type MagicLinkInput,
  type MailFailed,
  Mailer,
  type MailNotConfigured,
  type TeamInvitationInput,
  type UpdateNoticeInput,
} from '../../../mail/mailer.ts';

export type MailBehaviour<Input> = (
  input: Input,
  call: number,
) => Effect.Effect<void, MailFailed | MailNotConfigured>;

export type RecordedMailShape = {
  readonly invitations: TeamInvitationInput[];
  readonly magicLinks: MagicLinkInput[];
  readonly updateNotices: UpdateNoticeInput[];
  readonly setUpdateNoticeBehaviour: (
    behaviour: MailBehaviour<UpdateNoticeInput>,
  ) => Effect.Effect<void>;
  readonly setInvitationBehaviour: (
    behaviour: MailBehaviour<TeamInvitationInput>,
  ) => Effect.Effect<void>;
  readonly setMagicLinkBehaviour: (
    behaviour: MailBehaviour<MagicLinkInput>,
  ) => Effect.Effect<void>;
  readonly clear: Effect.Effect<void>;
};

export class RecordedMail extends Context.Service<
  RecordedMail,
  RecordedMailShape
>()('@studio/jobs/test/RecordedMail') {}

export const layerRecordingMailer: Layer.Layer<Mailer | RecordedMail> =
  Layer.effectContext(
    Effect.sync(() => {
      const invitations: TeamInvitationInput[] = [];
      const magicLinks: MagicLinkInput[] = [];
      let invitationBehaviour: MailBehaviour<TeamInvitationInput> = () =>
        Effect.void;
      let magicLinkBehaviour: MailBehaviour<MagicLinkInput> = () => Effect.void;
      const updateNotices: UpdateNoticeInput[] = [];
      let updateNoticeBehaviour: MailBehaviour<UpdateNoticeInput> = () =>
        Effect.void;

      return Context.make(
        Mailer,
        Mailer.of({
          sendTeamInvitation: (input) =>
            Effect.suspend(() => {
              invitations.push(input);
              return invitationBehaviour(input, invitations.length);
            }),
          sendMagicLink: (input) =>
            Effect.suspend(() => {
              magicLinks.push(input);
              return magicLinkBehaviour(input, magicLinks.length);
            }),
          sendUpdateNotice: (input) =>
            Effect.suspend(() => {
              updateNotices.push(input);
              return updateNoticeBehaviour(input, updateNotices.length);
            }),
        }),
      ).pipe(
        Context.add(
          RecordedMail,
          RecordedMail.of({
            invitations,
            magicLinks,
            updateNotices,
            setUpdateNoticeBehaviour: (behaviour) =>
              Effect.sync(() => {
                updateNoticeBehaviour = behaviour;
              }),
            setInvitationBehaviour: (behaviour) =>
              Effect.sync(() => {
                invitationBehaviour = behaviour;
              }),
            setMagicLinkBehaviour: (behaviour) =>
              Effect.sync(() => {
                magicLinkBehaviour = behaviour;
              }),
            clear: Effect.sync(() => {
              invitations.length = 0;
              magicLinks.length = 0;
              updateNotices.length = 0;
            }),
          }),
        ),
      );
    }),
  );

export type RecordedRequest = {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly hasBody: boolean;
};

export type HttpReply =
  | { readonly kind: 'json'; readonly body: unknown; readonly status?: number }
  | { readonly kind: 'text'; readonly body: string; readonly status?: number }
  | { readonly kind: 'unreachable' };

export class RecordedHttp extends Context.Service<
  RecordedHttp,
  {
    readonly requests: RecordedRequest[];
    readonly reply: (reply: HttpReply) => Effect.Effect<void>;
  }
>()('@studio/jobs/test/RecordedHttp') {}

/**
 * An `HttpClient` that records each request as the client hands it to the
 * transport — after the client has added its own headers, trace propagation
 * included — and answers with the reply the test last set.
 */
export const layerRecordingHttp = (
  first: HttpReply,
): Layer.Layer<HttpClient.HttpClient | RecordedHttp> =>
  Layer.effectContext(
    Effect.sync(() => {
      const requests: RecordedRequest[] = [];
      let current = first;
      const answer = (request: HttpClientRequest.HttpClientRequest) => {
        requests.push({
          method: request.method,
          url: request.url,
          headers: { ...request.headers },
          hasBody: request.body._tag !== 'Empty',
        });
        if (current.kind === 'unreachable') {
          return Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request }),
            }),
          );
        }
        const status = current.status ?? 200;
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            current.kind === 'json'
              ? new Response(JSON.stringify(current.body), {
                  status,
                  headers: { 'content-type': 'application/json' },
                })
              : new Response(current.body, { status }),
          ),
        );
      };
      return Context.make(
        HttpClient.HttpClient,
        HttpClient.make((request) => answer(request)),
      ).pipe(
        Context.add(
          RecordedHttp,
          RecordedHttp.of({
            requests,
            reply: (reply) =>
              Effect.sync(() => {
                current = reply;
              }),
          }),
        ),
      );
    }),
  );
