export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryable = false,
  ) {
    super(code);
  }
}

// Parse syntax before shape validation: JSON.parse alone accepts duplicate keys.
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
      request.headers.get('content-type') ?? '',
    ) ||
    !['', 'identity'].includes((request.headers.get('content-encoding') ?? '').toLowerCase())
  )
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError('VALIDATION_ERROR', 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new ApiError('PAYLOAD_TOO_LARGE', 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('MALFORMED_REQUEST', 400);
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new ApiError('VALIDATION_ERROR', 422);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ApiError('MALFORMED_REQUEST', 400);
  }
  let at = 0,
    nodes = 0;
  const malformed = () => {
    throw new ApiError('MALFORMED_REQUEST', 400);
  };
  const whitespace = () => {
    while (/[\x20\x09\x0a\x0d]/.test(text[at] ?? '') && at < text.length) at++;
  };
  const string = (): string => {
    const start = at++;
    let closed = false;
    while (at < text.length) {
      const char = text[at++];
      if (char === '\\') at++;
      else if (char === '"') {
        closed = true;
        break;
      }
    }
    if (!closed) return malformed();
    let value: string;
    try {
      value = JSON.parse(text.slice(start, at));
    } catch {
      return malformed();
    }
    if (/[\ud800-\udfff]/u.test(value)) return malformed();
    return value;
  };
  const value = (depth: number): void => {
    whitespace();
    if (++nodes > 10000) throw new ApiError('PAYLOAD_TOO_LARGE', 413);
    const char = text[at];
    if (char === '{' || char === '[') {
      if (depth > 32) throw new ApiError('PAYLOAD_TOO_LARGE', 413);
      const object = char === '{',
        end = object ? '}' : ']';
      const keys = new Set<string>();
      at++;
      whitespace();
      if (text[at] === end) {
        at++;
        return;
      }
      while (true) {
        if (object) {
          if (text[at] !== '"') return malformed();
          const key = string();
          if (keys.has(key)) return malformed();
          keys.add(key);
          whitespace();
          if (text[at++] !== ':') return malformed();
        }
        whitespace();
        const childContainer = text[at] === '{' || text[at] === '[';
        value(depth + Number(childContainer));
        whitespace();
        if (text[at] === end) {
          at++;
          break;
        }
        if (text[at++] !== ',') return malformed();
        whitespace();
      }
    } else if (char === '"') string();
    else {
      const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(at),
      );
      if (!match) return malformed();
      at += match[0].length;
      if (!['true', 'false', 'null'].includes(match[0]) && !Number.isFinite(Number(match[0])))
        return malformed();
    }
  };
  value(1);
  whitespace();
  if (at !== text.length) return malformed();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return malformed();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ApiError('VALIDATION_ERROR', 422);
  return parsed as Record<string, unknown>;
}
