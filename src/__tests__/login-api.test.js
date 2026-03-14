import bcrypt from 'bcrypt';
import { LoginApi } from '../graphql/schema/login/datasources';
import { loginResolvers } from '../graphql/schema/login/resolvers';
import { AuthenticationError, UserInputError } from 'apollo-server-errors';

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
}));

const mockUserDb = {
  getUserByUserName: jest.fn(),
  setToken: jest.fn(),
  clearToken: jest.fn(),
};

const mockRes = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
};

const makeApi = (loggedUserId = '') => {
  const api = new LoginApi();
  api.initialize({
    context: {
      loggedUserId,
      res: mockRes,
      dataSources: { userDb: mockUserDb },
    },
    cache: undefined,
  });
  return api;
};

beforeEach(() => jest.clearAllMocks());

// ─── Login ───────────────────────────────────────────────────────────────────

describe('LoginApi.login — usuário não existe', () => {
  it('lança AuthenticationError', async () => {
    mockUserDb.getUserByUserName.mockResolvedValue(null);

    await expect(makeApi().login('fantasma', 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.login — senha incorreta', () => {
  it('lança AuthenticationError', async () => {
    const hash = await bcrypt.hash('SenhaCorreta1', 1);
    mockUserDb.getUserByUserName.mockResolvedValue({
      id: '1',
      passwordHash: hash,
    });

    await expect(
      makeApi().login('alice_login', 'SenhaErrada1'),
    ).rejects.toThrow(AuthenticationError);
  });
});

describe('LoginApi.login — credenciais válidas', () => {
  it('retorna userId e token, e define cookie httpOnly', async () => {
    const hash = await bcrypt.hash('SenhaValida1', 1);
    mockUserDb.getUserByUserName.mockResolvedValue({
      id: '42',
      passwordHash: hash,
    });
    mockUserDb.setToken.mockResolvedValue();

    const result = await makeApi().login('alice_ok', 'SenhaValida1');

    expect(result).toEqual({ userId: '42', token: 'mock-jwt-token' });
    expect(mockUserDb.setToken).toHaveBeenCalledWith('42', 'mock-jwt-token');
    expect(mockRes.cookie).toHaveBeenCalledWith(
      'jwtToken',
      'mock-jwt-token',
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });
});

describe('LoginApi.login — rate limiting', () => {
  it('bloqueia na 6ª tentativa com UserInputError', async () => {
    // Usa username único para não interferir com outros testes
    const username = `rate_limit_test_${Date.now()}`;
    mockUserDb.getUserByUserName.mockResolvedValue(null);

    // 5 tentativas permitidas (falham com AuthenticationError — usuário não encontrado)
    for (let i = 0; i < 5; i++) {
      await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
        AuthenticationError,
      );
    }

    // 6ª tentativa: bloqueada por rate limiting
    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      UserInputError,
    );
  });

  it('reseta o contador após login bem-sucedido', async () => {
    const username = `rate_reset_${Date.now()}`;
    const hash = await bcrypt.hash('SenhaValida1', 1);

    // Simula algumas tentativas falhas
    mockUserDb.getUserByUserName.mockResolvedValueOnce(null);
    mockUserDb.getUserByUserName.mockResolvedValueOnce(null);
    // Terceira: sucesso
    mockUserDb.getUserByUserName.mockResolvedValue({
      id: '5',
      passwordHash: hash,
    });
    mockUserDb.setToken.mockResolvedValue();

    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );
    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );

    // Login com senha correta reseta o contador
    await expect(makeApi().login(username, 'SenhaValida1')).resolves.toEqual({
      userId: '5',
      token: 'mock-jwt-token',
    });

    // Agora pode tentar novamente normalmente (contador zerado)
    mockUserDb.getUserByUserName.mockResolvedValue(null);
    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('LoginApi.logout — não autenticado', () => {
  it('lança AuthenticationError', async () => {
    await expect(makeApi('').logout('alice')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.logout — usuário diferente do logado', () => {
  it('lança AuthenticationError', async () => {
    mockUserDb.getUserByUserName.mockResolvedValue({ id: '99' });

    await expect(makeApi('1').logout('outro')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.logout — sucesso', () => {
  it('limpa o token do DB e o cookie', async () => {
    mockUserDb.getUserByUserName.mockResolvedValue({ id: '1' });
    mockUserDb.clearToken.mockResolvedValue();

    const result = await makeApi('1').logout('alice');

    expect(result).toBe(true);
    expect(mockUserDb.clearToken).toHaveBeenCalledWith('1');
    expect(mockRes.clearCookie).toHaveBeenCalledWith('jwtToken');
  });
});

// ─── Login Resolvers (delegação ao LoginApi) ─────────────────────────────────

describe('Mutation.login (resolver)', () => {
  it('delega para loginApi.login com userName e password', async () => {
    const mockLoginApi = {
      login: jest.fn().mockResolvedValue({ userId: '1' }),
    };
    const ctx = { dataSources: { loginApi: mockLoginApi } };

    const result = await loginResolvers.Mutation.login(
      null,
      { data: { userName: 'alice', password: 'Pass1!' } },
      ctx,
    );

    expect(mockLoginApi.login).toHaveBeenCalledWith('alice', 'Pass1!');
    expect(result).toEqual({ userId: '1' });
  });
});

describe('Mutation.logout (resolver)', () => {
  it('delega para loginApi.logout com userName', async () => {
    const mockLoginApi = { logout: jest.fn().mockResolvedValue(true) };
    const ctx = { dataSources: { loginApi: mockLoginApi } };

    const result = await loginResolvers.Mutation.logout(
      null,
      { userName: 'alice' },
      ctx,
    );

    expect(mockLoginApi.logout).toHaveBeenCalledWith('alice');
    expect(result).toBe(true);
  });
});
