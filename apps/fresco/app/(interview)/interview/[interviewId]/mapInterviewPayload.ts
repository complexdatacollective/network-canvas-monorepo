import {
  createInitialNetwork,
  isValidAssetType,
  type InterviewPayload,
  type ResolvedAsset,
} from '@codaco/interview/contract';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  dynamicAttributeValueNames,
  dynamicValueNamesIn,
  getLocaleMetadata,
  parseDynamicValueName,
} from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';
import { parseStoredInterviewSession } from '~/lib/db/storedInterviewSession';
import { parseStoredProtocol } from '~/lib/db/storedProtocol';
import type { GetInterviewByIdQuery } from '~/queries/interviews';

type MappedInterview =
  | {
      success: true;
      payload: InterviewPayload;
      assetUrls: Record<string, string>;
      initialStep: number;
      initialSyncRevision: number;
    }
  | {
      // Nothing may start the interview. Without the participant data the
      // client would build a network that its first sync writes over the
      // stored one; without the protocol it would run a design other than the
      // researcher's.
      success: false;
      unreadable: 'session' | 'protocol';
      error: unknown;
    };

type ReadableInterview = Extract<MappedInterview, { success: true }>;

type ViewedInterview =
  | (ReadableInterview & { view: InterviewView })
  | Extract<MappedInterview, { success: false }>;

/**
 * How a request opens an interview, decided on the server.
 *
 * - `active`: an unfinished interview, at its stages.
 * - `editable-finished`: a finished interview, at its stages and open to
 *   changes, for a researcher while completed interviews are not frozen.
 * - `completed`: a finished interview's completed state, from a payload that
 *   holds none of the interview's answers and none of the protocol's
 *   resources. Nothing in this view may be written back: its network is
 *   empty, so a write would erase the stored one.
 */
export type InterviewView = 'active' | 'editable-finished' | 'completed';

/**
 * The interview a request is shown, chosen here on the server so that nothing
 * the browser sends can ask for more.
 *
 * - An unfinished interview opens as it is, to anyone with its link.
 * - A finished interview opens on its completed state, from a payload with
 *   none of the interview's answers but the ego attributes its finished
 *   screen shows (`finishTextEgoAttributes`): no other network and no stage
 *   metadata. Nor
 *   does it carry the protocol's resources, whose entries can hold API keys
 *   and whose URLs open the files: the completed state shows only the finish
 *   stage's text. Only the protocol's design, where the interview ended, and
 *   its language go to the browser. Before finish stages, a participant who opened a finished
 *   interview was sent to a page with no interview on it at all.
 * - A researcher opening a finished interview while completed interviews are
 *   not frozen gets it in full, to change, as before finish stages.
 */
export function mapInterviewForViewer(
  source: NonNullable<GetInterviewByIdQuery>,
  {
    researcher,
    freezeCompletedInterviews,
  }: { researcher: boolean; freezeCompletedInterviews: boolean },
): ViewedInterview {
  const mapped = mapInterviewPayload(source);
  // Unreadable stored data opens nothing, finished or not.
  if (!mapped.success) return mapped;
  if (source.finishTime === null) {
    return { ...mapped, view: 'active' };
  }
  if (researcher && !freezeCompletedInterviews) {
    return { ...mapped, view: 'editable-finished' };
  }
  const { stageMetadata: _stageMetadata, ...session } = mapped.payload.session;
  const network = createInitialNetwork();
  network.ego.attributes = finishTextEgoAttributes(mapped.payload);
  return {
    ...mapped,
    payload: {
      protocol: { ...mapped.payload.protocol, assets: [] },
      session: { ...session, network },
    },
    assetUrls: {},
    view: 'completed',
  };
}

/**
 * The ego attributes the finished screen of the finish stage the interview
 * ended on shows in its text, or chooses what it shows by, and no others:
 * each value the text shows, each that its logic blocks read (directly, or
 * through the rules of a condition), and each that a dynamic attribute it
 * shows reads, by its logic or in the wording of its versions. The completed state shows that text whenever the interview is
 * opened, and without them a value the participant read when they finished
 * would read as missing, and a logic block would show another version. These
 * are answers the protocol chose to use on that screen; every other answer
 * stays on the server, including one only the closing screen before the
 * Finish button uses, which the completed state never renders. A finish
 * stage recorded before finish stages were tracked is not known, so every
 * finish stage's finished screen counts.
 *
 * The completed state's network is otherwise empty, and that is enough for
 * its logic to choose as it did when the participant finished: a condition
 * of a finish stage can read only the participant's attributes. A rule about
 * the network is about a node or an edge on screen, and validation refuses
 * one on a finish stage, which shows neither.
 */
