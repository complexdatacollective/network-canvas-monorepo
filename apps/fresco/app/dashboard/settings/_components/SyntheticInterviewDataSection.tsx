'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { SuperJSON } from 'superjson';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { useToast } from '@codaco/fresco-ui/Toast';
import { ensureError } from '@codaco/shared-consts';
import {
  deleteSyntheticData,
  revalidateSyntheticData,
} from '~/actions/synthetic-interviews';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import SyntheticGenerationError from '~/components/SyntheticGenerationError';
import { syntheticGenerationMessages } from '~/i18n/syntheticGenerationMessages';
import {
  type GetProtocolsQuery,
  type GetProtocolsReturnType,
} from '~/queries/protocols';
import {
  MAX_SYNTHETIC_INTERVIEWS,
  syntheticGenerationEventSchema,
  syntheticGenerationFailureSchema,
  type SyntheticGenerationFailure,
} from '~/schemas/synthetic-interviews';

const messages = defineMessages({
  countLabel: {
    id: 'fresco.settings.synthetic.countLabel',
    defaultMessage: 'Number of interviews',
    description: 'Accessible label for the synthetic interview count field.',
  },
  copyGenerating: {
    id: 'fresco.settings.SyntheticInterviewDataSection.copyGenerating',
    defaultMessage: 'Generating...',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Generating...',
  },
  copyGenerate: {
    id: 'fresco.settings.SyntheticInterviewDataSection.copyGenerate',
    defaultMessage: 'Generate',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Generate',
  },
  copyDeleting: {
    id: 'fresco.settings.SyntheticInterviewDataSection.copyDeleting',
    defaultMessage: 'Deleting...',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Deleting...',
  },
  copyDeleteAll: {
    id: 'fresco.settings.SyntheticInterviewDataSection.copyDeleteAll',
    defaultMessage: 'Delete All',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Delete All',
  },
  generationFailed: {
    id: 'fresco.settings.SyntheticInterviewDataSection.generationFailed',
    defaultMessage: 'Generation failed',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Generation failed',
  },
  generationComplete: {
    id: 'fresco.settings.SyntheticInterviewDataSection.generationComplete',
    defaultMessage: 'Generation complete',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Generation complete',
  },
  successfullyGeneratedSyntheticInterviews: {
    id: 'fresco.settings.SyntheticInterviewDataSection.successfullyGeneratedSyntheticInterviews',
    defaultMessage:
      'Successfully generated {value1, plural, one {# synthetic interview} other {# synthetic interviews}}.',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Successfully generated value synthetic interviews.',
  },
  syntheticInterviewData: {
    id: 'fresco.settings.SyntheticInterviewDataSection.syntheticInterviewData',
    defaultMessage: 'Synthetic Interview Data',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Synthetic Interview Data',
  },
  generateTestInterviews: {
    id: 'fresco.settings.SyntheticInterviewDataSection.generateTestInterviews',
    defaultMessage: 'Generate Test Interviews',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Generate Test Interviews',
  },
  generateSyntheticInterviewDataForTestingSelect: {
    id: 'fresco.settings.SyntheticInterviewDataSection.generateSyntheticInterviewDataForTestingSelect',
    defaultMessage:
      'Generate synthetic interview data for testing. Select a protocol and specify how many interviews to create.',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Generate synthetic interview data for testing. Select a protocol and specify how many interviews to create.',
  },
  selectAProtocol: {
    id: 'fresco.settings.SyntheticInterviewDataSection.selectAProtocol',
    defaultMessage: 'Select a Protocol...',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Select a Protocol...',
  },
  interviewGenerationProgress: {
    id: 'fresco.settings.SyntheticInterviewDataSection.interviewGenerationProgress',
    defaultMessage: 'Interview generation progress',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Interview generation progress',
  },
  interviewsGenerated: {
    id: 'fresco.settings.SyntheticInterviewDataSection.interviewsGenerated',
    defaultMessage:
      '{value1, number} / {value2, plural, one {# interview generated} other {# interviews generated}}',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: value / value interviews generated',
  },
  simulateParticipantDropOut: {
    id: 'fresco.settings.SyntheticInterviewDataSection.simulateParticipantDropOut',
    defaultMessage: 'Simulate participant drop-out',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Simulate participant drop-out',
  },
  whenEnabledParticipantsHaveAnIncreasingChance: {
    id: 'fresco.settings.SyntheticInterviewDataSection.whenEnabledParticipantsHaveAnIncreasingChance',
    defaultMessage:
      'When enabled, participants have an increasing chance of abandoning the interview at each stage.',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: When enabled, participants have an increasing chance of abandoning the interview at each stage.',
  },
  respectSkipLogicAndFiltering: {
    id: 'fresco.settings.SyntheticInterviewDataSection.respectSkipLogicAndFiltering',
    defaultMessage: 'Respect skip logic and filtering',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Respect skip logic and filtering',
  },
  evaluateSkipLogicRulesAndStageNetwork: {
    id: 'fresco.settings.SyntheticInterviewDataSection.evaluateSkipLogicRulesAndStageNetwork',
    defaultMessage:
      'Evaluate skip logic rules and stage network filters during generation. Stages will be skipped or see filtered nodes based on the network state at that point.',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Evaluate skip logic rules and stage network filters during generation. Stages will be skipped or see filtered nodes base',
  },
  deleteTestInterviews: {
    id: 'fresco.settings.SyntheticInterviewDataSection.deleteTestInterviews',
    defaultMessage: 'Delete Test Interviews',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: Delete Test Interviews',
  },
  thereAreCurrentlySyntheticInterviewsAndTest: {
    id: 'fresco.settings.SyntheticInterviewDataSection.thereAreCurrentlySyntheticInterviewsAndTest',
    defaultMessage:
      'There are currently {value1, plural, one {# synthetic interview} other {# synthetic interviews}} and {value2, plural, one {# test participant} other {# test participants}}.',
    description:
      'Researcher-facing settings / SyntheticInterviewDataSection: There are currently value synthetic interviews and value test participants.',
  },
});

