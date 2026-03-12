# GraphQL Node API

A production-ready GraphQL API built with Node.js, Apollo Server, Knex, and MySQL. Features JWT authentication via httpOnly cookies, DataLoader batching, Redis PubSub for subscriptions, structured logging, and query depth/complexity protection.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| GraphQL Server | Apollo Server 2 |
| Query Language | GraphQL 15 |
| Database ORM | Knex 2 + MySQL2 |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Subscriptions | Redis PubSub (ioredis) · in-memory fallback in dev |
| Logging | Pino (pino-pretty in dev, JSON in prod) |
| Transpiler | Sucrase |
| Testing | Jest + @sucrase/jest-plugin |

## Project Structure

```
src/
├── index.js                        # Apollo Server entry point
├── utils/
│   └── logger.js                   # Pino structured logger
├── graphql/
│   ├── context/index.js            # JWT verification, request context
│   ├── pubsub.js                   # Redis / in-memory PubSub
│   ├── datasources/sql/            # Base SQLDatasource class
│   └── schema/
│       ├── user/                   # User CRUD + DataLoader
│       ├── post/                   # Post CRUD + DataLoader
│       ├── comment/                # Comment mutations + Subscription
│       ├── login/                  # Login / Logout + rate limiting
│       └── api-filters/            # Pagination/sorting input types
└── knex/
    ├── index.js                    # Knex connection factory
    ├── knexfile.js                 # DB config per environment
    ├── migrations/                 # Schema migrations
    └── seeds/                      # Development seed data
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) (for the MySQL container)
- Redis (required in production for subscriptions)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/luizcurti/graphql-node.git
cd graphql-node
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in DATABASE_USER, DATABASE_PASSWORD, MYSQL_ROOT_PASSWORD, and JWT_SECRET (min 32 chars)
```

### 3. Start the database

```bash
docker compose up -d
```

### 4. Run migrations and seed data

```bash
npm run db:setup
```

This runs all migrations and populates the database with 20 users, 24 posts, and 24 comments for development.

### 5. Start the development server

```bash
npm run dev
```

The GraphQL Playground will be available at:

```
http://localhost:4003/graphql
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Server port (default: `4003`) |
| `JWT_SECRET` | Yes | Secret key — minimum 32 characters |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `DATABASE_CLIENT` | No | Knex client (default: `mysql2`) |
| `DATABASE_HOST` | Yes | MySQL host |
| `DATABASE_PORT` | Yes | MySQL port (default: `3306`) |
| `DATABASE_NAME` | Yes | Database name |
| `DATABASE_USER` | Yes | Database user |
| `DATABASE_PASSWORD` | Yes | Database password |
| `MYSQL_ROOT_PASSWORD` | Yes | MySQL root password (Docker only) |
| `REDIS_URL` | Prod only | Redis connection URL for subscriptions |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |

## API

### Queries

```graphql
user(id: ID!): User!                        # requires authentication
users(input: ApiFiltersInput): [User!]!     # requires authentication

post(id: ID!): Post!
posts(input: ApiFiltersInput): [Post!]!     # requires authentication
```

### Mutations

```graphql
# Auth
login(data: LoginInput!): Login!
logout(userName: String!): Boolean!

# Users
createUser(data: CreateUserInput!): User!
updateUser(userId: ID!, data: UpdateUserInput!): User!   # owner only
deleteUser(userId: ID!): Boolean!                        # owner only

# Posts
createPost(data: CreatePostInput!): Post!                # requires authentication
updatePost(postId: ID!, data: UpdatePostInput!): Post!   # owner only
deletePost(postId: ID!): Boolean!                        # owner only

