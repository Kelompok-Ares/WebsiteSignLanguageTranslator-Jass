import { AppError } from './errors';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: AppError;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private subscribers: Set<(entry: LogEntry) => void> = new Set();

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: unknown) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error instanceof AppError ? error : (error instanceof Error ? AppError.fromUnknown(error) : undefined),
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();

    this.subscribers.forEach(cb => cb(entry));

    // Console output
    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
    switch (level) {
      case 'debug': console.debug(prefix, message, context ?? ''); break;
      case 'info': console.info(prefix, message, context ?? ''); break;
      case 'warn': console.warn(prefix, message, context ?? ''); break;
      case 'error': console.error(prefix, message, context ?? '', error ?? ''); break;
    }
  }

  debug(message: string, context?: Record<string, unknown>) { this.log('debug', message, context); }
  info(message: string, context?: Record<string, unknown>) { this.log('info', message, context); }
  warn(message: string, context?: Record<string, unknown>) { this.log('warn', message, context); }
  error(message: string, error?: unknown, context?: Record<string, unknown>) { 
    this.log('error', message, context, error); 
  }

  getLogs(): LogEntry[] { return [...this.logs]; }
  clearLogs() { this.logs = []; }

  subscribe(cb: (entry: LogEntry) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }
}

export const logger = new Logger();

// Global error handler for uncaught errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    logger.error('Uncaught error', event.error, { filename: event.filename, lineno: event.lineno, colno: event.colno });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled rejection', event.reason);
  });
}

export function createModuleLogger(module: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => logger.debug(`[${module}] ${msg}`, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => logger.info(`[${module}] ${msg}`, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => logger.warn(`[${module}] ${msg}`, ctx),
    error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) => logger.error(`[${module}] ${msg}`, err, ctx),
  };
}