import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ManagedAgentProvider mock mode', () => {
  afterEach(() => {
    delete process.env.STARIZZI_MOCK_AGENT_MODE;
    vi.resetModules();
  });

  it('streams assistant text plus task and memory artifacts', async () => {
    process.env.STARIZZI_MOCK_AGENT_MODE = 'true';
    const { ManagedAgentProvider } = await import('./managed-agent-provider');

    const provider = new ManagedAgentProvider({
      getAccessToken: async () => 'mock-token',
    });

    const events = [];
    for await (const event of provider.streamChat({
      sessionId: 'session-1',
      message: 'Hoan tat smoke validation',
      history: [],
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'assistant_delta')).toBe(true);
    expect(events.some((event) => event.type === 'task_upsert')).toBe(true);
    expect(events.some((event) => event.type === 'memory_upsert')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'assistant_done' });
  });
});
