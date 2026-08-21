import bcrypt from 'bcrypt';
import type { Knex } from 'knex';
import { UserInputError, ValidationError } from '../graphql/errors';
import { UserSQLDataSource } from '../graphql/schema/user/sql-datasource';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeRow = (overrides = {}) => ({
  id: 1,
  first_name: 'Alice',
  last_name: 'Silva',
  user_name: 'alice.silva',
  password_hash: 'hash',
  token: '',
  index_ref: 1,
  created_at: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

const makeDb = (overrides = {}) => {
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockResolvedValue(1),
    max: jest.fn().mockResolvedValue([{ val: 0 }]),
  };

  const db = jest.fn(() => ({ ...queryBuilder, ...overrides }));
  db.mockImplementation(() => ({ ...queryBuilder, ...overrides }));
  return { db: db as unknown as Knex, queryBuilder };
};

const makeDs = (dbOverrides = {}) => {
  const { db } = makeDb(dbOverrides);
  const ds = new UserSQLDataSource(db);
  ds.initialize({ context: {}, cache: undefined });
  return { ds, db };
};

// ─── userReducer (via getUser) ────────────────────────────────────────────────

describe('UserSQLDataSource — userReducer', () => {
  it('mapeia campos snake_case para camelCase e converte id para string', async () => {
    const row = makeRow();
    const { db, queryBuilder } = makeDb();
    queryBuilder.first.mockResolvedValue(row);
    const ds = new UserSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.getUser(1);

    expect(result?.id).toBe('1');
    expect(result?.firstName).toBe('Alice');
    expect(result?.lastName).toBe('Silva');
    expect(result?.userName).toBe('alice.silva');
    expect(result?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('getUser retorna null quando linha não existe', async () => {
    const { db, queryBuilder } = makeDb();
    queryBuilder.first.mockResolvedValue(null);
    const ds = new UserSQLDataSource(db);
    ds.initialize({ context: {}, cache: undefined });

    const result = await ds.getUser(999);

    expect(result).toBeNull();
  });
});

// ─── getUsers / whitelist de _sort ───────────────────────────────────────────

describe('UserSQLDataSource.getUsers', () => {
  it('retorna lista de usuários sem filtros', async () => {
    // abordagem direta: mock db retornando rows
    const mockDb = jest.fn(() => {
      const q = {
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };
      // torna thenable (await q retorna rows)
      return Object.assign(Promise.resolve([makeRow(), makeRow({ id: 2 })]), q);
    });

    const ds2 = new UserSQLDataSource(mockDb as unknown as Knex);
    ds2.initialize({ context: {}, cache: undefined });

    const results = await ds2.getUsers({});
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[1].id).toBe('2');
  });

  it('lança UserInputError para coluna de ordenação não permitida', () => {
    const { ds } = makeDs();
    return expect(ds.getUsers({ _sort: 'password_hash' })).rejects.toThrow(
      UserInputError,
    );
  });

  it('lança UserInputError para tentativa de injeção em _sort', () => {
    const { ds } = makeDs();
    return expect(
      ds.getUsers({ _sort: 'id; DROP TABLE users; --' }),
    ).rejects.toThrow(UserInputError);
  });

  it('aceita colunas permitidas na whitelist', async () => {
    const allowed = [
      'id',
      'first_name',
      'last_name',
      'user_name',
      'index_ref',
      'created_at',
    ];

    for (const col of allowed) {
      const mockDb = jest.fn(() =>
        Object.assign(Promise.resolve([]), {
          orderBy: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
        }),
      );
      const ds = new UserSQLDataSource(mockDb as unknown as Knex);
      ds.initialize({ context: {}, cache: undefined });

      await expect(ds.getUsers({ _sort: col })).resolves.not.toThrow();
    }
  });
});

// ─── createUser ──────────────────────────────────────────────────────────────

describe('UserSQLDataSource.createUser', () => {
  it('lança ValidationError para userName inválido', () => {
    const { ds } = makeDs();
    return expect(
      ds.createUser({
        firstName: 'A',
        lastName: 'B',
        userName: '1invalid',
        password: 'Senha123',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('lança UserInputError para senha fraca', () => {
    const { ds } = makeDs();
    return expect(
      ds.createUser({
        firstName: 'A',
        lastName: 'B',
        userName: 'valid.user',
        password: '123',
      }),
    ).rejects.toThrow();
  });

  it('lança ValidationError quando userName já existe', async () => {
    const existingRow = makeRow();
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(existingRow),
      insert: jest.fn(),
      max: jest.fn().mockResolvedValue([{ val: 5 }]),
      update: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    await expect(
      ds.createUser({
        firstName: 'Alice',
        lastName: 'Silva',
        userName: 'alice.silva',
        password: 'Senha123',
      }),
    ).rejects.toThrow(ValidationError);

    expect(qb.insert).not.toHaveBeenCalled();
  });

  it('faz hash da senha com bcrypt antes de salvar', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest
        .fn()
        .mockResolvedValueOnce(null) // check duplicata
        .mockResolvedValueOnce(makeRow()), // getUser após insert
      insert: jest.fn().mockResolvedValue([10]),
      max: jest.fn().mockResolvedValue([{ val: 5 }]),
      update: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    await ds.createUser({
      firstName: 'Alice',
      lastName: 'Silva',
      userName: 'alice.silva',
      password: 'Senha123',
    });

    const insertCall = qb.insert.mock.calls[0][0];
    expect(insertCall).toHaveProperty('password_hash');
    expect(insertCall.password_hash).not.toBe('Senha123');
    // valida que é um hash bcrypt real
    const isValid = await bcrypt.compare('Senha123', insertCall.password_hash);
    expect(isValid).toBe(true);
  });

  it('não salva a senha em texto puro', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeRow()),
      insert: jest.fn().mockResolvedValue([10]),
      max: jest.fn().mockResolvedValue([{ val: 5 }]),
      update: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    await ds.createUser({
      firstName: 'Alice',
      lastName: 'Silva',
      userName: 'alice.silva',
      password: 'Senha123',
    });

    const insertCall = qb.insert.mock.calls[0][0];
    expect(insertCall).not.toHaveProperty('password');
    expect(insertCall.password_hash).not.toBe('Senha123');
  });

  it('calcula index_ref como MAX + 1', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeRow({ index_ref: 8 })),
      insert: jest.fn().mockResolvedValue([10]),
      max: jest.fn().mockResolvedValue([{ val: 7 }]),
      update: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    await ds.createUser({
      firstName: 'Alice',
      lastName: 'Silva',
      userName: 'alice.silva',
      password: 'Senha123',
    });

    const insertCall = qb.insert.mock.calls[0][0];
    expect(insertCall.index_ref).toBe(8); // MAX(7) + 1
  });
});

// ─── updateUser ──────────────────────────────────────────────────────────────

describe('UserSQLDataSource.updateUser', () => {
  it('lança ValidationError quando nenhum campo é passado', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(makeRow()),
      insert: jest.fn(),
      max: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    await expect(ds.updateUser('1', {})).rejects.toThrow(ValidationError);
    expect(qb.update).not.toHaveBeenCalled();
  });

  it('faz hash da nova senha ao atualizar', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNot: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(makeRow()),
      insert: jest.fn(),
      max: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    await ds.updateUser('1', { password: 'NovaSenha1' });

    const updateCall = qb.update.mock.calls[0][0];
    expect(updateCall).toHaveProperty('password_hash');
    expect(updateCall.password_hash).not.toBe('NovaSenha1');
    const isValid = await bcrypt.compare(
      'NovaSenha1',
      updateCall.password_hash,
    );
    expect(isValid).toBe(true);
  });
});

// ─── deleteUser ──────────────────────────────────────────────────────────────

describe('UserSQLDataSource.deleteUser', () => {
  it('retorna true quando linha é deletada', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      max: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(1),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    expect(await ds.deleteUser('1')).toBe(true);
  });

  it('retorna false quando usuário não existe', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      max: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(0),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };
    const db = jest.fn(() => qb);
    const ds = new UserSQLDataSource(db as unknown as Knex);
    ds.initialize({ context: {}, cache: undefined });

    expect(await ds.deleteUser('999')).toBe(false);
  });
});
