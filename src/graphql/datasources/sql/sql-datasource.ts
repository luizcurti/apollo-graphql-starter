import DataLoader from 'dataloader';
import type { Knex } from 'knex';

export interface DatasourceInitOptions {
  context?: unknown;
  cache?: unknown;
}

export class SQLDatasource<TKey = string, TValue = TKey> {
  db: Knex;
  context?: unknown;
  cache?: unknown;
  private _loader: DataLoader<TKey, TValue>;

  constructor(dbConnection: Knex) {
    this.db = dbConnection;
    this._loader = new DataLoader<TKey, TValue>(async (ids) =>
      this.batchLoaderCallback(ids),
    );
  }

  initialize({ context, cache }: DatasourceInitOptions = {}): void {
    this.context = context;
    this.cache = cache;
  }

  async batchLoad(id: TKey): Promise<TValue> {
    return this._loader.load(id);
  }

  async batchLoaderCallback(ids: readonly TKey[]): Promise<TValue[]> {
    return ids as unknown as TValue[];
  }
}
