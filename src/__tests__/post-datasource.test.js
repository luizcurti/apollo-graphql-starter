import {
  AuthenticationError,
  UserInputError,
  ValidationError,
} from 'apollo-server-errors';
import { PostSQLDataSource } from '../graphql/schema/post/sql-datasource';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeRow = (overrides = {}) => ({
  id: 1,
  title: 'Título',
  body: 'Corpo do post',
  user_id: 10,
  index_ref: 1,
  created_at: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

const makeQb = (overrides = {}) => ({
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockResolvedValue(1),
  delete: jest.fn().mockResolvedValue(1),
  max: jest.fn().mockResolvedValue([{ val: 0 }]),
  ...overrides,
});

const makeDs = (qbOverrides = {}) => {
  const qb = makeQb(qbOverrides);
  const db = jest.fn(() => qb);
  const ds = new PostSQLDataSource(db);
  ds.initialize({ context: {}, cache: undefined });
  return { ds, db, qb };
};

// ─── postReducer (via getPost) ────────────────────────────────────────────────

describe('PostSQLDataSource — postReducer', () => {
  it('mapeia campos e converte id/userId para string', async () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(makeRow());

    const result = await ds.getPost(1);

    expect(result.id).toBe('1');
    expect(result.userId).toBe('10');
    expect(result.title).toBe('Título');
    expect(result.body).toBe('Corpo do post');
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('getPost retorna null quando não encontrado', async () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(null);

    expect(await ds.getPost(999)).toBeNull();
  });
});

// ─── getPosts / whitelist de _sort ───────────────────────────────────────────

describe('PostSQLDataSource.getPosts — whitelist _sort', () => {
  it('lança UserInputError para coluna não permitida', () => {
    const { ds } = makeDs();
    return expect(ds.getPosts({ _sort: 'body' })).rejects.toThrow(
      UserInputError,
    );
  });

  it('lança UserInputError para tentativa de injeção', () => {
    const { ds } = makeDs();
    return expect(
      ds.getPosts({ _sort: 'title; DROP TABLE posts; --' }),
    ).rejects.toThrow(UserInputError);
  });

  it('aceita todas as colunas da whitelist', async () => {
    const allowed = ['id', 'title', 'user_id', 'index_ref', 'created_at'];

    for (const col of allowed) {
      const mockDb = jest.fn(() =>
        Object.assign(Promise.resolve([]), {
          orderBy: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
        }),
      );
      const ds = new PostSQLDataSource(mockDb);
      ds.initialize({ context: {}, cache: undefined });

      await expect(ds.getPosts({ _sort: col })).resolves.not.toThrow();
    }
  });
});

// ─── createPost ──────────────────────────────────────────────────────────────

describe('PostSQLDataSource.createPost', () => {
  it('lança ValidationError quando title está vazio', () => {
    const { ds } = makeDs();
    return expect(
      ds.createPost({ title: '', body: 'Corpo', userId: '1' }),
    ).rejects.toThrow(ValidationError);
  });

  it('lança ValidationError quando body está vazio', () => {
    const { ds } = makeDs();
    return expect(
      ds.createPost({ title: 'Título', body: '', userId: '1' }),
    ).rejects.toThrow(ValidationError);
  });

  it('insere com os campos corretos e retorna o post criado', async () => {
    const qb = makeQb({
      first: jest.fn().mockResolvedValueOnce(makeRow()), // getPost após insert
      insert: jest.fn().mockResolvedValue([42]),
      max: jest.fn().mockResolvedValue([{ val: 9 }]),
    });
    const db = jest.fn(() => qb);
    const ds = new PostSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.createPost({
      title: 'Título',
      body: 'Corpo',
      userId: '10',
    });

    const insertCall = qb.insert.mock.calls[0][0];
    expect(insertCall.title).toBe('Título');
    expect(insertCall.body).toBe('Corpo');
    expect(insertCall.user_id).toBe('10');
    expect(insertCall.index_ref).toBe(10); // MAX(9) + 1
    expect(result).toBeDefined();
  });
});

// ─── updatePost ──────────────────────────────────────────────────────────────

describe('PostSQLDataSource.updatePost', () => {
  it('lança ValidationError quando post não existe', () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(null);

    return expect(
      ds.updatePost('999', { title: 'X' }, 'user1'),
    ).rejects.toThrow(ValidationError);
  });

  it('lança AuthenticationError quando loggedUserId não é o dono', () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(makeRow({ user_id: 10 }));

    return expect(ds.updatePost('1', { title: 'X' }, '99')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('lança ValidationError quando nenhum campo é passado', () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(makeRow({ user_id: 10 }));

    return expect(ds.updatePost('1', {}, '10')).rejects.toThrow(
      ValidationError,
    );
  });

  it('lança ValidationError quando title é string vazia', () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(makeRow({ user_id: 10 }));

    return expect(ds.updatePost('1', { title: '' }, '10')).rejects.toThrow(
      ValidationError,
    );
  });

  it('atualiza apenas os campos fornecidos', async () => {
    const qb = makeQb({
      first: jest
        .fn()
        .mockResolvedValueOnce(makeRow({ user_id: 10 })) // getPost para verificação
        .mockResolvedValueOnce(makeRow({ title: 'Novo' })), // getPost de retorno
      update: jest.fn().mockResolvedValue(1),
    });
    const db = jest.fn(() => qb);
    const ds = new PostSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.updatePost('1', { title: 'Novo' }, '10');

    const updateCall = qb.update.mock.calls[0][0];
    expect(updateCall).toEqual({ title: 'Novo' });
    expect(updateCall).not.toHaveProperty('body');
    expect(result.title).toBe('Novo');
  });
});

// ─── deletePost ──────────────────────────────────────────────────────────────

describe('PostSQLDataSource.deletePost', () => {
  it('lança ValidationError quando post não existe', () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(null);

    return expect(ds.deletePost('999', 'user1')).rejects.toThrow(
      ValidationError,
    );
  });

  it('lança AuthenticationError quando loggedUserId não é o dono', () => {
    const { ds, qb } = makeDs();
    qb.first.mockResolvedValue(makeRow({ user_id: 10 }));

    return expect(ds.deletePost('1', '99')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('retorna true quando deletado com sucesso', async () => {
    const qb = makeQb({
      first: jest.fn().mockResolvedValue(makeRow({ user_id: 10 })),
      delete: jest.fn().mockResolvedValue(1),
    });
    const db = jest.fn(() => qb);
    const ds = new PostSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    expect(await ds.deletePost('1', '10')).toBe(true);
  });

  it('retorna false quando delete afeta 0 linhas', async () => {
    const qb = makeQb({
      first: jest.fn().mockResolvedValue(makeRow({ user_id: 10 })),
      delete: jest.fn().mockResolvedValue(0),
    });
    const db = jest.fn(() => qb);
    const ds = new PostSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    expect(await ds.deletePost('1', '10')).toBe(false);
  });
});