# Comments
createComment(data: CreateCommentInput!): Comment!       # requires authentication
```

### Subscriptions

```graphql
createdComment: Comment!   # notifies the post owner when a comment is created
```

### Pagination / Sorting (ApiFiltersInput)

```graphql
input ApiFiltersInput {
  _sort: String
  _order: ApiFilterOrder   # ASC | DESC
  _start: Int
  _limit: Int
}
```

## Authentication

Login sets a `jwtToken` **httpOnly cookie** — no token is returned in the response body.

```graphql
mutation {
  login(data: { userName: "alice_barros38", password: "Senha123" }) {
    userId
  }
}
```

To authenticate via Bearer token (e.g., WebSocket subscriptions):

```
Authorization: Bearer <token>
```

## Security Features

- JWT validated on every request against the database token (stateful sessions)
- `JWT_SECRET` must be ≥ 32 characters — server exits on startup if invalid
- Query depth limited to **7 levels**
- GraphQL introspection **disabled in production**
- Login rate limiting: **5 attempts per 15 minutes** per username
- Tokens stored only in `httpOnly + secure` cookies
- All credentials via environment variables (never hardcoded)

## Available Scripts

```bash
npm run dev              # Start development server with hot reload
npm start                # Start production server (requires build)
npm run build            # Compile src/ to dist/ via Sucrase

npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:ci          # lint:check + test + build

npm run migrate          # Run pending database migrations
npm run migrate:rollback # Roll back the last migration batch
npm run seed             # Populate database with development seed data
npm run db:setup         # migrate + seed in one command

npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without writing

npm run security         # Run npm audit (high severity)
```

## Testing

```bash
npm test
```

109 tests across 9 suites covering:

- `login-functions` — `checkIsLoggedIn`, `checkOwner`
- `user-validators` — `validateUserName`, `validateUserPassword`
- `user-resolvers` — all Query, Mutation, and field resolvers
- `post-resolvers` — all Query, Mutation, and field resolvers
- `comment-resolvers` — Mutation, field resolver, subscription filter logic
- `login-api` — full login/logout flow, rate limiting, cookie behavior
- `user-datasource` — `UserSQLDataSource`: reducer, getUsers whitelist, createUser (bcrypt, index_ref, duplicata), updateUser, deleteUser
- `post-datasource` — `PostSQLDataSource`: reducer, getPosts whitelist, createPost, updatePost (ownership), deletePost
- `comment-datasource` — `CommentSQLDataSource`: reducer, getById, create (duplicate check, pubSub), batchLoaderCallback

## Database

### Migrations

```bash
npm run migrate          # apply all pending migrations
npm run migrate:rollback # roll back last batch
```

Migrations in `src/knex/migrations/`:

| File | Description |
|---|---|
| `20210529121742_create-comments-table.js` | Comments table (integer post_id / user_id) |
| `20260310130000_create-users-table.js` | Users table with unique user_name |
| `20260310130001_create-posts-table.js` | Posts table with FK → users (CASCADE DELETE) |
| `20260310130002_add-fk-to-comments.js` | FK constraints on comments → posts and users (CASCADE DELETE) |

### Seeds

```bash
npm run seed             # truncate and repopulate all tables
```

Seed data (`src/knex/seeds/`):

| File | Records |
|---|---|
| `01_users.js` | 20 users — all with password `Senha123` |
| `02_posts.js` | 24 posts |
| `03_comments.js` | 24 comments |

Seeds run in order and respect foreign key constraints.

## Docker

Start a MySQL 8.0 container:

```bash
docker compose up -d
```

All credentials are read from `.env`. The database data persists at `~/.MySQLDBData/mysqlonly/graphql_mysql`.

## Production Checklist

- [ ] `NODE_ENV=production` is set
- [ ] `JWT_SECRET` is a long, random string (≥ 32 chars)
- [ ] `REDIS_URL` is configured (subscriptions require Redis in production)
- [ ] `ALLOWED_ORIGINS` is set to your frontend domain(s)
- [ ] Run `npm run migrate` before first start
- [ ] Run `npm run build` before starting with `npm start`
```

**Note:** The CI pipeline allows known vulnerabilities in legacy dependencies to avoid blocking development while maintaining visibility.
