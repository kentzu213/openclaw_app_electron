import axios from 'axios';
import { parseManagedAgentStream } from './stream-parser';
import type {
  ManagedAgentStatus,
  ManagedAgentStreamRequest,
  ManagedProviderStreamChunk,
} from './types';

const API_BASE_URL =
  process.env.STARIZZI_API_URL ||
  process.env.OPENCLAW_API_URL ||
  'https://api.izziapi.com';

const DEFAULT_CHAT_URL = `${API_BASE_URL}/api/agent/chat`;
const DEFAULT_STATUS_URL = `${API_BASE_URL}/api/agent/status`;
const MOCK_AGENT_MODE =
  process.env.STARIZZI_MOCK_AGENT_MODE === 'true' ||
  process.env.STARIZZI_MOCK_AGENT_MODE === '1';

async function readStreamBody(stream: NodeJS.ReadableStream): Promise<string> {
  let body = '';
  for await (const chunk of stream) {
    body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  }
  return body.trim();
}

function normalizeStatusPayload(payload: unknown): ManagedAgentStatus | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const data = payload as Record<string, unknown>;
  const state = String(data.state ?? data.status ?? '').toLowerCase();

  if (state !== 'idle' && state !== 'connecting' && state !== 'running' && state !== 'error') {
    return null;
  }

  return {
    state,
    lastError: typeof data.lastError === 'string'
      ? data.lastError
      : typeof data.error === 'string'
        ? data.error
        : undefined,
    updatedAt: typeof data.updatedAt === 'string'
      ? data.updatedAt
      : typeof data.updated_at === 'string'
        ? data.updated_at
        : new Date().toISOString(),
  };
}

function buildRequestPayload(request: ManagedAgentStreamRequest) {
  return {
    sessionId: request.sessionId,
    message: request.message,
    history: request.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    provider: 'izziapi-managed',
    stream: true,
    client: 'starizzi-desktop',
    user: request.user,
  };
}

export class ManagedAgentProvider {
  private chatUrl: string;
  private statusUrl: string;
  private getAccessToken: () => Promise<string | null>;
  private mockMode: boolean;

  constructor(options: {
    getAccessToken: () => Promise<string | null>;
    chatUrl?: string;
    statusUrl?: string;
  }) {
    this.getAccessToken = options.getAccessToken;
    this.chatUrl = options.chatUrl || process.env.STARIZZI_AGENT_CHAT_URL || DEFAULT_CHAT_URL;
    this.statusUrl = options.statusUrl || process.env.STARIZZI_AGENT_STATUS_URL || DEFAULT_STATUS_URL;
    this.mockMode = MOCK_AGENT_MODE;
  }

  async *streamChat(
    request: ManagedAgentStreamRequest,
  ): AsyncGenerator<ManagedProviderStreamChunk> {
    if (this.mockMode) {
      yield { type: 'status', state: 'connecting' };
      await new Promise((resolve) => setTimeout(resolve, 70));
      yield { type: 'status', state: 'running' };
      yield { type: 'assistant_start' };
      await new Promise((resolve) => setTimeout(resolve, 80));
      yield { type: 'assistant_delta', delta: `Da nhan muc tieu: ${request.message}. ` };
      await new Promise((resolve) => setTimeout(resolve, 80));
      yield {
        type: 'task_upsert',
        task: {
          id: `task-${request.sessionId}`,
          sessionId: request.sessionId,
          title: 'Xac nhan release gate cho desktop app',
          status: 'in_progress',
          summary: 'Review updater, packaging va UAT checklist truoc khi phat hanh.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      yield {
        type: 'memory_upsert',
        memory: {
          id: `memory-${request.sessionId}`,
          sessionId: request.sessionId,
          kind: 'constraint',
          content: 'Managed runner la execution mode duy nhat trong desktop app.',
          pinned: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
      await new Promise((resolve) => setTimeout(resolve, 80));
      yield {
        type: 'assistant_delta',
        delta: 'Task va memory mock da duoc tao de phuc vu smoke validation.',
      };
      yield { type: 'assistant_done' };
      return;
    }

    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error('Missing IzziAPI access token');
    }

    const response = await axios.request<NodeJS.ReadableStream>({
      method: 'POST',
      url: this.chatUrl,
      data: buildRequestPayload(request),
      responseType: 'stream',
      validateStatus: () => true,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'text/event-stream, application/x-ndjson, application/json',
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    if (response.status >= 400) {
      const body = await readStreamBody(response.data);
      throw new Error(body || `Agent endpoint returned HTTP ${response.status}`);
    }

    const contentType = String(response.headers['content-type'] ?? '');
    yield* parseManagedAgentStream(response.data, contentType);
  }

  async getStatus(sessionId?: string): Promise<ManagedAgentStatus | null> {
    if (this.mockMode) {
      return {
        state: 'idle',
        updatedAt: new Date().toISOString(),
      };
    }

    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return null;
    }

    const response = await axios.get(this.statusUrl, {
      params: sessionId ? { sessionId } : undefined,
      validateStatus: () => true,
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (response.status >= 400) {
      throw new Error(`Status endpoint returned HTTP ${response.status}`);
    }

    return normalizeStatusPayload(response.data);
  }
}
