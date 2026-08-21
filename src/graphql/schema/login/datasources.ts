import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthenticationError, UserInputError } from '../../errors';
import type { Context } from '../../context/types';
import type { User } from '../user/sql-datasource';

export interface LoginResult {
  userId: string;
  token: string;
}

// In-memory store for login attempts: key = userName, value = { count, resetAt }
// In a multi-instance setup, replace with Redis. Sufficient for single-instance prod.
interface LoginAttemptEntry {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, LoginAttemptEntry>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const checkRateLimit = (userName: string): void => {
  const now = Date.now();
  const entry = loginAttempts.get(userName);

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_ATTEMPTS) {
      throw new UserInputError(
        `Too many login attempts. Try again in ${Math.ceil(
          (entry.resetAt - now) / 60000,
        )} minute(s).`,
      );
    }
    entry.count += 1;
  } else {
    loginAttempts.set(userName, { count: 1, resetAt: now + WINDOW_MS });
  }
};

const clearRateLimit = (userName: string): void => {
  loginAttempts.delete(userName);
};

export class LoginApi {
  context!: Context;

  initialize({ context }: { context: Context }): void {
    this.context = context;
  }

  get userDb() {
    return this.context.dataSources.userDb;
  }

  async getUser(userName: string): Promise<User> {
    const user = await this.userDb.getUserByUserName(userName);

    if (!user) {
      throw new AuthenticationError('User does not exist.');
    }

    return user;
  }

  async login(userName: string, password: string): Promise<LoginResult> {
    checkRateLimit(userName);

    const user = await this.getUser(userName);

    const { passwordHash, id: userId } = user;
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid password.');
    }

    clearRateLimit(userName);

    const token = this.createJwtToken({ userId });
    await this.userDb.setToken(userId, token);

    this.context.res?.cookie('jwtToken', token, {
      secure: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'none',
    });

    return { userId, token };
  }

  async logout(userName: string): Promise<boolean> {
    const { loggedUserId } = this.context;

    if (!loggedUserId) {
      throw new AuthenticationError('You have to log in');
    }

    const user = await this.getUser(userName);

    if (String(user.id) !== String(loggedUserId)) {
      throw new AuthenticationError('You are not this user.');
    }

    await this.userDb.clearToken(user.id);
    this.context.res?.clearCookie('jwtToken');
    return true;
  }

  createJwtToken(payload: { userId: string }): string {
    return jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: '7d',
    });
  }
}
