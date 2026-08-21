# GraphQL Node API

A production-ready GraphQL API built with Node.js, Apollo Server, Knex, and MySQL. Features JWT authentication via httpOnly cookies, DataLoader batching, Redis PubSub for subscriptions, structured logging, and query depth/complexity protection.

📊 **[Architecture diagrams and flow docs →](./docs/README.md)**

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ |
| Language | TypeScript (strict mode) |
| GraphQL Server | @apollo/server 5 (Express 5 + graphql-ws) |
| Query Language | GraphQL 16 |
| Database ORM | Knex 3 + MySQL2 |
| Authentication | JWT (jsonwebtoken) + bcrypt |
| Subscriptions | graphql-ws over Redis PubSub (ioredis) · in-memory fallback in dev |
| Logging | Pino (pino-pretty in dev, JSON in prod) |
| Transpiler | Sucrase (types are stripped, not checked — see `npm run typecheck`) |
| Testing | Jest + @sucrase/jest-plugin |

## Project Structure

```
src/
├── index.ts                        # Apollo Server entry point
├── utils/
│   └── logger.ts                   # Pino structured logger
├── graphql/
│   ├── context/
│   │   ├── index.ts                # JWT verification, request context
│   │   └── types.ts                # Context / DataSources types
│   ├── pubsub.ts                    # Redis / in-memory PubSub
│   ├── datasources/sql/            # Base SQLDatasource class
│   └── schema/
│       ├── user/                   # User CRUD + DataLoader
│       ├── post/                   # Post CRUD + DataLoader
│       ├── comment/                # Comment mutations + Subscription
│       ├── login/                  # Login / Logout + rate limiting
│       └── api-filters/            # Pagination/sorting input types
└── knex/
    ├── index.ts                    # Knex connection factory
    ├── knexfile.ts                 # DB config per environment
    ├── migrations/                 # Schema migrations
    └── seeds/                      # Development seed data
```

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
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
npm run test:integration # Run integration tests against a real MySQL (needs db:setup first)
npm run test:e2e         # Run e2e-test.ts against a running server
npm run test:ci          # lint:check + typecheck + test + build
npm run typecheck        # Type-check the project with tsc (no emit)

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

Three independent layers, each covering the API from a different angle:

```bash
npm test                 # unit tests — mocked, no external services needed
npm run test:integration  # real MySQL — schema, constraints, cascades
npm run test:e2e          # black-box HTTP run against a live server
```

### Unit tests (`npm test`)

162 tests across 15 suites, with **100% statement/branch/function/line
coverage** on every business-logic module (resolvers, datasources, auth
context, pubsub, validators — see `npm test -- --coverage`). Entry-point
bootstrap (`src/index.ts`) and migrations/seeds are intentionally excluded
from that figure — they're covered by the integration suite instead, which
exercises them against a real database rather than mocks.

- `login-functions` — `checkIsLoggedIn`, `checkOwner`
- `user-validators` — `validateUserName`, `validateUserPassword`
- `user-resolvers` / `post-resolvers` / `comment-resolvers` — all Query, Mutation, field resolvers, and the real subscription filter (via `withFilter` + pubsub)
- `login-api` — full login/logout flow, rate limiting, cookie behavior
- `user-datasource` / `post-datasource` / `comment-datasource` — reducers, whitelist validation, create/update/delete, DataLoader batch functions
- `context` — every branch of JWT/cookie authentication
- `pubsub`, `sql-datasource`, `schema-index`, `logger`, `knex-config` — supporting modules (env-dependent branches, base class behavior, module wiring)

### Integration tests (`npm run test:integration`)

28 tests against a real MySQL database (requires `npm run db:setup` first).
These exist specifically for what can't be meaningfully faked with mocks:
unique-constraint violations, and `ON DELETE CASCADE` actually deleting a
user's posts and a post's comments.

### End-to-end tests (`npm run test:e2e`)

28 checks that run real GraphQL requests against a running server — the
same happy-path and rejected-without-auth scenarios a real client would hit.

## Database

### Migrations

```bash
npm run migrate          # apply all pending migrations
npm run migrate:rollback # roll back last batch
```

Migrations in `src/knex/migrations/`:

| File | Description |
|---|---|
| `20210529121742_create-comments-table.ts` | Comments table (integer post_id / user_id) |
| `20260310130000_create-users-table.ts` | Users table with unique user_name |
| `20260310130001_create-posts-table.ts` | Posts table with FK → users (CASCADE DELETE) |
| `20260310130002_add-fk-to-comments.ts` | FK constraints on comments → posts and users (CASCADE DELETE) |

### Seeds

```bash
npm run seed             # truncate and repopulate all tables
```

Seed data (`src/knex/seeds/`):

| File | Records |
|---|---|
| `01_users.ts` | 20 users — all with password `Senha123` |
| `02_posts.ts` | 24 posts |
| `03_comments.ts` | 24 comments |

Seeds run in order and respect foreign key constraints.

## Docker

Start a MySQL 8.0 container:

```bash
docker compose up -d
```