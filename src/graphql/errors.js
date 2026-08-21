import { GraphQLError } from 'graphql';

class ApolloServerErrorBase extends GraphQLError {
  constructor(message, code, extensions) {
    super(message, { extensions: { code, ...extensions } });
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends ApolloServerErrorBase {
  constructor(message, extensions) {
    super(message, 'UNAUTHENTICATED', extensions);
  }
}

export class UserInputError extends ApolloServerErrorBase {
  constructor(message, extensions) {
    super(message, 'BAD_USER_INPUT', extensions);
  }
}

export class ValidationError extends ApolloServerErrorBase {
  constructor(message, extensions) {
    super(message, 'GRAPHQL_VALIDATION_FAILED', extensions);
  }
}
