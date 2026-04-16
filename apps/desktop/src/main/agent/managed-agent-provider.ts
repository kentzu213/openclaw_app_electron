import axios from 'axios';
import { parseManagedAgentStream } from './stream-parser';
import type {
  ManagedAgentStatus,
  ManagedAgentStreamRequest,
  ManagedProviderStreamChunk,
} from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const API_BASE_URL =
  process.env.STARIZZI_API_URL ||
  process.env.OPENCLAW_API_URL ||
  'https://api.izziapi.com';

// Use OpenAI-compatible /v1/chat/completions (this endpoint EXISTS on izziapi.com)
const DEFAULT_CHAT_URL = `${API_BASE_URL}/v1/chat/completions`;
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

/**
 * Read local ~/.openclaw/openclaw.json for API key
 * The izzi-openclaw installer sets the API key here
 */
function getLocalApiKey(): string | null {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    if (!fs.existsSync(configPath)) return null;
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return config.apiKey || null;
  } catch {
    return null;
  }
}

/**
 * Build OpenAI-compatible /v1/chat/completions payload.
 * 
 * izziapi.com exposes OpenAI-compatible endpoints:
 * - /v1/chat/completions (streaming SSE)
 * - /v1/models
 * 
 * The payload follows OpenAI format: { model, messages, stream }
 * Auth uses x-api-key header (izzi API key from OpenClaw config)
 */
function buildOpenAIPayload(request: ManagedAgentStreamRequest) {
  const messages = [
    ...request.history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: request.message,
    },
  ];

  return {
    model: 'auto', // izzi Smart Router selects best model
    messages,
    stream: true,
  };
}

export class ManagedAgentProvider {
  private chatUrl: string;
  private getAccessToken: () => Promise<string | null>;
  private mockMode: boolean;

  constructor(options: {
    getAccessToken: () => Promise<string | null>;
    chatUrl?: string;
  }) {
    this.getAccessToken = options.getAccessToken;
    this.chatUrl = options.chatUrl || process.env.STARIZZI_AGENT_CHAT_URL || DEFAULT_CHAT_URL;
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

    // Get API key — prefer local OpenClaw config (set by installer),
    // fallback to Supabase access token
    const localApiKey = getLocalApiKey();
    const accessToken = await this.getAccessToken();

    if (!localApiKey && !accessToken) {
      throw new Error('Missing IzziAPI access token or API key. Run the izzi-openclaw installer first.');
    }

    // Build auth headers
    // izziapi.com uses x-api-key for API key auth (from installer)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };

    if (localApiKey) {
      headers['x-api-key'] = localApiKey;
    } else if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await axios.request<NodeJS.ReadableStream>({
      method: 'POST',
      url: this.chatUrl,
      data: buildOpenAIPayload(request),
      responseType: 'stream',
      validateStatus: () => true,
      headers,
      timeout: 120000,
    });

    if (response.status >= 400) {
      const body = await readStreamBody(response.data);
      throw new Error(body || `Chat completions endpoint returned HTTP ${response.status}`);
    }

    const contentType = String(response.headers['content-type'] ?? '');

    // Handle OpenAI SSE format: data: {"choices":[{"delta":{"content":"..."}}]}
    if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
      yield { type: 'status', state: 'running' };
      yield { type: 'assistant_start' };

      let buffer = '';
      for await (const rawChunk of response.data) {
        buffer += Buffer.isBuffer(rawChunk) ? rawChunk.toString('utf8') : String(rawChunk);

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments and empty lines

          if (trimmed === 'data: [DONE]') {
            yield { type: 'assistant_done' };
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.slice(6);
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                yield { type: 'assistant_delta', delta };
              }

              // Check for finish_reason
              const finishReason = parsed.choices?.[0]?.finish_reason;
              if (finishReason === 'stop') {
                yield { type: 'assistant_done' };
                return;
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim() === 'data: [DONE]') {
        yield { type: 'assistant_done' };
      } else {
        yield { type: 'assistant_done' };
      }
    } else {
      // Fallback: try the original stream parser for non-SSE responses
      yield* parseManagedAgentStream(response.data, contentType);
    }
  }

  async getStatus(_sessionId?: string): Promise<ManagedAgentStatus | null> {
    if (this.mockMode) {
      return {
        state: 'idle',
        updatedAt: new Date().toISOString(),
      };
    }

    // Status is managed locally — no /api/agent/status endpoint exists
    // Return idle status since we use direct /v1/chat/completions streaming
    return {
      state: 'idle',
      updatedAt: new Date().toISOString(),
    };
  }
}
