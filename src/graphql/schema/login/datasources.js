import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { DataSource } from 'apollo-datasource';
import { AuthenticationError, UserInputError } from 'apollo-server-errors';

// In-memory store for login attempts: key = userName, value = { count, resetAt }
// In a multi-instance setup, replace with Redis. Sufficient for single-instance prod.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const checkRateLimit = (userName) => {
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

const clearRateLimit = (userName) => loginAttempts.delete(userName);

export class LoginApi extends DataSource {
  initialize({ context }) {
    this.context = context;
  }

  get userDb() {
    return this.context.dataSources.userDb;
  }

  async getUser(userName) {
    const user = await this.userDb.getUserByUserName(userName);

    if (!user) {
      throw new AuthenticationError('User does not exist.');
    }

    return user;
  }

  async login(userName, password) {
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

    this.context.res.cookie('jwtToken', token, {
      secure: true,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'none',
    });

    return { userId };
  }

  async logout(userName) {
    const { loggedUserId } = this.context;

    if (!loggedUserId) {
      throw new AuthenticationError('You have to log in');
    }

    const user = await this.getUser(userName);

    if (String(user.id) !== String(loggedUserId)) {
      throw new AuthenticationError('You are not this user.');
    }

    await this.userDb.clearToken(user.id);
    this.context.res.clearCookie('jwtToken');
    return true;
  }

  createJwtToken(payload) {
    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
  }
}