function finishTextEgoAttributes(
  payload: InterviewPayload,
): NcNetwork['ego']['attributes'] {
  const { finishStageId, network } = payload.session;
  const kept: NcNetwork['ego']['attributes'] = {};
  const keep = (variableId: string) => {
    // Attribute ids come from the protocol and may name a member every
    // object inherits, so only an own value counts.
    const value = Object.hasOwn(network.ego.attributes, variableId)
      ? network.ego.attributes[variableId]
      : undefined;
    if (value !== undefined) kept[variableId] = value;
  };
  for (const stage of payload.protocol.stages) {
    if (stage.type !== 'FinishSession') continue;
    if (finishStageId !== null && stage.id !== finishStageId) continue;
    const conditions = stage.conditions ?? {};
    const dynamicAttributes = stage.dynamicAttributes ?? {};
    // Every language's version, since the browser picks the language.
    const names = Object.values(stage.finishedContent).flatMap((message) =>
      dynamicValueNamesIn(message),
    );
    const read = new Set<string>();
    while (names.length > 0) {
      const name = names.pop();
      if (name === undefined || read.has(name)) continue;
      read.add(name);
      const parsed = parseDynamicValueName(name);
      if (parsed?.kind === 'attribute' && parsed.role === 'ego') {
        keep(parsed.variableId);
      } else if (
        parsed?.kind === 'condition' &&
        Object.hasOwn(conditions, parsed.conditionId)
      ) {
        for (const rule of conditions[parsed.conditionId]?.rules ?? []) {
          if (rule.type === 'ego' && 'attribute' in rule.options) {
            keep(rule.options.attribute);
          }
        }
      } else if (
        parsed?.kind === 'dynamicAttribute' &&
        Object.hasOwn(dynamicAttributes, parsed.id)
      ) {
        // What its logic reads, and what the wording of its versions shows,
        // other dynamic attributes included, which are read in turn.
        names.push(...dynamicAttributeValueNames(dynamicAttributes[parsed.id]));
      }
    }
  }
  return kept;
}

export function mapInterviewPayload(
  source: NonNullable<GetInterviewByIdQuery>,
): MappedInterview {
  const { protocol, ...session } = source;

  // The stored version is written from the validated document at import
  // (actions/protocols.ts) and never rewritten. A schema 8 row is sent to the
  // bundled schema 8 interview before it gets here (`interviewPath`), so any
  // other version is one this runtime cannot read. Stamping a literal instead
  // would hand the interview a document it cannot read while claiming it can;
  // refuse instead, reporting it the way a damaged row is, not thrown.
  const { schemaVersion } = protocol;
  if (schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
    return {
      success: false,
      unreadable: 'protocol',
      error: new Error(
        `Protocol "${protocol.name}" (id=${protocol.id}) is stored as schema ` +
          `version ${schemaVersion}, but this version of Fresco runs protocol ` +
          `schema version ${COMPATIBLE_PROTOCOL_SCHEMA_VERSION}. It must be ` +
          `migrated before an interview using it can be started.`,
      ),
    };
  }

  const storedProtocol = parseStoredProtocol(protocol);
  if (!storedProtocol.success) {
    return {
      success: false,
      unreadable: 'protocol',
      error: storedProtocol.error,
    };
  }

  const stored = parseStoredInterviewSession(session);
  if (!stored.success) {
    return { success: false, unreadable: 'session', error: stored.error };
  }

  const assets: ResolvedAsset[] = protocol.assets.map((a) => {
    if (!isValidAssetType(a.type)) {
      throw new Error(`Unrecognised asset type from database: "${a.type}"`);
    }
    return {
      assetId: a.assetId,
      name: a.name,
      type: a.type,
      value: a.value ?? undefined,
    };
  });

  // Built with fromEntries so that an asset ID such as `__proto__` stays an
  // entry of its own rather than reaching the prototype setter.
  const assetUrls: Record<string, string> = Object.fromEntries(
    protocol.assets.filter((a) => a.url).map((a) => [a.assetId, a.url]),
  );

  const payload: InterviewPayload = {
    session: {
      id: session.id,
      startTime: session.startTime.toISOString(),
      finishTime: session.finishTime?.toISOString() ?? null,
      // Where a finished interview ended, so it opens on that finish stage's
      // completed state. Null for an unfinished interview, and for one
      // finished before finish stages were recorded.
      finishStageId: session.finishStageId,
      exportTime: session.exportTime?.toISOString() ?? null,
      lastUpdated: session.lastUpdated.toISOString(),
      network: stored.data.network,
      stageMetadata: stored.data.stageMetadata ?? undefined,
      localeOptions: storedProtocol.data.localization.locales.map((locale) =>
        getLocaleMetadata(locale),
      ),
    },
    // Named field by field rather than spread from the row: the row also holds
    // the original upload's storage key and URL, which the asset route serves
    // without authentication, so spreading it would hand every holder of an
    // interview link the original .netcanvas archive.
    protocol: {
      ...storedProtocol.data,
      id: protocol.id,
      name: protocol.name,
      schemaVersion,
      hash: protocol.hash,
      description: protocol.description ?? undefined,
      importedAt: protocol.importedAt.toISOString(),
      assets,
    },
  };

  return {
    success: true,
    payload,
    assetUrls,
    initialStep: session.currentStep,
    // The sync handler numbers its writes upwards from here. It is not part of
    // `InterviewPayload` because it belongs to this host's transport rather
    // than to the interview the engine runs.
    initialSyncRevision: session.syncRevision,
  };
}
