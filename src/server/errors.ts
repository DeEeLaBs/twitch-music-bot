export type BotErrorCode =
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'RESOLVER_FAILED'
  | 'AUTH_REQUIRED'
  | 'COMPANION_UNAVAILABLE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL';

export interface BotErrorBody {
  success: false;
  code: BotErrorCode;
  error: string;
  details?: unknown;
}

export class BotError extends Error {
  public readonly code: BotErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: BotErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'BotError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorPayload(error: unknown, fallback = 'Interner Serverfehler.'):{status:number;body:BotErrorBody} {
  // Only map known body-parser failures; never expose the submitted body.
  if (error instanceof Error) {
    const { type, status } = error as Error & { type?: string; status?: number };
    if (type === 'entity.parse.failed' && status === 400) {
      return { status: 400, body: { success: false, code: 'VALIDATION', error: 'Ungültiges JSON.' } };
    }
    if (type === 'entity.too.large' && status === 413) {
      return { status: 413, body: { success: false, code: 'VALIDATION', error: 'Anfrage ist zu groß.' } };
    }
  }
  if (error instanceof BotError) {
    return {
      status: error.status,
      body: {
        success: false,
        code: error.code,
        error: error.message,
        ...(error.details === undefined ? {} : { details: error.details })
      }
    };
  }

  // ResolverError intentionally stays independent from the HTTP layer. Convert it
  // here by its stable public shape instead of coupling the resolver to Express.
  if (error instanceof Error && error.name === 'ResolverError') {
    const resolverCode = (error as Error & { code?: string }).code;
    return {
      status: 422,
      body: {
        success: false,
        code: 'RESOLVER_FAILED',
        error: error.message || 'Song konnte nicht aufgelöst werden.',
        ...(resolverCode ? { details: { resolverCode } } : {})
      }
    };
  }

  return {
    status: 500,
    body: {
      success: false,
      code: 'INTERNAL',
      error: fallback
    }
  };
}
