import bcrypt from 'bcrypt';
import { LoginApi } from '../graphql/schema/login/datasources';
import { loginResolvers } from '../graphql/schema/login/resolvers';
import { AuthenticationError, UserInputError } from '../graphql/errors';
import type { Context } from '../graphql/context/types';

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

const makeApi = (loggedUserId = ''): LoginApi => {
  const api = new LoginApi();
  api.initialize({
    context: {
      loggedUserId,
      res: mockRes,
      dataSources: { userDb: mockUserDb },
    } as unknown as Context,
  });
  return api;
};

beforeEach(() => jest.clearAllMocks());

// ─── Login ───────────────────────────────────────────────────────────────────

describe('LoginApi.login — user does not exist', () => {
  it('throws AuthenticationError', async () => {
    mockUserDb.getUserByUserName.mockResolvedValue(null);

    await expect(makeApi().login('ghost', 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.login — wrong password', () => {
  it('throws AuthenticationError', async () => {
    const hash = await bcrypt.hash('CorrectPass1', 1);
    mockUserDb.getUserByUserName.mockResolvedValue({
      id: '1',
      passwordHash: hash,
    });

    await expect(makeApi().login('alice_login', 'WrongPass1')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.login — valid credentials', () => {
  it('returns userId and token, and sets an httpOnly cookie', async () => {
    const hash = await bcrypt.hash('ValidPass1', 1);
    mockUserDb.getUserByUserName.mockResolvedValue({
      id: '42',
      passwordHash: hash,
    });
    mockUserDb.setToken.mockResolvedValue(undefined);

    const result = await makeApi().login('alice_ok', 'ValidPass1');

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
  it('blocks the 6th attempt with UserInputError', async () => {
    // Uses a unique username so it doesn't interfere with other tests
    const username = `rate_limit_test_${Date.now()}`;
    mockUserDb.getUserByUserName.mockResolvedValue(null);

    // 5 attempts allowed (fail with AuthenticationError — user not found)
    for (let i = 0; i < 5; i++) {
      await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
        AuthenticationError,
      );
    }

    // 6th attempt: blocked by rate limiting
    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      UserInputError,
    );
  });

  it('resets the counter after a successful login', async () => {
    const username = `rate_reset_${Date.now()}`;
    const hash = await bcrypt.hash('ValidPass1', 1);

    // Simulates a few failed attempts
    mockUserDb.getUserByUserName.mockResolvedValueOnce(null);
    mockUserDb.getUserByUserName.mockResolvedValueOnce(null);
    // Third: success
    mockUserDb.getUserByUserName.mockResolvedValue({
      id: '5',
      passwordHash: hash,
    });
    mockUserDb.setToken.mockResolvedValue(undefined);

    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );
    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );

    // Logging in with the correct password resets the counter
    await expect(makeApi().login(username, 'ValidPass1')).resolves.toEqual({
      userId: '5',
      token: 'mock-jwt-token',
    });

    // Can now try again normally (counter reset)
    mockUserDb.getUserByUserName.mockResolvedValue(null);
    await expect(makeApi().login(username, 'Pass1!')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

// ─── Logout ──────────────────────────────────────────────────────────────────

describe('LoginApi.logout — not authenticated', () => {
  it('throws AuthenticationError', async () => {
    await expect(makeApi('').logout('alice')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.logout — user different from the logged-in one', () => {
  it('throws AuthenticationError', async () => {
    mockUserDb.getUserByUserName.mockResolvedValue({ id: '99' });

    await expect(makeApi('1').logout('other')).rejects.toThrow(
      AuthenticationError,
    );
  });
});

describe('LoginApi.logout — success', () => {
  it('clears the token in the DB and the cookie', async () => {
    mockUserDb.getUserByUserName.mockResolvedValue({ id: '1' });
    mockUserDb.clearToken.mockResolvedValue(undefined);

    const result = await makeApi('1').logout('alice');

    expect(result).toBe(true);
    expect(mockUserDb.clearToken).toHaveBeenCalledWith('1');
    expect(mockRes.clearCookie).toHaveBeenCalledWith('jwtToken');
  });
});

// ─── Login Resolvers (delegation to LoginApi) ────────────────────────────────

describe('Mutation.login (resolver)', () => {
  it('delegates to loginApi.login with userName and password', async () => {
    const mockLoginApi = {
      login: jest.fn().mockResolvedValue({ userId: '1' }),
    };
    const ctx = {
      dataSources: { loginApi: mockLoginApi },
    } as unknown as Context;

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
  it('delegates to loginApi.logout with userName', async () => {
    const mockLoginApi = { logout: jest.fn().mockResolvedValue(true) };
    const ctx = {
      dataSources: { loginApi: mockLoginApi },
    } as unknown as Context;

    const result = await loginResolvers.Mutation.logout(
      null,
      { userName: 'alice' },
      ctx,
    );

    expect(mockLoginApi.logout).toHaveBeenCalledWith('alice');
    expect(result).toBe(true);
  });
});
