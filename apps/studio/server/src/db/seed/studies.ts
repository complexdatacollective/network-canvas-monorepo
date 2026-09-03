// Studies, their waves, their participants, the tokenized links into each
// wave, the study-tier role grants, and the consent documents those
// participants sign.
//
// Ordering inside this module is the foreign-key order: studies -> waves ->
// participants -> links, with consent documents last because their items must
// be written while the document is still a draft (the `consent_items_frozen`
// trigger).
import { faker } from '@faker-js/faker';
import type pg from 'pg';

import { insertRows, type SeedRowValue } from './insert.ts';
import type { SeededProtocolLine } from './protocols.ts';
import {
  base64url,
  pickSome,
  seedBytes,
  seedTime,
  seedUuid,
  sha256Bytes,
  sha256Hex,
  shiftDays,
  shiftMinutes,
} from './rng.ts';
import type { SeedTeam } from './teams.ts';

/** Eight zones, including two southern-hemisphere ones so DST arithmetic bites. */
const TIME_ZONES = [
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

const STUDY_ROLES = [
  'manager',
  'protocol_designer',
  'coordinator',
  'data_viewer',
] as const;

/** The seed's own label for a study, so later phases can find the one they need. */
export type SeedStudyKey =
  | 'draft'
  | 'live'
  | 'anonymous'
  | 'paused'
  | 'closed'
  | 'deleting';

export type SeedWave = {
  id: string;
  studyId: string;
  waveNumber: number;
  protocolVersionId: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
};

export type SeedParticipant = {
  id: string;
  studyId: string;
  code: string;
  timezone: string;
  enrolledAt: Date;
  /**
   * The synthetic contact address the blind indexes are computed over. The
   * address itself is never stored: `participants`' PII columns stay NULL
   * until #1258 chooses a cipher, and a blind index without its ciphertext is
   * refused by `participants_blind_index_pairing_check`.
   */
  contactAddress: string;
};

export type SeedLink = {
  id: string;
  waveId: string;
  participantId: string | null;
  token: string;
  kind: 'participant' | 'anonymous';
};

export type SeedStudy = {
  id: string;
  key: SeedStudyKey;
  name: string;
  state: 'draft' | 'live' | 'paused' | 'closed';
  participationMode: 'managed' | 'anonymous';
  createdAt: Date;
  waves: SeedWave[];
  participants: SeedParticipant[];
  links: SeedLink[];
  /** Sessions per wave, index-aligned with `waves`. */
  sessionCounts: number[];
};

type StudyPlan = {
  key: SeedStudyKey;
  name: string;
  state: SeedStudy['state'];
  participationMode: SeedStudy['participationMode'];
  waveProgression: 'window' | 'sequential';
  waveCount: number;
  /** 0 = v1, 1 = v2, null = no pin (a Draft study's waves pin nothing). */
  pinnedVersion: 0 | 1 | null;
  participantCount: number;
  sessionCounts: number[];
};

/**
 * The five studies every team gets, plus a sixth on one team carrying the
 * deletion marker. Anonymous studies are single-wave by decision: an anonymous
 * link is per-study, and a second wave would have no way to attribute a
 * returning visitor.
 */
function studyPlans(teamIndex: number): StudyPlan[] {
  const plans: StudyPlan[] = [
    {
      key: 'draft',
      name: 'Neighbourhood ties pilot',
      state: 'draft',
      participationMode: 'managed',
      waveProgression: 'window',
      waveCount: 2,
      pinnedVersion: null,
      participantCount: 0,
      sessionCounts: [0, 0],
    },
    {
      key: 'live',
      name: 'Social support across the year',
      state: 'live',
      participationMode: 'managed',
      waveProgression: 'sequential',
      waveCount: 3,
      pinnedVersion: 1,
      participantCount: 40,
      sessionCounts: [40, 30, 20],
    },
    {
      key: 'anonymous',
      name: 'Open community survey',
      state: 'live',
      participationMode: 'anonymous',
      waveProgression: 'window',
      waveCount: 1,
      pinnedVersion: 1,
      participantCount: 0,
      sessionCounts: [25],
    },
    {
      key: 'paused',
      name: 'Clinic referral networks',
      state: 'paused',
      participationMode: 'managed',
      waveProgression: 'window',
      waveCount: 1,
      pinnedVersion: 0,
      participantCount: 15,
      sessionCounts: [12],
    },
    {
      key: 'closed',
      name: 'Rural mobility study',
      state: 'closed',
      participationMode: 'managed',
      waveProgression: 'window',
      waveCount: 2,
      pinnedVersion: 0,
      participantCount: 25,
      sessionCounts: [15, 10],
    },
  ];
  if (teamIndex === 0) {
    plans.push({
      key: 'deleting',
      name: 'Withdrawn feasibility study',
      state: 'draft',
      participationMode: 'managed',
      waveProgression: 'window',
      waveCount: 1,
      pinnedVersion: null,
      participantCount: 0,
      sessionCounts: [0],
    });
  }
  return plans;
}

function participantCode(index: number): string {
  return `P-${String(index + 1).padStart(4, '0')}`;
}

/**
 * `<team_id>.<base64url secret>`, so redemption can pin a tenant before
 * reading anything. The stored hash is sha256 of the secret alone.
 */
function mintToken(teamId: string): { token: string; hash: Buffer } {
  const secret = base64url(seedBytes(32));
  return { token: `${teamId}.${secret}`, hash: sha256Bytes(secret) };
}

export async function seedStudies(
  client: pg.PoolClient,
  team: SeedTeam,
  line: SeededProtocolLine,
  scale: { participantMultiplier: number },
): Promise<SeedStudy[]> {
  const studies: SeedStudy[] = [];
  const studyRows: SeedRowValue[][] = [];
  const waveRows: SeedRowValue[][] = [];
  const participantRows: SeedRowValue[][] = [];
  const linkRows: SeedRowValue[][] = [];
  const grantRows: SeedRowValue[][] = [];

  let participantOrdinal = 0;

  for (const [planIndex, plan] of studyPlans(team.index).entries()) {
    const studyId = seedUuid();
    const createdAt = seedTime(-320 + planIndex * 11, planIndex * 37);
    const wentLiveAt = plan.state === 'draft' ? null : shiftDays(createdAt, 14);
    const pausedAt = plan.state === 'paused' ? shiftDays(createdAt, 120) : null;
    // The closed study is inserted `live` and closed at the very end of its
    // team's block: every closed guard refuses writes to its children, so its
    // sessions, networks and consents must land first.
    const insertedState = plan.state === 'closed' ? 'live' : plan.state;
    const deletionRequestedAt =
      plan.key === 'deleting' ? shiftDays(createdAt, 30) : null;
    const purgeAfter =
      deletionRequestedAt === null ? null : shiftDays(deletionRequestedAt, 30);
    // The last update is the latest transition the row records: a paused
    // study was touched when it paused, not a month after it was created.
    const updatedAt = new Date(
      Math.max(
        ...[shiftDays(createdAt, 30), wentLiveAt, pausedAt, deletionRequestedAt]
          .filter((moment): moment is Date => moment !== null)
          .map((moment) => moment.getTime()),
      ),
    );

    studyRows.push([
      studyId,
      team.id,
      plan.name,
      insertedState,
      plan.participationMode,
      plan.waveProgression,
      plan.key === 'paused' ? 120 : 60,
      line.protocolId,
      JSON.stringify({
        reminderCadenceDays: faker.number.int({ min: 2, max: 7 }),
        allowResume: true,
      }),
      deletionRequestedAt,
      purgeAfter,
      wentLiveAt,
      pausedAt,
      null,
      createdAt,
      updatedAt,
    ]);

    const waves: SeedWave[] = [];
    for (let index = 0; index < plan.waveCount; index++) {
      const opensAt = shiftDays(createdAt, 20 + index * 60);
      waves.push({
        id: seedUuid(),
        studyId,
        waveNumber: index + 1,
        protocolVersionId:
          plan.pinnedVersion === null
            ? null
            : line.versions[plan.pinnedVersion].versionId,
        opensAt,
        closesAt: shiftDays(opensAt, 45),
      });
    }
    for (const wave of waves) {
      waveRows.push([
        wave.id,
        studyId,
        team.id,
        wave.waveNumber,
        `Wave ${wave.waveNumber}`,
        wave.protocolVersionId,
        wave.opensAt,
        wave.closesAt,
        createdAt,
        shiftDays(createdAt, 21),
      ]);
    }

    const participants: SeedParticipant[] = [];
    const participantCount =
      plan.participantCount === 0
        ? 0
        : plan.participantCount * scale.participantMultiplier;
    for (let index = 0; index < participantCount; index++) {
      const code = participantCode(participantOrdinal++);
      const enrolledAt = shiftDays(createdAt, 15 + (index % 30));
      participants.push({
        id: seedUuid(),
        studyId,
        code,
        timezone: faker.helpers.arrayElement(TIME_ZONES),
        enrolledAt,
        contactAddress: `${code.toLowerCase()}.${team.slug}@participants.invalid`,
      });
    }
    for (const participant of participants) {
      participantRows.push([
        participant.id,
        studyId,
        team.id,
        participant.code,
        participant.timezone,
        participant.enrolledAt,
        participant.enrolledAt,
        shiftDays(participant.enrolledAt, 3),
      ]);
    }

    // One participant link per managed participant per live or paused wave,
    // plus one open link per anonymous study.
    const links: SeedLink[] = [];
    if (plan.participationMode === 'anonymous') {
      const wave = waves[0]!;
      const { token, hash } = mintToken(team.id);
      const id = seedUuid();
      links.push({
        id,
        waveId: wave.id,
        participantId: null,
        token,
        kind: 'anonymous',
      });
      // Redemptions are written later, from the sessions the link produced
      // (`recordLinkRedemptions`), for both link kinds.
      linkRows.push([
        id,
        studyId,
        team.id,
        wave.id,
        null,
        'anonymous',
        hash,
        shiftDays(createdAt, 200),
        null,
        0,
        null,
        team.adminUserId,
        shiftDays(createdAt, 18),
      ]);
    } else if (plan.state === 'live' || plan.state === 'paused') {
      for (const wave of waves) {
        for (const participant of participants) {
          const { token, hash } = mintToken(team.id);
          const id = seedUuid();
          links.push({
            id,
            waveId: wave.id,
            participantId: participant.id,
            token,
            kind: 'participant',
          });
          linkRows.push([
            id,
            studyId,
            team.id,
            wave.id,
            participant.id,
            'participant',
            hash,
            wave.closesAt,
            null,
            0,
            null,
            team.adminUserId,
            shiftDays(participant.enrolledAt, 1),
          ]);
        }
      }
    }

    // The creator's grandfathered grant, without which the seeded admin cannot
    // see the studies at all, plus a spread of the other roles.
    grantRows.push([
      seedUuid(),
      team.id,
      studyId,
      team.adminUserId,
      'manager',
      true,
      team.adminUserId,
      createdAt,
      createdAt,
    ]);
    const others = pickSome(
      team.members.filter((member) => member.userId !== team.adminUserId),
      faker.number.int({ min: 1, max: 3 }),
    );
    for (const [index, member] of others.entries()) {
      grantRows.push([
        seedUuid(),
        team.id,
        studyId,
        member.userId,
        STUDY_ROLES[(planIndex + index) % STUDY_ROLES.length]!,
        // Mixed within one study: the PII flag is orthogonal to the role.
        index % 2 === 0,
        team.adminUserId,
        shiftDays(createdAt, 2),
        shiftDays(createdAt, 2),
      ]);
    }

    studies.push({
      id: studyId,
      key: plan.key,
      name: plan.name,
      state: plan.state,
      participationMode: plan.participationMode,
      createdAt,
      waves,
      participants,
      links,
      sessionCounts: plan.sessionCounts.map(
        (count) => count * scale.participantMultiplier,
      ),
    });
  }

  await insertRows(
    client,
    'studies',
    [
      'id',
      'team_id',
      'name',
      'state',
      'participation_mode',
      'wave_progression',
      'pause_grace_minutes',
      'protocol_id',
      'settings',
      'deletion_requested_at',
      'purge_after',
      'went_live_at',
      'paused_at',
      'closed_at',
      'created_at',
      'updated_at',
    ],
    studyRows,
  );
  await insertRows(
    client,
    'study_waves',
    [
      'id',
      'study_id',
      'team_id',
      'wave_number',
      'name',
      'protocol_version_id',
      'opens_at',
      'closes_at',
      'created_at',
      'updated_at',
    ],
    waveRows,
  );
  await insertRows(
    client,
    'participants',
    [
      'id',
      'study_id',
      'team_id',
      'participant_code',
      'timezone',
      'enrolled_at',
      'created_at',
      'updated_at',
    ],
    participantRows,
  );
  await insertRows(
    client,
    'interview_links',
    [
      'id',
      'study_id',
      'team_id',
      'wave_id',
      'participant_id',
      'kind',
      'token_hash',
      'expires_at',
      'revoked_at',
      'redemption_count',
      'last_redeemed_at',
      'created_by_user_id',
      'created_at',
    ],
    linkRows,
  );
  await insertRows(
    client,
    'study_role_grants',
    [
      'id',
      'team_id',
      'study_id',
      'user_id',
      'role',
      'pii_access',
      'granted_by_user_id',
      'granted_at',
      'updated_at',
    ],
    grantRows,
  );

  return studies;
}

/**
 * A link's redemption record is derived from the sessions that cite it, once
 * they exist: every visit through a link is a session, so the count is the
 * session count and the last redemption is the newest session's start. Written
 * as one set-based update rather than carried on the link rows, because the
 * sessions are planned after the links are inserted.
 */
export async function recordLinkRedemptions(
  client: pg.PoolClient,
  teamId: string,
): Promise<void> {
  await client.query(
    `update interview_links l
        set redemption_count = redeemed.n,
            last_redeemed_at = redeemed.newest
       from (
         select link_id, count(*)::int as n, max(started_at) as newest
           from interview_sessions
          where team_id = $1 and link_id is not null
          group by link_id
       ) redeemed
      where l.id = redeemed.link_id and l.team_id = $1`,
    [teamId],
  );
}

export type SeedConsentDocument = {
  id: string;
  studyId: string;
  version: number;
  state: 'draft' | 'published' | 'retired';
  contentHash: string;
  items: { id: string; key: string; required: boolean }[];
};

const CONSENT_ITEM_KEYS = [
  {
    key: 'participation',
    prompt: 'I agree to take part in this study.',
    required: true,
  },
  {
    key: 'data_retention',
    prompt: 'I agree that my responses may be kept for ten years.',
    required: true,
  },
  {
    key: 'recontact',
    prompt: 'I am happy to be contacted about future waves.',
    required: false,
  },
  {
    key: 'quotes',
    prompt: 'My anonymised answers may be quoted in publications.',
    required: false,
  },
  {
    key: 'data_sharing',
    prompt: 'My de-identified data may be shared with other researchers.',
    required: false,
  },
] as const;

/**
 * One or two document versions per managed study. Items must be written while
 * the document is still a draft — `consent_items_frozen` refuses an insert
 * under a published or retired document — and so must asset pins, so every
 * document is inserted as a draft here and moved to its final state by
 * `publishConsentDocuments` once the pins are written.
 */
export type ConsentPublication = {
  id: string;
  state: string;
  publishedAt: Date | null;
  retiredAt: Date | null;
};

export async function seedConsentDocuments(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
): Promise<{
  byStudy: Map<string, SeedConsentDocument[]>;
  publications: ConsentPublication[];
}> {
  const byStudy = new Map<string, SeedConsentDocument[]>();
  const documentRows: SeedRowValue[][] = [];
  const itemRows: SeedRowValue[][] = [];
  const publications: ConsentPublication[] = [];

  for (const study of studies) {
    if (study.participationMode === 'anonymous') continue;
    // The live study carries a superseded v1 beside its current v2; the others
    // carry one document, published where they have participants and still a
    // draft where they do not.
    const versions: { version: number; state: SeedConsentDocument['state'] }[] =
      study.key === 'live'
        ? [
            { version: 1, state: 'retired' },
            { version: 2, state: 'published' },
          ]
        : [
            {
              version: 1,
              state: study.participants.length > 0 ? 'published' : 'draft',
            },
          ];

    const documents: SeedConsentDocument[] = [];
    for (const { version, state } of versions) {
      const id = seedUuid();
      const itemCount = faker.number.int({ min: 3, max: 5 });
      const items = CONSENT_ITEM_KEYS.slice(0, itemCount).map((item) => ({
        id: seedUuid(),
        key: item.key,
        prompt: item.prompt,
        required: item.required,
      }));
      const title = `${study.name} — information and consent (v${version})`;
      const body = {
        summary: `What taking part in ${study.name} involves.`,
        sections: [
          { heading: 'Purpose', text: faker.lorem.paragraph() },
          { heading: 'What we collect', text: faker.lorem.paragraph() },
        ],
      };
      const contentHash = sha256Hex(
        JSON.stringify([
          title,
          body,
          items.map((item) => [item.key, item.prompt, item.required]),
        ]),
      );
      const createdAt = shiftDays(study.createdAt, version * 3);
      documentRows.push([
        id,
        team.id,
        study.id,
        version,
        'draft',
        'en',
        title,
        JSON.stringify(body),
        contentHash,
        null,
        null,
        createdAt,
        createdAt,
      ]);
      for (const [position, item] of items.entries()) {
        itemRows.push([
          item.id,
          team.id,
          id,
          position + 1,
          item.key,
          item.prompt,
          item.required,
          createdAt,
        ]);
      }
      publications.push({
        id,
        state,
        publishedAt: state === 'draft' ? null : shiftDays(createdAt, 1),
        retiredAt: state === 'retired' ? shiftDays(createdAt, 120) : null,
      });
      documents.push({
        id,
        studyId: study.id,
        version,
        state,
        contentHash,
        items: items.map((item) => ({
          id: item.id,
          key: item.key,
          required: item.required,
        })),
      });
    }
    byStudy.set(study.id, documents);
  }

  await insertRows(
    client,
    'consent_documents',
    [
      'id',
      'team_id',
      'study_id',
      'version',
      'state',
      'locale',
      'title',
      'body',
      'content_hash',
      'published_at',
      'retired_at',
      'created_at',
      'updated_at',
    ],
    documentRows,
  );
  await insertRows(
    client,
    'consent_items',
    [
      'id',
      'team_id',
      'consent_document_id',
      'position',
      'key',
      'prompt',
      'required',
      'created_at',
    ],
    itemRows,
  );
  return { byStudy, publications };
}

/**
 * Moves each document to its final state. Runs after the asset pins are
 * written, because a pin may be added to a consent document only while it is
 * a draft: publication fixes the set, and nothing in this seed gets to add to
 * a published document what a real author could not.
 */
export async function publishConsentDocuments(
  client: pg.PoolClient,
  team: SeedTeam,
  publications: ConsentPublication[],
): Promise<void> {
  for (const publication of publications) {
    if (publication.state === 'draft') continue;
    await client.query(
      `update consent_documents
         set state = $2, published_at = $3, retired_at = $4, updated_at = $5
       where id = $1 and team_id = $6`,
      [
        publication.id,
        publication.state,
        publication.publishedAt,
        publication.retiredAt,
        publication.retiredAt ?? publication.publishedAt,
        team.id,
      ],
    );
  }
}

/**
 * ~90% of a study's participants consent to the current document, ~5% of those
 * later withdraw, and every optional item is answered — some of them declined.
 *
 * Where the participant has interviewed, the consent was captured inside their
 * first session, minutes after it started — fully remote onboarding. Where they
 * have not, it was captured outside any session, shortly after enrolment — the
 * researcher-led kind. Both shapes the column exists to hold appear, and
 * neither claims a session that had not started when the grant was made.
 */
export type SeedWithdrawal = {
  consentId: string;
  studyId: string;
  participantId: string;
  withdrawnAt: Date;
};

/** Returns the consents that were withdrawn, for the events that cite them. */
export async function seedParticipantConsents(
  client: pg.PoolClient,
  team: SeedTeam,
  studies: SeedStudy[],
  documentsByStudy: Map<string, SeedConsentDocument[]>,
  firstSessionByParticipant: Map<string, { id: string; startedAt: Date }>,
): Promise<SeedWithdrawal[]> {
  const consentRows: SeedRowValue[][] = [];
  const responseRows: SeedRowValue[][] = [];
  const withdrawals: SeedWithdrawal[] = [];

  for (const study of studies) {
    const documents = documentsByStudy.get(study.id) ?? [];
    const current = documents.find(
      (document) => document.state === 'published',
    );
    if (current === undefined || study.participants.length === 0) continue;

    const consenting = Math.round(study.participants.length * 0.9);
    for (const [index, participant] of study.participants
      .slice(0, consenting)
      .entries()) {
      const id = seedUuid();
      const session = firstSessionByParticipant.get(participant.id);
      const grantedAt =
        session === undefined
          ? shiftMinutes(
              participant.enrolledAt,
              faker.number.int({ min: 10, max: 600 }),
            )
          : shiftMinutes(
              session.startedAt,
              faker.number.int({ min: 1, max: 5 }),
            );
      const withdrawn = index % 20 === 3;
      const withdrawnAt = withdrawn ? shiftDays(grantedAt, 40) : null;
      if (withdrawnAt !== null) {
        withdrawals.push({
          consentId: id,
          studyId: study.id,
          participantId: participant.id,
          withdrawnAt,
        });
      }
      consentRows.push([
        id,
        team.id,
        study.id,
        participant.id,
        current.id,
        current.contentHash,
        session?.id ?? null,
        'affirmation',
        grantedAt,
        withdrawnAt,
        withdrawn ? 'participant' : null,
        withdrawn ? 'Withdrew after the first wave.' : null,
        grantedAt,
      ]);
      for (const item of current.items) {
        responseRows.push([
          team.id,
          id,
          current.id,
          item.id,
          item.key,
          // Required items are always affirmed — a consent record could not
          // exist otherwise. Optional ones are where the declines live.
          item.required ? true : index % 3 !== 0,
        ]);
      }
    }
  }

  await insertRows(
    client,
    'participant_consents',
    [
      'id',
      'team_id',
      'study_id',
      'participant_id',
      'consent_document_id',
      'consent_content_hash',
      'session_id',
      'method',
      'granted_at',
      'withdrawn_at',
      'withdrawn_by',
      'withdrawal_note',
      'created_at',
    ],
    consentRows,
  );
  await insertRows(
    client,
    'participant_consent_item_responses',
    [
      'team_id',
      'participant_consent_id',
      'consent_document_id',
      'consent_item_id',
      'item_key',
      'affirmed',
    ],
    responseRows,
  );
  return withdrawals;
}

/** Closes the archived study, last, once every child row it owns is written. */
export async function closeStudy(
  client: pg.PoolClient,
  teamId: string,
  study: SeedStudy,
): Promise<void> {
  const closedAt = shiftDays(study.createdAt, 260);
  await client.query(
    `update studies set state = 'closed', closed_at = $3, updated_at = $3
     where id = $1 and team_id = $2`,
    [study.id, teamId, closedAt],
  );
}
