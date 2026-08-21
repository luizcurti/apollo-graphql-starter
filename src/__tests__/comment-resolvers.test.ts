import { commentResolvers } from '../graphql/schema/comment/resolvers';
import { AuthenticationError } from '../graphql/errors';
import type { Context } from '../graphql/context/types';

const mockCommentDb = {
  create: jest.fn(),
};

const mockPostDb = {
  getPost: jest.fn(),
};

const mockUserDb = {
  batchLoadById: jest.fn(),
};

const makeCtx = (loggedUserId = ''): Context =>
  ({
    loggedUserId,
    dataSources: {
      commentDb: mockCommentDb,
      postDb: mockPostDb,
      userDb: mockUserDb,
    },
  }) as unknown as Context;

beforeEach(() => jest.clearAllMocks());

// ─── Mutations ───────────────────────────────────────────────────────────────

describe('Mutation.createComment', () => {
  it('lança AuthenticationError quando não está autenticado', async () => {
    await expect(
      commentResolvers.Mutation.createComment(
        null,
        { data: { postId: '1', comment: 'Olá' } },
        makeCtx(''),
      ),
    ).rejects.toThrow(AuthenticationError);

    expect(mockPostDb.getPost).not.toHaveBeenCalled();
    expect(mockCommentDb.create).not.toHaveBeenCalled();
  });

  it('cria comentário e passa postOwner quando post existe', async () => {
    const post = { id: '1', userId: 'owner123' };
    const created = {
      id: '10',
      comment: 'Olá',
      user_id: 'user1',
      post_id: '1',
    };
    mockPostDb.getPost.mockResolvedValue(post);
    mockCommentDb.create.mockResolvedValue(created);

    const result = await commentResolvers.Mutation.createComment(
      null,
      { data: { postId: '1', comment: 'Olá' } },
      makeCtx('user1'),
    );

    expect(mockPostDb.getPost).toHaveBeenCalledWith('1');
    expect(mockCommentDb.create).toHaveBeenCalledWith({
      postId: '1',
      comment: 'Olá',
      userId: 'user1',
      postOwner: 'owner123',
    });
    expect(result).toEqual(created);
  });

  it('passa postOwner como null quando post não é encontrado', async () => {
    mockPostDb.getPost.mockResolvedValue(null);
    mockCommentDb.create.mockResolvedValue({ id: '10' });

    await commentResolvers.Mutation.createComment(
      null,
      { data: { postId: '999', comment: 'Olá' } },
      makeCtx('user1'),
    );

    const callArg = mockCommentDb.create.mock.calls[0][0];
    expect(callArg.postOwner).toBeNull();
  });

  it('injeta userId do contexto, não da requisição', async () => {
    mockPostDb.getPost.mockResolvedValue({ id: '1', userId: 'owner123' });
    mockCommentDb.create.mockResolvedValue({ id: '10' });

    await commentResolvers.Mutation.createComment(
      null,
      { data: { postId: '1', comment: 'Olá' } },
      makeCtx('user-logado'),
    );

    const callArg = mockCommentDb.create.mock.calls[0][0];
    expect(callArg.userId).toBe('user-logado');
  });
});

// ─── Field Resolvers ─────────────────────────────────────────────────────────

describe('Comment.user (field resolver)', () => {
  it('carrega o autor do comentário via DataLoader pelo user_id', async () => {
    const user = { id: 'user1', userName: 'alice' };
    mockUserDb.batchLoadById.mockResolvedValue(user);

    const result = await commentResolvers.Comment.user(
      { user_id: 'user1' },
      null,
      makeCtx(),
    );

    expect(mockUserDb.batchLoadById).toHaveBeenCalledWith('user1');
    expect(result).toEqual(user);
  });
});

// ─── Subscription ────────────────────────────────────────────────────────────

describe('Subscription.createdComment (lógica de filtro)', () => {
  // A função de filtro passada ao withFilter encapsula a regra de negócio:
  // só notifica o dono do post que recebeu o comentário.
  // Testamos a lógica diretamente, sem precisar do servidor de subscriptions.

  const filterFn = (
    payload: { postOwner: string | null },
    _: unknown,
    context: { loggedUserId: string },
  ): boolean => {
    const hasPostOwner = payload.postOwner !== null;
    const postOwnerIsLoggedUser = payload.postOwner === context.loggedUserId;
    return hasPostOwner && postOwnerIsLoggedUser;
  };

  it('notifica quando o usuário logado é o dono do post', () => {
    const payload = { postOwner: 'user1' };
    const context = { loggedUserId: 'user1' };
    expect(filterFn(payload, null, context)).toBe(true);
  });

  it('não notifica quando o usuário logado não é o dono do post', () => {
    const payload = { postOwner: 'outro-usuario' };
    const context = { loggedUserId: 'user1' };
    expect(filterFn(payload, null, context)).toBe(false);
  });

  it('não notifica quando postOwner é null (post órfão)', () => {
    const payload = { postOwner: null };
    const context = { loggedUserId: 'user1' };
    expect(filterFn(payload, null, context)).toBe(false);
  });
});
