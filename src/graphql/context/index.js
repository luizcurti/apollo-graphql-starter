import jwt from 'jsonwebtoken';
import { knex } from '../../knex/';
import { UserSQLDataSource } from '../schema/user/sql-datasource';
import { PostSQLDataSource } from '../schema/post/sql-datasource';
import { CommentSQLDataSource } from '../schema/comment/datasources';
import { LoginApi } from '../schema/login/datasources';
import { logger } from '../../utils/logger';

const makeUserDb = () => {
  const userDb = new UserSQLDataSource(knex);
  userDb.initialize({ context: {}, cache: undefined });
  return userDb;
};

const verifyJwtToken = async (token) => {
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
    });

    const userDb = makeUserDb();
    const foundUser = await userDb.getUser(userId);

    if (!foundUser || foundUser.token !== token) return '';
    return String(userId);
  } catch (e) {
    logger.warn({ err: e.message }, 'JWT verification failed');
    return '';
  }
};

const authorizeUserWithBearerToken = async (req) => {
  if (!req || !req.headers || !req.headers.authorization) return '';

  const { headers } = req;
  const { authorization } = headers;

  try {
    const [, token] = authorization.split(' ');
    return await verifyJwtToken(token);
  } catch (_e) {
    return '';
  }
};

const cookieParser = (cookiesHeader) => {
  if (typeof cookiesHeader !== 'string') return {};

  const cookies = cookiesHeader.split(/;\s*/);

  const parsedCookie = {};
  for (let i = 0; i < cookies.length; i++) {
    const [key, value] = cookies[i].split('=');
    parsedCookie[key] = value;
  }

  return parsedCookie;
};

export const context = async ({ req, res, connection }) => {
  let loggedUserId = await authorizeUserWithBearerToken(req);

  if (!loggedUserId && req && req.headers && req.headers.cookie) {
    const { jwtToken } = cookieParser(req.headers.cookie);
    loggedUserId = await verifyJwtToken(jwtToken);
  }

  const userDb = makeUserDb();
  const postDb = new PostSQLDataSource(knex);
  const commentDb = new CommentSQLDataSource(knex);

  const theContext = {
    loggedUserId,
    res,
    dataSources: { userDb },
  };

  postDb.initialize({ context: theContext, cache: undefined });
  commentDb.initialize({ context: theContext, cache: undefined });
  theContext.dataSources.postDb = postDb;
  theContext.dataSources.commentDb = commentDb;

  if (!connection) {
    const loginApi = new LoginApi();
    loginApi.initialize({ context: theContext });
    theContext.dataSources.loginApi = loginApi;
  }

  return theContext;
};
