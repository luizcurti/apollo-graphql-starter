import { checkIsLoggedIn } from '../login/utils/login-functions';

// Query resolvers
const post = async (_, { id }, { dataSources }) => {
  return dataSources.postDb.getPost(id);
};

const posts = async (_, { input }, { dataSources, loggedUserId }) => {
  checkIsLoggedIn(loggedUserId);
  return dataSources.postDb.getPosts(input);
};

// Mutation resolvers
const createPost = async (_, { data }, { dataSources, loggedUserId }) => {
  checkIsLoggedIn(loggedUserId);
  return dataSources.postDb.createPost({ ...data, userId: loggedUserId });
};

const updatePost = async (
  _,
  { postId, data },
  { dataSources, loggedUserId },
) => {
  checkIsLoggedIn(loggedUserId);
  return dataSources.postDb.updatePost(postId, data, loggedUserId);
};

const deletePost = async (_, { postId }, { dataSources, loggedUserId }) => {
  checkIsLoggedIn(loggedUserId);
  return dataSources.postDb.deletePost(postId, loggedUserId);
};

// Field resolver
const user = async ({ userId }, _, { dataSources }) => {
  return dataSources.userDb.batchLoadById(userId);
};

const comments = async ({ id: post_id }, _, { dataSources }) => {
  return dataSources.commentDb.batchLoad(post_id);
};

const unixTimestamp = ({ createdAt }) => {
  return Math.floor(new Date(createdAt).getTime() / 1000);
};

export const postResolvers = {
  Query: { post, posts },
  Mutation: { createPost, updatePost, deletePost },
  Post: { user, comments, unixTimestamp },
};
