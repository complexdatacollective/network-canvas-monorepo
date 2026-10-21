import {
  type JobModels,
  type JobStep,
  STEP_IDS,
  type StepId,
} from '../shared/api.ts';

export const STEP_TITLES: Record<StepId, string> = {
  read: 'Reading your research questions',
  design: 'Designing the study',
  wording: 'Writing titles and prompts',
  compile: 'Building the protocol',
  validate: 'Checking it against schema 9',
};

// Who does each step, for the chip on its row.
export const stepWho = (id: StepId, labels: JobModels | null): string => {
  switch (id) {
    case 'read':
      return 'Sketch';
    case 'design':
      return labels?.design ?? 'Design model';
    case 'wording':
      return labels?.wording ?? 'Wording model';
    case 'compile':
      return 'Compiler';
    case 'validate':
      return 'Protocol validation';
  }
};

// Before the first poll answers: the first step is under way.
export const initialSteps = (): JobStep[] =>
  STEP_IDS.map((id, index) => ({
    id,
    state: index === 0 ? 'active' : 'pending',
    detail: index === 0 ? 'Starting…' : 'Waiting',
  }));

export const stepProgress = (steps: JobStep[]) => {
  const done = steps.filter((step) => step.state === 'done').length;
  const activeIndex = steps.findIndex(
    (step) => step.state === 'active' || step.state === 'failed',
  );
  return {
    done,
    percent: Math.round((done / steps.length) * 100),
    current: Math.min(
      steps.length,
      activeIndex === -1 ? done + 1 : activeIndex + 1,
    ),
  };
};
