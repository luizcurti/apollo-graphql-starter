import { ValidationError } from '../graphql/errors';
import { CommentSQLDataSource } from '../graphql/schema/comment/datasources';

// mock pubSub para não precisar de Redis em teste
jest.mock('../graphql/pubsub', () => ({
  pubSub: { publish: jest.fn() },
  CREATED_COMMENT_TRIGGER: 'CREATED_COMMENT',
}));

import { pubSub } from '../graphql/pubsub';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeCommentRow = (overrides = {}) => ({
  id: 1,
  comment: 'Ótimo post!',
  user_id: '10',
  post_id: '5',
  created_at: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

const makeQb = (overrides = {}) => ({
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue([1]),
  ...overrides,
});

beforeEach(() => jest.clearAllMocks());

// ─── commentReducer (via getByPostId) ────────────────────────────────────────

describe('CommentSQLDataSource — commentReducer', () => {
  it('mapeia campos e formata createdAt como ISO string', async () => {
    const row = makeCommentRow();
    const qb = makeQb();
    // getByPostId faz await direto no query builder
    const db = jest.fn(() => Object.assign(Promise.resolve([row]), qb));
    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const results = await ds.getByPostId('5');

    expect(results[0].id).toBe(1);
    expect(results[0].comment).toBe('Ótimo post!');
    expect(results[0].user_id).toBe('10');
    expect(results[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── getById — bug fix: deve retornar single row ──────────────────────────────

describe('CommentSQLDataSource.getById', () => {
  it('retorna o comentário correto (não o query builder)', async () => {
    const row = makeCommentRow();
    const qb = {
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(row),
    };
    const db = jest.fn(() => qb);
    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.getById(1);

    // após o fix, deve retornar o objeto — não um query builder
    expect(result).toEqual(row);
    expect(qb.first).toHaveBeenCalled();
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('CommentSQLDataSource.create', () => {
  it('lança ValidationError quando comentário duplicado já existe', async () => {
    const qb = makeQb({
      where: jest.fn().mockReturnThis(),
      // simula exists como array com 1 item (já existe)
      then: undefined,
    });
    const db = jest.fn(() =>
      Object.assign(Promise.resolve([makeCommentRow()]), qb),
    );
    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    await expect(
      ds.create({ userId: '10', postId: '5', comment: 'Ótimo post!' }),
    ).rejects.toThrow(ValidationError);

    expect(qb.insert).not.toHaveBeenCalled();
  });

  it('insere e retorna o comentário quando não é duplicado', async () => {
    let callCount = 0;
    const db = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        // primeiro: check duplicata — retorna array vazio (não existe)
        return Object.assign(Promise.resolve([]), {
          where: jest.fn().mockReturnThis(),
        });
      }
      // segundo: insert
      return { insert: jest.fn().mockResolvedValue([99]) };
    });

    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.create({
      userId: '10',
      postId: '5',
      comment: 'Novo comentário',
      postOwner: 'owner1',
    });

    expect(result.id).toBe(99);
    expect(result.comment).toBe('Novo comentário');
    expect(result.user_id).toBe('10');
    expect(result.post_id).toBe('5');
  });

  it('publica evento no pubSub após criar comentário', async () => {
    let callCount = 0;
    const db = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Object.assign(Promise.resolve([]), {
          where: jest.fn().mockReturnThis(),
        });
      }
      return { insert: jest.fn().mockResolvedValue([42]) };
    });

    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    await ds.create({
      userId: '10',
      postId: '5',
      comment: 'Olá',
      postOwner: 'owner1',
    });

    expect(pubSub.publish).toHaveBeenCalledWith(
      'CREATED_COMMENT',
      expect.objectContaining({
        createdComment: expect.objectContaining({ id: 42 }),
        postOwner: 'owner1',
      }),
    );
  });

  it('passa postOwner como null quando não informado', async () => {
    let callCount = 0;
    const db = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Object.assign(Promise.resolve([]), {
          where: jest.fn().mockReturnThis(),
        });
      }
      return { insert: jest.fn().mockResolvedValue([43]) };
    });

    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    await ds.create({ userId: '10', postId: '5', comment: 'Olá' });

    expect(pubSub.publish).toHaveBeenCalledWith(
      'CREATED_COMMENT',
      expect.objectContaining({ postOwner: null }),
    );
  });
});

// ─── batchLoaderCallback ─────────────────────────────────────────────────────

describe('CommentSQLDataSource.batchLoaderCallback', () => {
  it('agrupa comentários por post_id corretamente', async () => {
    const rows = [
      makeCommentRow({ id: 1, post_id: '5', comment: 'A' }),
      makeCommentRow({ id: 2, post_id: '5', comment: 'B' }),
      makeCommentRow({ id: 3, post_id: '7', comment: 'C' }),
    ];

    const db = jest.fn(() =>
      Object.assign(Promise.resolve(rows), {
        whereIn: jest.fn().mockReturnThis(),
      }),
    );
    const ds = new CommentSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.batchLoaderCallback(['5', '7', '99']);

    expect(result[0]).toHaveLength(2); // post_id '5' tem 2 comentários
    expect(result[1]).toHaveLength(1); // post_id '7' tem 1 comentário
    expect(result[2]).toHaveLength(0); // post_id '99' não tem comentários
  });
});
