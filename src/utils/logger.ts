import pino from 'pino';

const VALID_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
type Level = (typeof VALID_LEVELS)[number];

const resolveLevel = (): Level => {
  const fromEnv = process.env.LOG_LEVEL;
  if (fromEnv && (VALID_LEVELS as readonly string[]).includes(fromEnv)) {
    return fromEnv as Level;
  }
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
};

export const logger = pino({
  level: resolveLevel(),
  base: undefined,
});

export type Logger = typeof logger;
