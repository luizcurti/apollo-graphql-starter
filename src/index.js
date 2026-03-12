import { ApolloServer } from 'apollo-server';
import depthLimit from 'graphql-depth-limit';

import { knex } from './knex/';
import { logger } from './utils/logger';

import { context } from './graphql/context';

import { UserSQLDataSource } from './graphql/schema/user/sql-datasource';
import { PostSQLDataSource } from './graphql/schema/post/sql-datasource';

import { resolvers, typeDefs } from './graphql/schema';
import { LoginApi } from './graphql/schema/login/datasources';

import { CommentSQLDataSource } from './graphql/schema/comment/datasources';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  logger.fatal(
    'JWT_SECRET is missing or too short (min 32 characters). Exiting.',
  );
  process.exit(1);
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context,
  dataSources: () => ({
    userDb: new UserSQLDataSource(knex),
    postDb: new PostSQLDataSource(knex),
    loginApi: new LoginApi(),
    commentDb: new CommentSQLDataSource(knex),
  }),
  uploads: false,
  introspection: process.env.NODE_ENV !== 'production',
  validationRules: [depthLimit(7)],
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [],
    credentials: true,
  },
  subscriptions: {
    onConnect: (connectionParams, ws, _context) => {
      return {
        req: ws.upgradeReq,
      };
    },
    path: '/',
    keepAlive: 5000,
  },
});

const port = process.env.PORT || 4003;
server.listen(port).then(({ url }) => {
  logger.info(`Server listening on ${url}`);
});
