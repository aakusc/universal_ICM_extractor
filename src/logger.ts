/**
 * Simple structured logger with levels.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const currentLevel = LogLevel.INFO;

function formatMessage(level: string, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (currentLevel <= LogLevel.DEBUG) {
      console.debug(formatMessage('DEBUG', message, meta));
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (currentLevel <= LogLevel.INFO) {
      console.log(formatMessage('INFO', message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (currentLevel <= LogLevel.WARN) {
      console.warn(formatMessage('WARN', message, meta));
    }
  },

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (currentLevel <= LogLevel.ERROR) {
      const errorMeta = error ? { 
        ...meta, 
        message: error.message, 
        stack: error.stack?.split('\n').slice(0, 3).join('\n') 
      } : meta;
      console.error(formatMessage('ERROR', message, errorMeta));
    }
  },

  /** Create a contextual logger with pre-attached metadata */
  withContext(meta: Record<string, unknown>) {
    return {
      debug: (msg: string, extra?: Record<string, unknown>) => logger.debug(msg, { ...meta, ...extra }),
      info: (msg: string, extra?: Record<string, unknown>) => logger.info(msg, { ...meta, ...extra }),
      warn: (msg: string, extra?: Record<string, unknown>) => logger.warn(msg, { ...meta, ...extra }),
      error: (msg: string, err?: Error, extra?: Record<string, unknown>) => logger.error(msg, err, { ...meta, ...extra }),
    };
  }
};

/**
 * Wrap an async function with consistent error handling.
 * Returns a tuple of [result, error] for easier error handling.
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  context: string
): Promise<[T, null] | [null, Error]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Error in ${context}`, error, { context });
    return [null, error];
  }
}

/**
 * Wrap a sync function with consistent error handling.
 */
export function tryCatchSync<T>(
  fn: () => T,
  context: string
): [T, null] | [null, Error] {
  try {
    const result = fn();
    return [result, null];
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Error in ${context}`, error, { context });
    return [null, error];
  }
}
