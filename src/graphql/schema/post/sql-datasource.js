import DataLoader from 'dataloader';
import {
  AuthenticationError,
  UserInputError,
  ValidationError,
} from 'apollo-server-errors';
import { SQLDatasource } from '../../datasources/sql/sql-datasource';

const ALLOWED_SORT_COLUMNS = new Set([
  'id',
  'title',
  'user_id',
  'index_ref',
  'created_at',
]);

const postReducer = (row) => ({
  id: String(row.id),
  title: row.title,
  body: row.body,
  userId: String(row.user_id),
  indexRef: row.index_ref,
  createdAt: new Date(row.created_at).toISOString(),
});

export class PostSQLDataSource extends SQLDatasource {
  constructor(dbConnection) {
    super(dbConnection);
    this.tableName = 'posts';
    this._byUserIdLoader = new DataLoader(async (userIds) => {
      const rows = await this.db(this.tableName).whereIn('user_id', userIds);
      return userIds.map((uid) =>
        rows.filter((r) => String(r.user_id) === String(uid)).map(postReducer),
      );
    });
  }

  async getPosts({ _sort, _order, _start, _limit } = {}) {
    let query = this.db(this.tableName);
    if (_sort) {
      if (!ALLOWED_SORT_COLUMNS.has(_sort)) {
        throw new UserInputError(`Invalid sort column: ${_sort}`);
      }
      query = query.orderBy(_sort, _order || 'asc');
    }
    if (_start) query = query.offset(Number(_start));
    if (_limit) query = query.limit(Number(_limit));
    const rows = await query;
    return rows.map(postReducer);
  }

  async getPost(id) {
    const row = await this.db(this.tableName).where('id', id).first();
    if (!row) return null;
    return postReducer(row);
  }

  batchLoadByUserId(userId) {
    return this._byUserIdLoader.load(String(userId));
  }

  async createPost({ title, body, userId }) {
    if (!title || !body) {
      throw new ValidationError('title and body are required');
    }

    const [maxIndexRef] = await this.db(this.tableName).max('index_ref as val');
    const indexRef = (maxIndexRef.val || 0) + 1;

    const [id] = await this.db(this.tableName).insert({
      title,
      body,
      user_id: userId,
      index_ref: indexRef,
    });

    return this.getPost(id);
  }

  async updatePost(postId, { title, body }, loggedUserId) {
    const post = await this.getPost(postId);
    if (!post) {
      throw new ValidationError('Post not found');
    }
    if (post.userId !== String(loggedUserId)) {
      throw new AuthenticationError('You cannot update this post.');
    }

    const updates = {};
    if (typeof title !== 'undefined') {
      if (!title) throw new ValidationError('title cannot be empty');
      updates.title = title;
    }
    if (typeof body !== 'undefined') {
      if (!body) throw new ValidationError('body cannot be empty');
      updates.body = body;
    }

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No fields to update');
    }

    await this.db(this.tableName).where('id', postId).update(updates);
    return this.getPost(postId);
  }

  async deletePost(postId, loggedUserId) {
    const post = await this.getPost(postId);
    if (!post) {
      throw new ValidationError('Post not found');
    }
    if (post.userId !== String(loggedUserId)) {
      throw new AuthenticationError('You cannot delete this post.');
    }
    const deleted = await this.db(this.tableName).where('id', postId).delete();
    return deleted > 0;
  }
}
