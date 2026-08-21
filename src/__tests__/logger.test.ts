describe('logger', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('exposes the standard pino methods in development (pretty transport)', () => {
    process.env.NODE_ENV = 'development';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logger } = require('../utils/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('exposes the standard pino methods in production (no transport)', () => {
    process.env.NODE_ENV = 'production';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logger } = require('../utils/logger');
    expect(typeof logger.info).toBe('function');
  });

  it('uses LOG_LEVEL from the environment when set', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logger } = require('../utils/logger');
    expect(logger.level).toBe('debug');
  });
});
