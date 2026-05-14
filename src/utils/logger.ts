import pino from 'pino';

const VALID_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
type Level = (typeof VALID_LEVELS)[number];

const resolveLevel = (): Level => {
  const fromEnv = process.env.LOG_LEVEL;
  if (fromEnv) {
    if ((VALID_LEVELS as readonly string[]).includes(fromEnv)) {
      return fromEnv as Level;
    }
    console.warn(
      `[Logger][resolveLevel] Invalid LOG_LEVEL='${fromEnv}', falling back to default. Valid values: ${VALID_LEVELS.join(', ')}`,
    );
  }
  return process.env.NODE_ENV === 'test' ? 'silent' : 'info';
};

export const logger = pino({
  level: resolveLevel(),
  base: undefined,
});
