import { checkIsLoggedIn, checkOwner } from '../login/utils/login-functions';

// Query resolvers
const users = async (_, { input }, { dataSources, loggedUserId }) => {
  checkIsLoggedIn(loggedUserId);
  return dataSources.userDb.getUsers(input);
};

const user = async (_, { id }, { dataSources, loggedUserId }) => {
  checkIsLoggedIn(loggedUserId);
  return dataSources.userDb.getUser(id);
};

// Mutation Resolvers
const createUser = async (_, { data }, { dataSources }) => {
  return dataSources.userDb.createUser(data);
};

const updateUser = async (
  _,
  { userId, data },
  { dataSources, loggedUserId },
) => {
  checkOwner(userId, loggedUserId);
  return dataSources.userDb.updateUser(userId, data);
};

const deleteUser = async (_, { userId }, { dataSources, loggedUserId }) => {
  checkOwner(userId, loggedUserId);
  return dataSources.userDb.deleteUser(userId);
};

// Field Resolvers
const posts = ({ id }, _, { dataSources }) => {
  return dataSources.postDb.batchLoadByUserId(id);
};

export const userResolvers = {
  Query: { user, users },
  Mutation: { createUser, updateUser, deleteUser },
  User: { posts },
};
