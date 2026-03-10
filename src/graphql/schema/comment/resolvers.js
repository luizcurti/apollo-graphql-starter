import { withFilter } from 'apollo-server';
import { checkIsLoggedIn } from '../login/utils/login-functions';
import { pubSub, CREATED_COMMENT_TRIGGER } from '../../pubsub';

const createComment = async (_, { data }, { dataSources, loggedUserId }) => {
  checkIsLoggedIn(loggedUserId);
  const { postId, comment } = data;

  const post = await dataSources.postDb.getPost(postId);

  return dataSources.commentDb.create({
    postId,
    comment,
    userId: loggedUserId,
    postOwner: post?.userId || null,
  });
};

const user = async ({ user_id }, _, { dataSources }) => {
  return dataSources.userDb.batchLoadById(user_id);
};

const createdComment = {
  subscribe: withFilter(
    () => {
      return pubSub.asyncIterator(CREATED_COMMENT_TRIGGER);
    },
    (payload, _, context) => {
      const hasPostOwner = payload.postOwner !== null;
      const postOwnerIsLoggedUser = payload.postOwner === context.loggedUserId;
      const shouldNotifyUser = hasPostOwner && postOwnerIsLoggedUser;
      return shouldNotifyUser;
    },
  ),
};

export const commentResolvers = {
  Mutation: { createComment },
  Subscription: { createdComment },
  Comment: { user },
};
