import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppIntl, formatMessageError } from '@codaco/app-i18n/messages';
import { SyntheticDataConstraintError } from '@codaco/protocol-utilities';
import { POST } from '~/app/api/generate-test-interviews/route';
import {
  syntheticGenerationEventSchema,
  syntheticGenerationFailureSchema,
} from '~/schemas/synthetic-interviews';
import { frescoCatalogs } from '~/src/locales/catalogs';

vi.mock('server-only', () => ({}));
const {
  requireApiAuth,
  findProtocol,
  createInterview,
  findInterviews,
  updateInterview,
  generateNetwork,
  addEvent,
} = vi.hoisted(() => ({
  requireApiAuth: vi.fn(),
  findProtocol: vi.fn(),
  createInterview: vi.fn(),
  findInterviews: vi.fn(),
  updateInterview: vi.fn(),
  generateNetwork: vi.fn(),
  addEvent: vi.fn(),
}));
vi.mock('~/lib/auth/guards', () => ({ requireApiAuth }));
vi.mock('~/lib/activityFeed', () => ({ addEvent }));
vi.mock('~/lib/db', () => ({
  prisma: {
    protocol: { findUnique: findProtocol },
    interview: {
      create: createInterview,
      findMany: findInterviews,
      update: updateInterview,
    },
  },
}));
vi.mock('@codaco/protocol-utilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@codaco/protocol-utilities')>()),
  generateNetwork,
}));

const request = (
  body = JSON.stringify({
    protocolId: 'protocol-1',
    count: 2,
    simulateDropOut: false,
  }),
) =>
  new Request('http://localhost/api/generate-test-interviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
const intl = (locale: string) =>
  createAppIntl({ locale, messages: frescoCatalogs[locale] });

beforeEach(() => {
  vi.resetAllMocks();
  requireApiAuth.mockResolvedValue({ user: { username: 'Researcher' } });
  findProtocol.mockResolvedValue({ name: 'Fixture', stages: [], codebook: {} });
  createInterview.mockResolvedValue({ id: 'created-interview-1' });
  generateNetwork.mockReturnValue({
    network: {},
    currentStep: 0,
    droppedOut: false,
  });
});

describe('synthetic generation failure transport', () => {
  it('returns an encoded authentication refusal without querying or generating', async () => {
    requireApiAuth.mockRejectedValue(new Error('Unauthorized'));
    const response = await POST(request());
    expect(response.status).toBe(401);
    const failure = syntheticGenerationFailureSchema.parse(
      await response.json(),
    );
    expect(formatMessageError(failure.error, intl('es'))).toBe(
      'Inicia sesión para generar entrevistas sintéticas.',
    );
    expect(findProtocol).not.toHaveBeenCalled();
    expect(generateNetwork).not.toHaveBeenCalled();
  });

  it.each(['{broken JSON', JSON.stringify({ count: -1 })])(
    'returns actionable encoded invalid-request guidance for %s',
    async (body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      const failure = syntheticGenerationFailureSchema.parse(
        await response.json(),
      );
      expect(formatMessageError(failure.error, intl('en'))).toBe(
        'The interview generation request is invalid. Reload the page and try again.',
      );
      expect(findProtocol).not.toHaveBeenCalled();
      expect(generateNetwork).not.toHaveBeenCalled();
    },
  );

  it('preserves the missing-protocol refusal instead of a generic generation failure', async () => {
    findProtocol.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(404);
    const failure = syntheticGenerationFailureSchema.parse(
      await response.json(),
    );
    expect(formatMessageError(failure.error, intl('es'))).toBe(
      'Este protocolo ya no está disponible. Selecciona otro protocolo.',
    );
    expect(findProtocol).toHaveBeenCalledWith({ where: { id: 'protocol-1' } });
    expect(generateNetwork).not.toHaveBeenCalled();
  });

  it('streams named constraints with owning-package reasons and retains the original diagnostic after partial creation', async () => {
    const error = new SyntheticDataConstraintError([
      {
        entity: 'node',
        entityTypeName: 'Personas',
        variableIds: ['age', 'height'],
        variableNames: ['Edad', 'Altura'],
        rules: ['minValue', 'maxValue'],
        reason: 'original diagnostic',
        reasonCode: 'invertedBounds',
      },
    ]);
    generateNetwork
      .mockReturnValueOnce({ network: {}, currentStep: 0, droppedOut: false })
      .mockImplementationOnce(() => {
        throw error;
      });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const stream = await response.text();
    const events = stream
      .trim()
      .split('\n\n')
      .map((event) =>
        syntheticGenerationEventSchema.parse(
          JSON.parse(event.slice('data: '.length)),
        ),
      );
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'progress', current: 1, total: 2 });
    const failure = events[1];
    expect(failure?.type).toBe('error');
    if (failure?.type !== 'error')
      throw new Error('Expected the failed generation event');
    expect(failure.details).toHaveLength(1);
    const detail = failure.details?.[0];
    if (!detail) throw new Error('Expected a structured constraint detail');
    expect(formatMessageError(detail.subject, intl('en'))).toBe(
      'Attributes on node type Personas: Edad and Altura',
    );
    expect(formatMessageError(detail.subject, intl('es'))).toBe(
      'Atributos del tipo de nodo Personas: Edad y Altura',
    );
    expect(formatMessageError(detail.reason, intl('es'))).toBe(
      'El mínimo supera el máximo, por lo que no se permite ninguna respuesta. Ajusta estos límites.',
    );
    expect(failure.diagnostic).toBe(error.message);
    expect(stream).toContain(`"message":${JSON.stringify(error.message)}`);
    expect(createInterview).toHaveBeenCalledOnce();
    expect(addEvent).not.toHaveBeenCalled();
  });
});

