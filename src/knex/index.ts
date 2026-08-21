import knexFn from 'knex';
import knexfile from './knexfile';

const env = process.env.NODE_ENV;
const envConfig = env ? knexfile[env] : undefined;
if (!env || !envConfig) {
  throw new Error(
    `Invalid or missing NODE_ENV: "${env}". Must be one of: ${Object.keys(
      knexfile,
    ).join(', ')}.`,
  );
}

export const knex = knexFn(envConfig);
