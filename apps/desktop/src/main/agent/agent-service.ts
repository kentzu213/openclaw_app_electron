import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { DatabaseManager } from '../db/database';
import { AuthManager } from '../auth/auth-manager';
import { ManagedAgentProvider } from './managed-agent-provider';
import type {
  AgentBootstrapPayload,
  AgentMemory,
  AgentRuntimeState,
  AgentSendMessageResult,
  AgentStreamEvent,
  AgentTask,
  AgentTaskStatus,
  ChatMessage,
  ChatSession,
  DiagnosticEvent,
} from './types';

const DEFAULT_SESSION_TITLE = 'Cuoc tro chuyen moi';

function buildSessionTitle(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= 42) {
    return compact;
  }
  return `${compact.slice(0, 39).trim()}...`;
}

export class AgentService extends EventEmitter {
  private db: DatabaseManager;
  private auth: AuthManager;
  private provider: ManagedAgentProvider;
  private activeRequestId: string | null = null;

  constructor(options: { db: DatabaseManager; auth: AuthManager }) {
    super();
    this.db = options.db;
    this.auth = options.auth;
    this.provider = new ManagedAgentProvider({
      getAccessToken: () => this.auth.getAccessToken(),
    });
  }

  async bootstrap(): Promise<AgentBootstrapPayload> {
    const session = this.db.getLatestChatSession();
    return {
      session,
      messages: session ? this.db.listChatMessages(session.id) : [],
      state: this.db.getAgentState(session?.id),
    };
  }

  async newSession(): Promise<ChatSession> {
    return this.db.createChatSession(DEFAULT_SESSION_TITLE, 'izziapi-managed');
  }

