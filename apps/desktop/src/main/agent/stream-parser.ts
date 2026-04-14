import type {
  AgentMemory,
  AgentTask,
  ManagedProviderStreamChunk,
} from './types';

function chunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }

  if (Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8');
  }

  return String(chunk ?? '');
}

function normalizeEventName(eventName?: string): ManagedProviderStreamChunk['type'] | undefined {
  switch ((eventName ?? '').toLowerCase()) {
    case 'status':
      return 'status';
    case 'assistant_start':
    case 'start':
      return 'assistant_start';
    case 'assistant_delta':
    case 'delta':
    case 'message':
    case 'token':
      return 'assistant_delta';
    case 'assistant_done':
    case 'done':
    case 'complete':
      return 'assistant_done';
    case 'task_upsert':
    case 'task':
      return 'task_upsert';
    case 'memory_upsert':
    case 'memory':
      return 'memory_upsert';
    case 'error':
      return 'error';
    default:
      return undefined;
  }
}

function safeJsonParse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

function normalizeTask(payload: unknown): AgentTask | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.id !== 'string' || typeof data.title !== 'string') return null;

  const status = String(data.status ?? '').toLowerCase();
  if (status !== 'todo' && status !== 'in_progress' && status !== 'blocked' && status !== 'done') {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: data.id,
    sessionId: typeof data.sessionId === 'string'
      ? data.sessionId
      : typeof data.session_id === 'string'
        ? data.session_id
        : undefined,
    title: data.title,
    status,
    summary: typeof data.summary === 'string' ? data.summary : undefined,
    sourceMessageId: typeof data.sourceMessageId === 'string'
      ? data.sourceMessageId
      : typeof data.source_message_id === 'string'
        ? data.source_message_id
        : undefined,
    createdAt: typeof data.createdAt === 'string'
      ? data.createdAt
      : typeof data.created_at === 'string'
        ? data.created_at
        : now,
    updatedAt: typeof data.updatedAt === 'string'
      ? data.updatedAt
      : typeof data.updated_at === 'string'
        ? data.updated_at
        : now,
  };
}

function normalizeMemory(payload: unknown): AgentMemory | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.id !== 'string' || typeof data.content !== 'string') return null;

  const kind = String(data.kind ?? '').toLowerCase();
  if (kind !== 'fact' && kind !== 'preference' && kind !== 'constraint' && kind !== 'resource') {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: data.id,
    sessionId: typeof data.sessionId === 'string'
      ? data.sessionId
      : typeof data.session_id === 'string'
        ? data.session_id
        : undefined,
    kind,
    content: data.content,
    pinned: data.pinned === true || data.pinned === 1 || data.pinned === '1',
    sourceMessageId: typeof data.sourceMessageId === 'string'
      ? data.sourceMessageId
      : typeof data.source_message_id === 'string'
        ? data.source_message_id
        : undefined,
    createdAt: typeof data.createdAt === 'string'
      ? data.createdAt
      : typeof data.created_at === 'string'
        ? data.created_at
        : now,
    updatedAt: typeof data.updatedAt === 'string'
      ? data.updatedAt
      : typeof data.updated_at === 'string'
        ? data.updated_at
        : now,
  };
}

