import bcrypt from 'bcrypt';
import DataLoader from 'dataloader';
import { UserInputError, ValidationError } from '../../errors';
import { SQLDatasource } from '../../datasources/sql/sql-datasource';
import {
  validateUserName,
  validateUserPassword,
} from './utils/user-repository';

const ALLOWED_SORT_COLUMNS = new Set([
  'id',
  'first_name',
  'last_name',
  'user_name',
  'index_ref',
  'created_at',
]);

const SORT_COLUMN_MAP = {
  id: 'id',
  firstName: 'first_name',
  lastName: 'last_name',
  userName: 'user_name',
  indexRef: 'index_ref',
  createdAt: 'created_at',
};

const resolveSort = (sort) => SORT_COLUMN_MAP[sort] ?? sort;

const userReducer = (row) => ({
  id: String(row.id),
  firstName: row.first_name,
  lastName: row.last_name,
  userName: row.user_name,
  passwordHash: row.password_hash,
  token: row.token,
  indexRef: row.index_ref,
  createdAt: new Date(row.created_at).toISOString(),
});

export class UserSQLDataSource extends SQLDatasource {
  constructor(dbConnection) {
    super(dbConnection);
    this.tableName = 'users';
    this._byIdLoader = new DataLoader(async (ids) => {
      const rows = await this.db(this.tableName).whereIn('id', ids);
      return ids.map((id) => {
        const row = rows.find((r) => String(r.id) === String(id));
        return row ? userReducer(row) : null;
      });
    });
    this._byUserNameLoader = new DataLoader(async (userNames) => {
      const rows = await this.db(this.tableName).whereIn(
        'user_name',
        userNames,
      );
      return userNames.map(
        (un) => rows.find((r) => r.user_name === un) || null,
      );
    });
  }

  async getUsers({ _sort, _order, _start, _limit } = {}) {
    let query = this.db(this.tableName);
    if (_sort) {
      const col = resolveSort(_sort);
      if (!ALLOWED_SORT_COLUMNS.has(col)) {
        throw new UserInputError(`Invalid sort column: ${_sort}`);
      }
      query = query.orderBy(col, _order || 'asc');
    }
    if (_start) query = query.offset(Number(_start));
    if (_limit) query = query.limit(Number(_limit));
    const rows = await query;
    return rows.map(userReducer);
  }

  async getUser(id) {
    const row = await this.db(this.tableName).where('id', id).first();
    if (!row) return null;
    return userReducer(row);
  }

  async getUserByUserName(userName) {
    const row = await this._byUserNameLoader.load(userName);
    if (!row) return null;
    return userReducer(row);
  }

  batchLoadById(id) {
    return this._byIdLoader.load(String(id));
  }

  async createUser({ firstName, lastName, userName, password }) {
    validateUserName(userName);
    validateUserPassword(password);

    const existing = await this.db(this.tableName)
      .where('user_name', userName)
      .first();
    if (existing) {
      throw new ValidationError(`userName ${userName} has already been taken`);
    }

    const [maxIndexRef] = await this.db(this.tableName).max('index_ref as val');
    const indexRef = (maxIndexRef.val || 0) + 1;

    const passwordHash = await bcrypt.hash(password, 12);

    const [id] = await this.db(this.tableName).insert({
      first_name: firstName,
      last_name: lastName,
      user_name: userName,
      password_hash: passwordHash,
      index_ref: indexRef,
    });

    return this.getUser(id);
  }

  async updateUser(userId, { firstName, lastName, userName, password }) {
    const updates = {};

    if (typeof firstName !== 'undefined') updates.first_name = firstName;
    if (typeof lastName !== 'undefined') updates.last_name = lastName;

    if (typeof userName !== 'undefined') {
      validateUserName(userName);
      const existing = await this.db(this.tableName)
        .where('user_name', userName)
        .whereNot('id', userId)
        .first();
      if (existing) {
        throw new ValidationError(
          `userName ${userName} has already been taken`,
        );
      }
      updates.user_name = userName;
    }

    if (typeof password !== 'undefined') {
      validateUserPassword(password);
      updates.password_hash = await bcrypt.hash(password, 12);
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No fields to update');
    }

    await this.db(this.tableName).where('id', userId).update(updates);
    return this.getUser(userId);
  }

  async deleteUser(userId) {
    const deleted = await this.db(this.tableName).where('id', userId).delete();
    return deleted > 0;
  }

  async setToken(userId, token) {
    await this.db(this.tableName).where('id', userId).update({ token });
  }

  async clearToken(userId) {
    await this.db(this.tableName).where('id', userId).update({ token: '' });
  }
}
