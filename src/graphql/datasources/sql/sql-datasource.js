import DataLoader from 'dataloader';

export class SQLDatasource {
  constructor(dbConnection) {
    this.db = dbConnection;
    this._loader = new DataLoader(async (ids) => this.batchLoaderCallback(ids));
  }

  initialize({ context, cache } = {}) {
    this.context = context;
    this.cache = cache;
  }

  async batchLoad(id) {
    return this._loader.load(id);
  }

  async batchLoaderCallback(_ids) {
    return _ids;
  }
}
