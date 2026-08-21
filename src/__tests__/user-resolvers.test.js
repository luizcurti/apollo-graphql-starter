import { userResolvers } from '../graphql/schema/user/resolvers';
import { AuthenticationError } from '../graphql/errors';

const mockUserDb = {
  getUser: jest.fn(),
  getUsers: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
};

const mockPostDb = {
  batchLoadByUserId: jest.fn(),
};

const makeCtx = (loggedUserId = '') => ({
  loggedUserId,
  dataSources: { userDb: mockUserDb, postDb: mockPostDb },
});

beforeEach(() => jest.clearAllMocks());

// ─── Query ──────────────────────────────────────────────────────────────────

describe('Query.user', () => {
  it('lança AuthenticationError quando não está autenticado', async () => {
    await expect(
      userResolvers.Query.user(null, { id: '1' }, makeCtx('')),
    ).rejects.toThrow(AuthenticationError);

    expect(mockUserDb.getUser).not.toHaveBeenCalled();
  });

  it('retorna o usuário pelo id quando autenticado', async () => {
    const user = { id: '1', userName: 'alice' };
    mockUserDb.getUser.mockResolvedValue(user);

    const result = await userResolvers.Query.user(
      null,
      { id: '1' },
      makeCtx('user1'),
    );

    expect(mockUserDb.getUser).toHaveBeenCalledWith('1');
    expect(result).toEqual(user);
  });

  it('retorna null quando usuário não existe', async () => {
    mockUserDb.getUser.mockResolvedValue(null);

    const result = await userResolvers.Query.user(
      null,
      { id: '999' },
      makeCtx('user1'),
    );

    expect(result).toBeNull();
  });
});

describe('Query.users', () => {
  it('lança AuthenticationError quando não está autenticado', async () => {
    await expect(
      userResolvers.Query.users(null, {}, makeCtx('')),
    ).rejects.toThrow(AuthenticationError);

    expect(mockUserDb.getUsers).not.toHaveBeenCalled();
  });

  it('retorna lista de usuários sem filtros quando autenticado', async () => {
    const users = [{ id: '1' }, { id: '2' }];
    mockUserDb.getUsers.mockResolvedValue(users);

    const result = await userResolvers.Query.users(
      null,
      { input: {} },
      makeCtx('user1'),
    );

    expect(mockUserDb.getUsers).toHaveBeenCalledWith({});
    expect(result).toHaveLength(2);
  });

  it('passa filtros de paginação para o datasource', async () => {
    mockUserDb.getUsers.mockResolvedValue([]);
    const input = { _sort: 'createdAt', _order: 'DESC', _start: 0, _limit: 10 };

    await userResolvers.Query.users(null, { input }, makeCtx('user1'));

    expect(mockUserDb.getUsers).toHaveBeenCalledWith(input);
  });

  it('retorna lista vazia quando não há usuários', async () => {
    mockUserDb.getUsers.mockResolvedValue([]);

    const result = await userResolvers.Query.users(null, {}, makeCtx('user1'));

    expect(result).toEqual([]);
  });
});

// ─── Mutations ───────────────────────────────────────────────────────────────

describe('Mutation.createUser', () => {
  it('cria e retorna o novo usuário', async () => {
    const data = {
      firstName: 'Alice',
      lastName: 'Silva',
      userName: 'alice',
      password: 'Pass1!',
    };
    const created = { id: '1', ...data };
    mockUserDb.createUser.mockResolvedValue(created);

    const result = await userResolvers.Mutation.createUser(
      null,
      { data },
      makeCtx(),
    );

    expect(mockUserDb.createUser).toHaveBeenCalledWith(data);
    expect(result).toEqual(created);
  });
});

describe('Mutation.updateUser', () => {
  it('lança AuthenticationError quando não está autenticado', async () => {
    await expect(
      userResolvers.Mutation.updateUser(
        null,
        { userId: '1', data: {} },
        makeCtx(''),
      ),
    ).rejects.toThrow(AuthenticationError);

    expect(mockUserDb.updateUser).not.toHaveBeenCalled();
  });

  it('lança AuthenticationError quando o usuário logado não é o dono', async () => {
    await expect(
      userResolvers.Mutation.updateUser(
        null,
        { userId: '1', data: {} },
        makeCtx('2'),
      ),
    ).rejects.toThrow(AuthenticationError);

    expect(mockUserDb.updateUser).not.toHaveBeenCalled();
  });

  it('atualiza quando o usuário logado é o dono', async () => {
    const updated = { id: '1', firstName: 'Nova' };
    mockUserDb.updateUser.mockResolvedValue(updated);

    const result = await userResolvers.Mutation.updateUser(
      null,
      { userId: '1', data: { firstName: 'Nova' } },
      makeCtx('1'),
    );

    expect(mockUserDb.updateUser).toHaveBeenCalledWith('1', {
      firstName: 'Nova',
    });
    expect(result).toEqual(updated);
  });
});

describe('Mutation.deleteUser', () => {
  it('lança AuthenticationError quando não está autenticado', async () => {
    await expect(
      userResolvers.Mutation.deleteUser(null, { userId: '1' }, makeCtx('')),
    ).rejects.toThrow(AuthenticationError);

    expect(mockUserDb.deleteUser).not.toHaveBeenCalled();
  });

  it('lança AuthenticationError quando o usuário logado não é o dono', async () => {
    await expect(
      userResolvers.Mutation.deleteUser(null, { userId: '1' }, makeCtx('2')),
    ).rejects.toThrow(AuthenticationError);

    expect(mockUserDb.deleteUser).not.toHaveBeenCalled();
  });

  it('deleta e retorna true quando o usuário logado é o dono', async () => {
    mockUserDb.deleteUser.mockResolvedValue(true);

    const result = await userResolvers.Mutation.deleteUser(
      null,
      { userId: '1' },
      makeCtx('1'),
    );

    expect(mockUserDb.deleteUser).toHaveBeenCalledWith('1');
    expect(result).toBe(true);
  });
});

// ─── Field Resolvers ─────────────────────────────────────────────────────────

describe('User.posts (field resolver)', () => {
  it('carrega os posts do usuário via DataLoader', async () => {
    const posts = [{ id: '10' }, { id: '11' }];
    mockPostDb.batchLoadByUserId.mockResolvedValue(posts);

    const result = await userResolvers.User.posts({ id: '1' }, null, makeCtx());

    expect(mockPostDb.batchLoadByUserId).toHaveBeenCalledWith('1');
    expect(result).toEqual(posts);
  });

  it('retorna array vazio quando usuário não tem posts', async () => {
    mockPostDb.batchLoadByUserId.mockResolvedValue([]);

    const result = await userResolvers.User.posts({ id: '1' }, null, makeCtx());

    expect(result).toEqual([]);
  });
});
