/**
 * Simple logging utility
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const defaultLevel = process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug;
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || defaultLevel;

function log(level, message, ...args)
{
  if (LOG_LEVELS[level] <= currentLevel)
  {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    console[level](
      `[${ timestamp }] ${ levelStr }: ${ message }`,
      ...args,
    );
  }
}

export const logger = {
  error: (message, ...args) => log("error", message, ...args),
  warn: (message, ...args) => log("warn", message, ...args),
  info: (message, ...args) => log("info", message, ...args),
  debug: (message, ...args) => log("debug", message, ...args),
};
