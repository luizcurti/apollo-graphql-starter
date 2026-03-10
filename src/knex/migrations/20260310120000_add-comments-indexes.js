exports.up = async function (knex) {
  return knex.schema.table('comments', (table) => {
    table.index('post_id', 'idx_comments_post_id');
    table.index('user_id', 'idx_comments_user_id');
    table.index('created_at', 'idx_comments_created_at');
  });
};

exports.down = async function (knex) {
  return knex.schema.table('comments', (table) => {
    table.dropIndex('post_id', 'idx_comments_post_id');
    table.dropIndex('user_id', 'idx_comments_user_id');
    table.dropIndex('created_at', 'idx_comments_created_at');
  });
};
