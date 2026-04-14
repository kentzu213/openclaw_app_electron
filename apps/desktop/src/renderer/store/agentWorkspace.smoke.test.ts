import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentWorkspaceStore } from './agentWorkspace';

type AgentListener = (event: any) => void;
type UpdaterListener = (state: any) => void;

function createElectronApi() {
  let agentListener: AgentListener | null = null;
  let updaterListener: UpdaterListener | null = null;
  let onboardingState: Record<string, any> = {
    shouldAutoOpen: true,
    hasPendingSetup: true,
    isCompleted: false,
  };

  return {
    api: {
      agent: {
        bootstrap: vi.fn(async () => ({
          session: {
            id: 'session-1',
            title: 'Release readiness',
            provider: 'izziapi-managed',
            createdAt: '2026-04-02T10:00:00.000Z',
            updatedAt: '2026-04-02T10:00:00.000Z',
          },
          messages: [],
          state: {
            sessionId: 'session-1',
            state: 'idle',
            updatedAt: '2026-04-02T10:00:00.000Z',
          },
        })),
        newSession: vi.fn(async () => ({
          id: 'session-2',
          title: 'New session',
          provider: 'izziapi-managed',
          createdAt: '2026-04-02T10:01:00.000Z',
          updatedAt: '2026-04-02T10:01:00.000Z',
        })),
        sendMessage: vi.fn(async () => ({
          requestId: 'req-1',
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
        })),
        getStatus: vi.fn(async () => ({
          sessionId: 'session-1',
          state: 'idle',
          updatedAt: '2026-04-02T10:00:00.000Z',
        })),
        listTasks: vi.fn(async () => []),
        updateTaskStatus: vi.fn(async (_taskId: string, status: string) => ({
          id: 'task-1',
          sessionId: 'session-1',
          title: 'Validate release',
          status,
          createdAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:04:00.000Z',
        })),
        listMemories: vi.fn(async () => []),
        pinMemory: vi.fn(async (_memoryId: string, pinned: boolean) => ({
          id: 'memory-1',
          sessionId: 'session-1',
          kind: 'constraint',
          content: 'Managed runner only',
          pinned,
          createdAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:05:00.000Z',
        })),
        deleteMemory: vi.fn(async () => ({ success: true })),
        getDiagnostics: vi.fn(async () => []),
        onStream: (listener: AgentListener) => {
          agentListener = listener;
          return () => {
            agentListener = null;
          };
        },
      },
      updater: {
        getState: vi.fn(async () => ({
          state: 'idle',
          version: '0.1.0',
        })),
        check: vi.fn(async () => ({
          state: 'available',
          version: '0.1.0',
          availableVersion: '0.1.1',
        })),
        download: vi.fn(async () => ({
          state: 'downloaded',
          version: '0.1.0',
          availableVersion: '0.1.1',
          progress: 100,
        })),
        quitAndInstall: vi.fn(async () => ({ success: true })),
        onState: (listener: UpdaterListener) => {
          updaterListener = listener;
          return () => {
            updaterListener = null;
          };
        },
      },
      onboarding: {
        getState: vi.fn(async () => onboardingState),
        markSeen: vi.fn(async () => {
          onboardingState = {
            ...onboardingState,
            shouldAutoOpen: false,
            seenAt: '2026-04-02T10:00:00.000Z',
          };
          return onboardingState;
        }),
        dismiss: vi.fn(async () => {
          onboardingState = {
            ...onboardingState,
            shouldAutoOpen: false,
            dismissedAt: '2026-04-02T10:02:00.000Z',
          };
          return onboardingState;
        }),
        complete: vi.fn(async () => {
          onboardingState = {
            ...onboardingState,
            shouldAutoOpen: false,
            hasPendingSetup: false,
            isCompleted: true,
            completedAt: '2026-04-02T10:03:00.000Z',
          };
          return onboardingState;
        }),
      },
      integrations: {
        list: vi.fn(async () => [
          { provider: 'telegram', status: 'connected', accountLabel: 'telegram workspace' },
          { provider: 'discord', status: 'disconnected' },
          { provider: 'zalo', status: 'disconnected' },
        ]),
        beginConnect: vi.fn(async () => ({ provider: 'telegram', url: 'https://izziapi.com/integrations/telegram' })),
        disconnect: vi.fn(async () => [
          { provider: 'telegram', status: 'disconnected' },
          { provider: 'discord', status: 'disconnected' },
          { provider: 'zalo', status: 'disconnected' },
        ]),
      },
    },
    emitAgent(event: any) {
      agentListener?.(event);
    },
    emitUpdater(state: any) {
      updaterListener?.(state);
    },
  };
}

describe('agent workspace smoke flow', () => {
  beforeEach(() => {
    const harness = createElectronApi();
    (globalThis as any).window = { electronAPI: harness.api };
    useAgentWorkspaceStore.getState().reset();
    (globalThis as any).__harness = harness;
  });

  it('bootstraps, streams artifacts, and tracks updater/onboarding state', async () => {
    const harness = (globalThis as any).__harness as ReturnType<typeof createElectronApi>;
    const store = useAgentWorkspaceStore.getState();

    store.ensureStream();
    store.ensureUpdaterStream();
    await store.bootstrap();
    await store.ensureOnboardingAutoOpen();

    expect(useAgentWorkspaceStore.getState().session?.id).toBe('session-1');
    expect(useAgentWorkspaceStore.getState().isOnboardingOpen).toBe(true);

    const sent = await store.sendMessage('Ship the release candidate');
    expect(sent).toBe(true);

    harness.emitAgent({
      requestId: 'req-1',
      sessionId: 'session-1',
      type: 'assistant_delta',
      messageId: 'assistant-1',
      delta: 'Preparing RC build. ',
    });
    harness.emitAgent({
      requestId: 'req-1',
      sessionId: 'session-1',
      type: 'task_upsert',
      task: {
        id: 'task-1',
        sessionId: 'session-1',
        title: 'Validate release',
        status: 'todo',
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
    });
    harness.emitAgent({
      requestId: 'req-1',
      sessionId: 'session-1',
      type: 'memory_upsert',
      memory: {
        id: 'memory-1',
        sessionId: 'session-1',
        kind: 'constraint',
        content: 'Managed runner only',
        pinned: true,
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
    });
    harness.emitAgent({
      requestId: 'req-1',
      sessionId: 'session-1',
      type: 'assistant_done',
      messageId: 'assistant-1',
    });
    harness.emitUpdater({
      state: 'downloaded',
      version: '0.1.0',
      availableVersion: '0.1.1',
      progress: 100,
    });

    expect(useAgentWorkspaceStore.getState().messages.at(-1)?.content).toContain('Preparing RC build.');
    expect(useAgentWorkspaceStore.getState().tasks).toHaveLength(1);
    expect(useAgentWorkspaceStore.getState().memories).toHaveLength(1);
    expect(useAgentWorkspaceStore.getState().updaterState.state).toBe('downloaded');

    await store.completeOnboarding();
    expect(useAgentWorkspaceStore.getState().onboardingState?.isCompleted).toBe(true);
  });
});
