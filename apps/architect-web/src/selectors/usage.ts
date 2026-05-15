import { createSelector } from '@reduxjs/toolkit';
import { compact, flatMap, map, memoize, uniqBy } from 'es-toolkit/compat';

import type { Stage } from '@codaco/protocol-validation';

import { getProtocol } from './protocol';

type SubjectUsageEntry = {
  subject: { entity: string; type: string };
  owner: { type: string; id?: string; promptId?: string; stageId?: string };
};

type StageWithSubject = Stage & { subject: { entity: string; type: string } };

type FlatPrompt = Record<string, unknown> & { id: string; stageId: string };

const getFormTypeUsageIndex = createSelector(
  getProtocol,
  (protocol): SubjectUsageEntry[] => {
    const forms = (protocol as Record<string, unknown> | undefined)?.forms as
      | Record<string, { entity: string; type: string }>
      | undefined;
    if (!forms) return [];
    return map(forms, ({ entity, type }, id) => ({
      subject: { entity, type },
      owner: { id, type: 'form' },
    }));
  },
);

const getStagesWithSubject = createSelector(
  getProtocol,
  (protocol): StageWithSubject[] => {
    if (!protocol) return [];
    return protocol.stages.filter(
      (stage): stage is StageWithSubject =>
        'subject' in stage && !!stage.subject,
    );
  },
);

const getStageTypeUsageIndex = createSelector(
  getStagesWithSubject,
  (stagesWithSubject): SubjectUsageEntry[] =>
    map(stagesWithSubject, ({ subject: { entity, type }, id }) => ({
      subject: { entity, type },
      owner: { type: 'stage', id },
    })),
);

const flattenPromptsFromStages = (stages: Stage[]): FlatPrompt[] =>
  compact(
    flatMap(stages, (stage) => {
      if (!('prompts' in stage) || !stage.prompts) return [];
      return stage.prompts.map(
        (prompt) => ({ ...prompt, stageId: stage.id }) as FlatPrompt,
      );
    }),
  );

const getPromptsWithSubject = createSelector(getProtocol, (protocol) => {
  if (!protocol) return [];
  return flattenPromptsFromStages(protocol.stages).filter(
    (prompt) => !!prompt.subject,
  );
});

const getPromptTypeUsageIndex = createSelector(
  getPromptsWithSubject,
  (promptsWithSubject): SubjectUsageEntry[] =>
    map(promptsWithSubject, (prompt) => {
      const subject = prompt.subject as { entity: string; type: string };
      return {
        subject: { entity: subject.entity, type: subject.type },
        owner: { type: 'prompt', promptId: prompt.id, stageId: prompt.stageId },
      };
    }),
);

const getSociogramTypeUsageIndex = createSelector(
  getProtocol,
  (protocol): SubjectUsageEntry[] => {
    if (!protocol) return [];
    return flatMap(
      flattenPromptsFromStages(
        protocol.stages.filter(({ type }) => type === 'Sociogram'),
      ),
      ({ stageId, id: promptId, ...prompt }) => {
        const edges = prompt.edges as
          | { display?: string[]; creates?: string }
          | undefined;
        if (!edges) {
          return [];
        }

        const { display, creates } = edges;
        let usage: SubjectUsageEntry[] = [];

        if (creates) {
          usage = usage.concat({
            subject: { entity: 'edge', type: creates },
            owner: { type: 'prompt', promptId, stageId },
          });
        }
        if (display) {
          usage = usage.concat(
            display.map((edge: string) => ({
              subject: { entity: 'edge', type: edge },
              owner: { type: 'prompt', promptId, stageId },
            })),
          );
        }

        return usage;
      },
    );
  },
);

const getTypeUsageIndex = createSelector(
  getFormTypeUsageIndex,
  getStageTypeUsageIndex,
  getPromptTypeUsageIndex,
  getSociogramTypeUsageIndex,
  (
    formTypeUsageIndex,
    stageTypeUsageIndex,
    promptTypeUsageIndex,
    sociogramTypeUsageIndex,
  ): SubjectUsageEntry[] => [
    ...formTypeUsageIndex,
    ...stageTypeUsageIndex,
    ...promptTypeUsageIndex,
    ...sociogramTypeUsageIndex,
  ],
);

const makeGetUsageForType = createSelector(
  getTypeUsageIndex,
  (typeUsageIndex) =>
    memoize(
      (searchEntity: string, searchType: string) =>
        typeUsageIndex.filter(
          ({ subject: { type, entity } }) =>
            type === searchType && entity === searchEntity,
        ),
      (searchEntity: string, searchType: string) =>
        `${searchEntity}:${searchType}`,
    ),
);

const perStagePromptCountFromUsage = (usage: SubjectUsageEntry[]) => {
  const prompts: string[] = [];

  return usage.reduce<Record<string, number>>((memo, { owner }) => {
    if (
      owner.type !== 'prompt' ||
      !owner.promptId ||
      prompts.includes(owner.promptId)
    ) {
      return memo;
    }

    const stageId = owner.stageId;
    if (!stageId) return memo;
    memo[stageId] = memo[stageId] ? memo[stageId] + 1 : 1;
    return memo;
  }, {});
};

const makeGetDeleteImpact = createSelector(
  getProtocol,
  makeGetUsageForType,
  (protocol, getUsageForType) =>
    memoize(
      (searchEntity: string, searchType: string) => {
        const usage = getUsageForType(searchEntity, searchType);

        const perStagePromptCount = perStagePromptCountFromUsage(usage);

        const stages = protocol?.stages ?? [];
        const additionallyDeletedStageIds = stages.reduce<string[]>(
          (memo, stage) => {
            const prompts =
              'prompts' in stage ? (stage.prompts as unknown[]) : undefined;
            if (!prompts || prompts.length !== perStagePromptCount[stage.id]) {
              return memo;
            }
            memo.push(stage.id);
            return memo;
          },
          [],
        );

        const deletedObjects = uniqBy(
          usage.map(({ owner }) => {
            if (
              owner.type === 'prompt' &&
              owner.stageId &&
              additionallyDeletedStageIds.includes(owner.stageId)
            ) {
              return { id: owner.stageId, type: 'stage' };
            }

            return owner;
          }),
          ({ type, ...owner }) =>
            owner.id
              ? `${owner.id}:${type}`
              : `${owner.stageId}:${owner.promptId}:${type}`,
        );

        return deletedObjects;
      },
      (searchEntity: string, searchType: string) =>
        `${searchEntity}:${searchType}`,
    ),
);

export {
  getSociogramTypeUsageIndex,
  getTypeUsageIndex,
  makeGetDeleteImpact,
  makeGetUsageForType,
};