type SyntheticInterviewDataSectionProps = {
  protocolsPromise: GetProtocolsReturnType;
  initialCounts: { interviewCount: number; participantCount: number };
};

export default function SyntheticInterviewDataSection({
  protocolsPromise,
  initialCounts,
}: SyntheticInterviewDataSectionProps) {
  const intl = useAppIntl();

  const rawProtocols = use(protocolsPromise);
  const protocols = SuperJSON.parse<GetProtocolsQuery>(rawProtocols);

  const [selectedProtocolId, setSelectedProtocolId] = useState<string>();
  const [count, setCount] = useState(10);
  const [simulateDropOut, setSimulateDropOut] = useState(true);
  const [respectSkipLogicAndFiltering, setRespectSkipLogicAndFiltering] =
    useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [syntheticCounts, setSyntheticCounts] = useState(initialCounts);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    setSyntheticCounts({
      interviewCount: initialCounts.interviewCount,
      participantCount: initialCounts.participantCount,
    });
  }, [initialCounts.interviewCount, initialCounts.participantCount]);

  const showGenerationFailure = (failure: SyntheticGenerationFailure) => {
    toast({
      title: <AppMessage message={messages.generationFailed} />,
      description: <SyntheticGenerationError {...failure} />,
      variant: 'destructive',
    });
  };

  const handleGenerate = async () => {
    if (!selectedProtocolId) return;
    setIsGenerating(true);
    setProgress({ current: 0, total: count });

    try {
      const response = await fetch('/api/generate-test-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolId: selectedProtocolId,
          count,
          simulateDropOut,
          respectSkipLogicAndFiltering,
        }),
      });
      if (!response.ok) {
        showGenerationFailure(
          syntheticGenerationFailureSchema.parse(await response.json()),
        );
        return;
      }
      if (!response.body) throw new Error('Generation response has no body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const event of events) {
            const dataLine = event
              .split('\n')
              .find((line) => line.startsWith('data: '));
            if (!dataLine) continue;
            const data = syntheticGenerationEventSchema.parse(
              JSON.parse(dataLine.slice(6)),
            );
            if (data.type === 'progress') {
              setProgress({ current: data.current, total: data.total });
            } else if (data.type === 'error') {
              showGenerationFailure(data);
              return;
            } else {
              setSyntheticCounts((previous) => ({
                interviewCount: previous.interviewCount + data.created,
                participantCount: previous.participantCount + data.created,
              }));
              toast({
                title: <AppMessage message={messages.generationComplete} />,
                description: (
                  <AppMessage
                    message={messages.successfullyGeneratedSyntheticInterviews}
                    values={{ value1: data.created }}
                  />
                ),
                variant: 'success',
              });
              return;
            }
          }
        }
        throw new Error(
          'Generation stream ended without a completion or error event',
        );
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (error) {
      showGenerationFailure({
        error: createMessageError(syntheticGenerationMessages.interrupted),
        diagnostic: ensureError(error).message,
      });
    } finally {
      setIsGenerating(false);
      try {
        await revalidateSyntheticData();
      } catch {
        toast({
          title: (
            <AppMessage message={syntheticGenerationMessages.refreshFailed} />
          ),
          variant: 'destructive',
        });
      }
      router.refresh();
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteSyntheticData();
      if (result.error) {
        toast({
          title: <AppMessage message={commonMessages.genericError} />,
          description: <SyntheticGenerationError error={result.error} />,
          variant: 'destructive',
        });
        return;
      }
      setSyntheticCounts({ interviewCount: 0, participantCount: 0 });
    } catch (error) {
      toast({
        title: <AppMessage message={commonMessages.genericError} />,
        description: (
          <SyntheticGenerationError
            error={createMessageError(syntheticGenerationMessages.deleteFailed)}
            diagnostic={ensureError(error).message}
          />
        ),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const progressPercent =
    progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <SettingsCard
      id="synthetic-interview-data"
      title={intl.formatMessage(messages.syntheticInterviewData)}
      divideChildren
    >
      <SettingsField
        label={intl.formatMessage(messages.generateTestInterviews)}
        description={intl.formatMessage(
          messages.generateSyntheticInterviewDataForTestingSelect,
        )}
        testId="generate-synthetic-interviews"
      >
        <div className="tablet-landscape:flex-row flex flex-col gap-4">
          <SelectField
            aria-label={intl.formatMessage(messages.selectAProtocol)}
            name="Protocol"
            options={protocols.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            onChange={(value) => {
              if (typeof value === 'string') {
                setSelectedProtocolId(value);
              }
            }}
            value={selectedProtocolId}
            placeholder={intl.formatMessage(messages.selectAProtocol)}
            className="min-w-auto"
          />
          <InputField
            aria-label={intl.formatMessage(messages.countLabel)}
            name="count"
            type="number"
            min={1}
            max={MAX_SYNTHETIC_INTERVIEWS}
            value={String(count)}
            onChange={(value) => {
              const parsed = Number(value);
              if (Number.isNaN(parsed)) return;
              setCount(Math.min(Math.max(parsed, 1), MAX_SYNTHETIC_INTERVIEWS));
            }}
            disabled={isGenerating}
            className="shrink-0"
          />
          <Button
            disabled={!selectedProtocolId || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating
              ? intl.formatMessage(messages.copyGenerating)
              : intl.formatMessage(messages.copyGenerate)}
          </Button>
        </div>
        {isGenerating && (
          <div className="mt-4 space-y-2">
            <ProgressBar
              orientation="horizontal"
              percentProgress={progressPercent}
              nudge={false}
              label={intl.formatMessage(messages.interviewGenerationProgress)}
              className="h-2"
            />
            <p className="text-sm opacity-60">
              {intl.formatMessage(messages.interviewsGenerated, {
                value1: progress.current,
                value2: progress.total,
              })}
            </p>
          </div>
        )}
      </SettingsField>
      <SettingsField
        label={intl.formatMessage(messages.simulateParticipantDropOut)}
        description={intl.formatMessage(
          messages.whenEnabledParticipantsHaveAnIncreasingChance,
        )}
        testId="simulate-drop-out"
        control={
          <ToggleField
            aria-label={intl.formatMessage(messages.simulateParticipantDropOut)}
            value={simulateDropOut}
            onChange={(value) => setSimulateDropOut(value ?? true)}
            disabled={isGenerating}
          />
        }
      />
      <SettingsField
        label={intl.formatMessage(messages.respectSkipLogicAndFiltering)}
        description={intl.formatMessage(
          messages.evaluateSkipLogicRulesAndStageNetwork,
        )}
        testId="respect-skip-logic"
        control={
          <ToggleField
            aria-label={intl.formatMessage(
              messages.respectSkipLogicAndFiltering,
            )}
            value={respectSkipLogicAndFiltering}
            onChange={(value) =>
              setRespectSkipLogicAndFiltering(value ?? false)
            }
            disabled={isGenerating}
          />
        }
      />
      <SettingsField
        label={intl.formatMessage(messages.deleteTestInterviews)}
        description={intl.formatMessage(
          messages.thereAreCurrentlySyntheticInterviewsAndTest,
          {
            value1: syntheticCounts.interviewCount,
            value2: syntheticCounts.participantCount,
          },
        )}
        testId="delete-synthetic-interviews"
        control={
          <Button
            color="destructive"
            disabled={syntheticCounts.interviewCount === 0 || isDeleting}
            onClick={handleDelete}
          >
            {isDeleting
              ? intl.formatMessage(messages.copyDeleting)
              : intl.formatMessage(messages.copyDeleteAll)}
          </Button>
        }
      />
    </SettingsCard>
  );
}