describe('the finish recorded for generated interviews', () => {
  const finishStage = {
    id: 'end-ineligible',
    type: 'FinishSession',
    label: { en: 'Finish' },
    title: { en: 'Finish' },
    content: { en: 'Thank you.' },
    outcome: 'ineligible',
  };
  const protocolWithFinish = {
    name: 'Fixture',
    codebook: {},
    stages: [{ id: 'info', type: 'Information' }, finishStage],
  };

  it('records the protocol’s finish stage and outcome on a completed interview, and none on one that dropped out', async () => {
    findProtocol.mockResolvedValue(protocolWithFinish);
    generateNetwork
      .mockReturnValueOnce({ network: {}, currentStep: 1, droppedOut: false })
      .mockReturnValueOnce({ network: {}, currentStep: 0, droppedOut: true });

    await (await POST(request())).text();

    const [completed, droppedOut] = createInterview.mock.calls.map(
      ([args]) => (args as { data: Record<string, unknown> }).data,
    );
    expect(completed).toMatchObject({
      finishStageId: 'end-ineligible',
      finishOutcome: 'ineligible',
    });
    expect(completed?.finishTime).toBeInstanceOf(Date);
    expect(droppedOut?.finishTime).toBeNull();
    expect(droppedOut).not.toHaveProperty('finishStageId');
    expect(droppedOut).not.toHaveProperty('finishOutcome');
  });

  it('records them when an interview that dropped out is completed to meet the minimum', async () => {
    findProtocol.mockResolvedValue(protocolWithFinish);
    generateNetwork.mockReturnValue({
      network: {},
      currentStep: 0,
      droppedOut: true,
    });
    findInterviews.mockResolvedValue([
      { id: 'created-interview-1', startTime: new Date() },
    ]);

    await (
      await POST(
        request(
          JSON.stringify({
            protocolId: 'protocol-1',
            count: 2,
            simulateDropOut: true,
          }),
        ),
      )
    ).text();

    expect(updateInterview).toHaveBeenCalledOnce();
    expect(updateInterview.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'created-interview-1' },
      data: {
        finishStageId: 'end-ineligible',
        finishOutcome: 'ineligible',
      },
    });
  });
});
