export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, AppError);
  }

  static fromUnknown(err: unknown, fallbackCode = 'UNKNOWN_ERROR'): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof Response) {
      return new AppError(
        `HTTP ${err.status}: ${err.statusText}`,
        'HTTP_ERROR',
        err.status
      );
    }
    if (err instanceof Error) {
      return new AppError(err.message, fallbackCode, undefined, err);
    }
    return new AppError(String(err), fallbackCode);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

export class NetworkError extends AppError {
  constructor(message: string, public readonly endpoint?: string) {
    super(message, 'NETWORK_ERROR', 0);
    this.name = 'NetworkError';
  }
}

export class WebSocketError extends AppError {
  constructor(message: string, public readonly wsCode?: number) {
    super(message, 'WEBSOCKET_ERROR', wsCode);
    this.name = 'WebSocketError';
  }
}

export class TrainingError extends AppError {
  constructor(message: string, public readonly epoch?: number) {
    super(message, 'TRAINING_ERROR');
    this.name = 'TrainingError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

export function withErrorBoundary<T>(
  fn: () => Promise<T>,
  context: string
): Promise<{ data: T | null; error: AppError | null }> {
  return fn()
    .then((data) => ({ data, error: null }))
    .catch((err) => ({ data: null, error: AppError.fromUnknown(err, `${context.toUpperCase()}_ERROR`) }));
}