import { PubSub } from 'apollo-server';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

const createPubSub = () => {
  if (process.env.REDIS_URL) {
    const options = { lazyConnect: true };
    return new RedisPubSub({
      publisher: new Redis(process.env.REDIS_URL, options),
      subscriber: new Redis(process.env.REDIS_URL, options),
    });
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'REDIS_URL is required in production for GraphQL subscriptions.',
    );
  }

  // Fallback in-memory — development/test only
  return new PubSub();
};

export const pubSub = createPubSub();
export const CREATED_COMMENT_TRIGGER = 'CREATED_COMMENT';