function normalizeParsedPayload(payload: unknown, eventName?: string): ManagedProviderStreamChunk | null {
  const normalizedEvent = normalizeEventName(eventName);

  if (typeof payload === 'string') {
    if (payload === '[DONE]') {
      return { type: 'assistant_done' };
    }

    if (normalizedEvent === 'error') {
      return { type: 'error', error: payload };
    }

    if (normalizedEvent === 'status') {
      const lowered = payload.toLowerCase();
      if (lowered === 'idle' || lowered === 'connecting' || lowered === 'running' || lowered === 'error') {
        return { type: 'status', state: lowered };
      }
    }

    return payload.trim().length > 0 ? { type: normalizedEvent ?? 'assistant_delta', delta: payload } : null;
  }

  if (!payload || typeof payload !== 'object') {
    return normalizedEvent === 'assistant_done' ? { type: 'assistant_done' } : null;
  }

  const data = payload as Record<string, unknown>;
  const explicitType = normalizeEventName(typeof data.type === 'string' ? data.type : undefined);
  const resolvedType = explicitType ?? normalizedEvent;

  if (resolvedType === 'task_upsert') {
    const task = normalizeTask(data.task ?? data);
    return task ? { type: 'task_upsert', task } : null;
  }

  if (resolvedType === 'memory_upsert') {
    const memory = normalizeMemory(data.memory ?? data);
    return memory ? { type: 'memory_upsert', memory } : null;
  }

  if (resolvedType === 'status' || typeof data.state === 'string') {
    const state = String(data.state ?? '').toLowerCase();
    if (state === 'idle' || state === 'connecting' || state === 'running' || state === 'error') {
      return {
        type: 'status',
        state,
        error: typeof data.error === 'string' ? data.error : undefined,
      };
    }
  }

  if (resolvedType === 'assistant_start') {
    return { type: 'assistant_start' };
  }

  if (resolvedType === 'assistant_done' || data.done === true || data.finished === true) {
    return { type: 'assistant_done' };
  }

  if (resolvedType === 'error' || typeof data.error === 'string') {
    return {
      type: 'error',
      error: typeof data.error === 'string' ? data.error : 'Agent stream error',
    };
  }

  const delta =
    typeof data.delta === 'string'
      ? data.delta
      : typeof data.content === 'string'
        ? data.content
        : typeof data.text === 'string'
          ? data.text
          : typeof data.token === 'string'
            ? data.token
            : undefined;

  if (delta !== undefined) {
    return { type: 'assistant_delta', delta };
  }

  if (resolvedType === 'assistant_delta') {
    return { type: 'assistant_delta', delta: '' };
  }

  return null;
}

function parseStructuredPayload(rawPayload: string, eventName?: string): ManagedProviderStreamChunk | null {
  const parsed = safeJsonParse(rawPayload);
  if (parsed !== undefined) {
    return normalizeParsedPayload(parsed, eventName);
  }

  if (rawPayload.trim().startsWith('{') || rawPayload.trim().startsWith('[')) {
    return {
      type: 'error',
      error: 'Malformed structured stream chunk',
    };
  }

  return normalizeParsedPayload(rawPayload, eventName);
}

async function* parseSseStream(stream: NodeJS.ReadableStream): AsyncGenerator<ManagedProviderStreamChunk> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunkToString(chunk);

    let separatorIndex = buffer.search(/\r?\n\r?\n/);
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      const separator = buffer.slice(separatorIndex, separatorIndex + 4).includes('\r\n\r\n') ? 4 : 2;
      buffer = buffer.slice(separatorIndex + separator);

      const lines = block.split(/\r?\n/);
      let eventName: string | undefined;
      const dataLines: string[] = [];

      for (const line of lines) {
        if (!line || line.startsWith(':')) continue;

        const separatorPosition = line.indexOf(':');
        if (separatorPosition === -1) continue;

        const field = line.slice(0, separatorPosition);
        const value = line.slice(separatorPosition + 1).trimStart();

        if (field === 'event') {
          eventName = value;
        }
        if (field === 'data') {
          dataLines.push(value);
        }
      }

      if (dataLines.length > 0) {
        const event = parseStructuredPayload(dataLines.join('\n'), eventName);
        if (event) {
          yield event;
        }
      } else if (normalizeEventName(eventName) === 'assistant_done') {
        yield { type: 'assistant_done' };
      }

      separatorIndex = buffer.search(/\r?\n\r?\n/);
    }
  }

  if (buffer.trim().length > 0) {
    const event = parseStructuredPayload(buffer.trim());
    if (event) {
      yield event;
    }
  }
}

async function* parseNdjsonStream(stream: NodeJS.ReadableStream): AsyncGenerator<ManagedProviderStreamChunk> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunkToString(chunk);

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        const event = parseStructuredPayload(line);
        if (event) {
          yield event;
        }
      }

      newlineIndex = buffer.indexOf('\n');
    }
  }

  const finalLine = buffer.trim();
  if (finalLine.length > 0) {
    const event = parseStructuredPayload(finalLine);
    if (event) {
      yield event;
    }
  }
}

export async function* parseManagedAgentStream(
  stream: NodeJS.ReadableStream,
  contentType?: string,
): AsyncGenerator<ManagedProviderStreamChunk> {
  const normalizedContentType = (contentType ?? '').toLowerCase();

  if (normalizedContentType.includes('text/event-stream')) {
    yield* parseSseStream(stream);
    return;
  }

  yield* parseNdjsonStream(stream);
}