  async getStatus(sessionId?: string): Promise<AgentRuntimeState> {
    try {
      const remoteStatus = await this.provider.getStatus(sessionId);
      if (remoteStatus) {
        return this.db.upsertAgentState({
          sessionId,
          state: remoteStatus.state,
          lastError: remoteStatus.lastError,
          updatedAt: remoteStatus.updatedAt || new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn('[Agent] Remote status check failed:', error);
    }

    return this.db.getAgentState(sessionId);
  }

  listTasks(sessionId?: string): AgentTask[] {
    return this.db.listAgentTasks(sessionId);
  }

  updateTaskStatus(taskId: string, status: AgentTaskStatus): AgentTask | null {
    const task = this.db.updateAgentTaskStatus(taskId, status);
    if (task) {
      this.db.appendDiagnosticEvent({
        type: 'agent.task',
        status: 'info',
        detail: `Task ${task.id} moved to ${status}`,
        meta: { taskId: task.id, sessionId: task.sessionId },
      });
    }
    return task;
  }

  listMemories(sessionId?: string): AgentMemory[] {
    return this.db.listAgentMemories(sessionId);
  }

  pinMemory(memoryId: string, pinned: boolean): AgentMemory | null {
    return this.db.pinAgentMemory(memoryId, pinned);
  }

  deleteMemory(memoryId: string): { success: boolean } {
    this.db.deleteAgentMemory(memoryId);
    return { success: true };
  }

  getDiagnostics(limit = 50): DiagnosticEvent[] {
    return this.db.getDiagnosticEvents(limit);
  }

  async sendMessage(sessionId: string, text: string): Promise<AgentSendMessageResult> {
    const content = text.trim();
    if (!content) {
      throw new Error('Message cannot be empty');
    }

    if (this.activeRequestId) {
      throw new Error('Agent is already processing another request');
    }

    const session = this.db.getChatSession(sessionId);
    if (!session) {
      throw new Error('Chat session not found');
    }

    const requestId = randomUUID();
    const now = new Date().toISOString();
    const existingMessages = this.db.listChatMessages(sessionId);

    if (session.title === DEFAULT_SESSION_TITLE && existingMessages.length === 0) {
      this.db.renameChatSession(sessionId, buildSessionTitle(content));
    }

    const userMessage = this.db.insertChatMessage({
      sessionId,
      role: 'user',
      content,
      state: 'done',
      requestId,
      createdAt: now,
    });

    const assistantMessage = this.db.insertChatMessage({
      sessionId,
      role: 'assistant',
      content: '',
      state: 'streaming',
      requestId,
      createdAt: now,
    });

    this.activeRequestId = requestId;
    this.db.appendDiagnosticEvent({
      type: 'agent.chat',
      status: 'info',
      detail: `Started managed request ${requestId}`,
      meta: { sessionId },
    });

    this.emitStatus(requestId, sessionId, 'connecting');
    this.emitStream({
      requestId,
      sessionId,
      type: 'assistant_start',
      messageId: assistantMessage.id,
    });

    void this.runManagedRequest({
      requestId,
      sessionId,
      message: content,
      assistantMessage,
    });

    return {
      requestId,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  }

  private async runManagedRequest(input: {
    requestId: string;
    sessionId: string;
    message: string;
    assistantMessage: ChatMessage;
  }): Promise<void> {
    let receivedContent = false;
    let finalState: AgentRuntimeState['state'] = 'idle';
    let finalError: string | undefined;

    try {
      const currentUser = this.auth.getCurrentUser();
      const history = this.db
        .listChatMessages(input.sessionId)
        .filter((message) => message.id !== input.assistantMessage.id)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      this.emitStatus(input.requestId, input.sessionId, 'running');

      for await (const event of this.provider.streamChat({
        sessionId: input.sessionId,
        message: input.message,
        history,
        user: currentUser
          ? {
              id: currentUser.id,
              email: currentUser.email,
              name: currentUser.name,
            }
          : undefined,
      })) {
        if (event.type === 'status') {
          this.emitStatus(input.requestId, input.sessionId, event.state ?? 'running', event.error);
          continue;
        }

        if (event.type === 'assistant_start') {
          this.emitStream({
            requestId: input.requestId,
            sessionId: input.sessionId,
            type: 'assistant_start',
            messageId: input.assistantMessage.id,
          });
          continue;
        }

        if (event.type === 'assistant_delta') {
          const delta = event.delta ?? '';
          if (delta.length > 0) {
            receivedContent = true;
            this.db.appendAssistantDelta(input.assistantMessage.id, delta);
          }

          this.emitStream({
            requestId: input.requestId,
            sessionId: input.sessionId,
            type: 'assistant_delta',
            messageId: input.assistantMessage.id,
            delta,
          });
          continue;
        }

        if (event.type === 'task_upsert' && event.task) {
          const task = this.db.upsertAgentTask({
            ...event.task,
            sessionId: event.task.sessionId ?? input.sessionId,
            sourceMessageId: event.task.sourceMessageId ?? input.assistantMessage.id,
          });
          this.emitStream({
            requestId: input.requestId,
            sessionId: input.sessionId,
            type: 'task_upsert',
            task,
          });
          continue;
        }

        if (event.type === 'memory_upsert' && event.memory) {
          const memory = this.db.upsertAgentMemory({
            ...event.memory,
            sessionId: event.memory.sessionId ?? input.sessionId,
            sourceMessageId: event.memory.sourceMessageId ?? input.assistantMessage.id,
          });
          this.emitStream({
            requestId: input.requestId,
            sessionId: input.sessionId,
            type: 'memory_upsert',
            memory,
          });
          continue;
        }

        if (event.type === 'assistant_done') {
          this.db.setMessageState(input.assistantMessage.id, 'done');
          this.emitStream({
            requestId: input.requestId,
            sessionId: input.sessionId,
            type: 'assistant_done',
            messageId: input.assistantMessage.id,
          });
          this.emitStatus(input.requestId, input.sessionId, 'idle');
          this.db.appendDiagnosticEvent({
            type: 'agent.chat',
            status: 'success',
            detail: `Managed request ${input.requestId} completed`,
            meta: { sessionId: input.sessionId },
          });
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error || 'Agent stream failed');
        }
      }

      if (receivedContent) {
        this.db.setMessageState(input.assistantMessage.id, 'done');
        this.emitStream({
          requestId: input.requestId,
          sessionId: input.sessionId,
          type: 'assistant_done',
          messageId: input.assistantMessage.id,
        });
        this.emitStatus(input.requestId, input.sessionId, 'idle');
        this.db.appendDiagnosticEvent({
          type: 'agent.chat',
          status: 'success',
          detail: `Managed request ${input.requestId} completed without explicit done event`,
          meta: { sessionId: input.sessionId },
        });
        return;
      }

      throw new Error('Agent stream ended without any assistant content');
    } catch (error) {
      finalState = 'error';
      finalError = error instanceof Error ? error.message : 'Unknown agent error';
      this.db.setMessageState(input.assistantMessage.id, 'error');
      this.emitStatus(input.requestId, input.sessionId, 'error', finalError);
      this.emitStream({
        requestId: input.requestId,
        sessionId: input.sessionId,
        type: 'error',
        messageId: input.assistantMessage.id,
        error: finalError,
      });
      this.db.appendDiagnosticEvent({
        type: 'agent.chat',
        status: 'error',
        detail: finalError,
        meta: { sessionId: input.sessionId, requestId: input.requestId },
      });
    } finally {
      if (this.activeRequestId === input.requestId) {
        this.activeRequestId = null;
      }

      if (finalState === 'error') {
        this.db.upsertAgentState({
          sessionId: input.sessionId,
          state: 'error',
          lastError: finalError,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  private emitStatus(
    requestId: string,
    sessionId: string,
    state: AgentRuntimeState['state'],
    error?: string,
  ): void {
    const persisted = this.db.upsertAgentState({
      sessionId,
      state,
      lastError: error,
      updatedAt: new Date().toISOString(),
    });

    this.emitStream({
      requestId,
      sessionId,
      type: 'status',
      state: persisted.state,
      error: persisted.lastError,
    });
  }

  private emitStream(event: AgentStreamEvent): void {
    this.emit('stream', event);
  }
}
