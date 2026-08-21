import { resolve } from 'path';
import dotenv from 'dotenv';
import type { Knex } from 'knex';

dotenv.config({
  path: resolve(__dirname, '..', '..', '.env'),
});

const sharedConfig: Omit<Knex.Config, 'migrations' | 'seeds'> = {
  client: process.env.DATABASE_CLIENT || 'mysql2',
  connection: {
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  },
  pool: {
    min: 2,
    max: 10,
  },
};

const config: Record<string, Knex.Config> = {
  development: {
    ...sharedConfig,
    migrations: {
      tableName: 'knex_migrations',
      directory: resolve(__dirname, 'migrations'),
    },
    seeds: {
      directory: resolve(__dirname, 'seeds'),
    },
  },
  production: {
    ...sharedConfig,
    migrations: {
      tableName: 'knex_migrations',
      directory: resolve(__dirname, 'migrations'),
    },
    seeds: {
      directory: resolve(__dirname, 'seeds'),
    },
  },
};

export default config;
