'use client';

import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { SuperJSON } from 'superjson';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import { useToast } from '@codaco/fresco-ui/Toast';
import {
  deleteSyntheticData,
  revalidateSyntheticData,
} from '~/actions/synthetic-interviews';
import SettingsCard from '~/components/settings/SettingsCard';
import SettingsField from '~/components/settings/SettingsField';
import {
  type GetProtocolsQuery,
  type GetProtocolsReturnType,
} from '~/queries/protocols';

type SyntheticInterviewDataSectionProps = {
  protocolsPromise: GetProtocolsReturnType;
  initialCounts: { interviewCount: number; participantCount: number };
  /** The batch ceiling, read from the generator package by the server component. */
  maxInterviews: number;
};

export default function SyntheticInterviewDataSection({
  protocolsPromise,
  initialCounts,
  maxInterviews,
}: SyntheticInterviewDataSectionProps) {
  const rawProtocols = use(protocolsPromise);
  const protocols = SuperJSON.parse<GetProtocolsQuery>(rawProtocols);

  const [selectedProtocolId, setSelectedProtocolId] = useState<string>();
  const [count, setCount] = useState(10);
  // The token a finished batch reports (`<seed>-<YYYY-MM-DD>`, or a bare
  // seed): entering it regenerates that batch exactly. Opaque here — the
  // route parses and validates it, so the identity logic stays server-side
  // with the engine instead of being duplicated into this client bundle.
  const [batchToken, setBatchToken] = useState('');
  const [simulateDropOut, setSimulateDropOut] = useState(true);
  const [respectSkipLogicAndFiltering, setRespectSkipLogicAndFiltering] =
    useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    phase: 'generating' | 'saving';
  }>({ current: 0, total: 0, phase: 'generating' });
  // Optimistic while a batch runs, and reconciled the moment the server sends
  // a fresh count: `router.refresh()` re-renders this section's server parent
  // with the real figures, and holding the old state past that would leave the
  // panel describing a population the database does not have.
  const [syntheticCounts, setSyntheticCounts] = useState(initialCounts);
  const serverCounts = `${String(initialCounts.interviewCount)}:${String(initialCounts.participantCount)}`;
  const [lastServerCounts, setLastServerCounts] = useState(serverCounts);
  if (serverCounts !== lastServerCounts) {
    setLastServerCounts(serverCounts);
    setSyntheticCounts(initialCounts);
  }
  const { toast } = useToast();
  const router = useRouter();

  const handleGenerate = async () => {
    if (!selectedProtocolId) return;

    setIsGenerating(true);
    setProgress({ current: 0, total: count, phase: 'generating' });

    try {
      const response = await fetch('/api/generate-test-interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolId: selectedProtocolId,
          count,
          simulateDropOut,
          respectSkipLogicAndFiltering,
          ...(batchToken.trim() === ''
            ? {}
            : { batchToken: batchToken.trim() }),
        }),
      });

      if (!response.ok || !response.body) {
        const errorBody: unknown = await response.json().catch(() => null);
        const description =
          errorBody &&
          typeof errorBody === 'object' &&
          'error' in errorBody &&
          typeof errorBody.error === 'string'
            ? errorBody.error
            : 'Could not generate synthetic interviews.';
        toast({
          title: 'Generation failed',
          description,
          variant: 'destructive',
        });
        setIsGenerating(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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

          const data = JSON.parse(dataLine.slice(6)) as {
            type: string;
            phase?: 'generating' | 'saving';
            current?: number;
            total?: number;
            created?: number;
            participantsCreated?: number;
            seed?: number;
            batchToken?: string;
            message?: string;
          };

          if (data.type === 'progress' && data.current !== undefined) {
            setProgress({
              current: data.current,
              total: data.total ?? count,
              phase: data.phase ?? 'generating',
            });
          } else if (data.type === 'error' && data.message) {
            toast({
              title: 'Generation failed',
              description: data.message,
              variant: 'destructive',
            });
          } else if (data.type === 'complete' && data.created !== undefined) {
            const created = data.created;
            // A replayed batch reconnects to the participants its first run
            // created, so the route says how many people were actually added
            // rather than this assuming one per interview.
            const participantsCreated = data.participantsCreated ?? created;
            setSyntheticCounts((prev) => ({
              interviewCount: prev.interviewCount + created,
              participantCount: prev.participantCount + participantsCreated,
            }));
            toast({
              title: 'Generation complete',
              description:
                data.batchToken === undefined
                  ? `Successfully generated ${String(created)} synthetic interviews.`
                  : // The token is what makes a batch reproducible: entering
                    // it in the field above regenerates exactly the same
                    // interviews, dates included.
                    `Successfully generated ${String(created)} synthetic interviews (batch ${data.batchToken}).`,
              variant: 'success',
            });
          }
        }
      }
    } finally {
      setIsGenerating(false);
      await revalidateSyntheticData();
      router.refresh();
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteSyntheticData();
      if (!result.error) {
        setSyntheticCounts({ interviewCount: 0, participantCount: 0 });
      }
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
      title="Synthetic Interview Data"
      divideChildren
    >
      <SettingsField
        label="Generate Test Interviews"
        description="Generate synthetic interview data for testing. Select a protocol and specify how many interviews to create."
        testId="generate-synthetic-interviews"
      >
        <div className="tablet-landscape:flex-row flex flex-col gap-4">
          <SelectField
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
            placeholder="Select a Protocol..."
            className="min-w-auto"
          />
          <InputField
            name="count"
            type="number"
            min={1}
            max={maxInterviews}
            value={String(count)}
            onChange={(value) => {
              const parsed = Number(value);
              if (Number.isNaN(parsed)) return;
              setCount(Math.min(Math.max(parsed, 1), maxInterviews));
            }}
            disabled={isGenerating}
            className="shrink-0"
          />
          <Button
            disabled={!selectedProtocolId || isGenerating}
            onClick={handleGenerate}
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </div>
        {isGenerating && (
          <div className="mt-4 space-y-2">
            <ProgressBar
              orientation="horizontal"
              percentProgress={progressPercent}
              nudge={false}
              label="Interview generation progress"
              className="h-2"
            />
            <p className="text-sm opacity-60">
              {progress.current} / {progress.total} interviews{' '}
              {progress.phase === 'saving' ? 'saved' : 'generated'}
            </p>
          </div>
        )}
      </SettingsField>
      <SettingsField
        label="Batch token"
        description="Leave blank for a new batch each time. Every batch reports the token it ran on — enter that token to regenerate exactly the same interviews, dates included. A bare seed number pins the draws but dates the sessions around today."
        testId="synthetic-batch-token"
        control={
          <InputField
            name="batchToken"
            type="text"
            value={batchToken}
            onChange={(value) => setBatchToken(value ?? '')}
            disabled={isGenerating}
          />
        }
      />
      <SettingsField
        label="Simulate participant drop-out"
        description="When enabled, participants have an increasing chance of abandoning the interview at each stage."
        testId="simulate-drop-out"
        control={
          <ToggleField
            value={simulateDropOut}
            onChange={(value) => setSimulateDropOut(value ?? true)}
            disabled={isGenerating}
          />
        }
      />
      <SettingsField
        label="Respect skip logic and filtering"
        description="Evaluate skip logic rules and stage network filters during generation. Stages will be skipped or see filtered nodes based on the network state at that point."
        testId="respect-skip-logic"
        control={
          <ToggleField
            value={respectSkipLogicAndFiltering}
            onChange={(value) =>
              setRespectSkipLogicAndFiltering(value ?? false)
            }
            disabled={isGenerating}
          />
        }
      />
      <SettingsField
        label="Delete Test Interviews"
        description={`There are currently ${String(syntheticCounts.interviewCount)} synthetic interviews and ${String(syntheticCounts.participantCount)} test participants.`}
        testId="delete-synthetic-interviews"
        control={
          <Button
            color="destructive"
            disabled={syntheticCounts.interviewCount === 0 || isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? 'Deleting...' : 'Delete All'}
          </Button>
        }
      />
    </SettingsCard>
  );
}
