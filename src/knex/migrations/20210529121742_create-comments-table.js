exports.up = async function (knex) {
  return knex.schema.createTable('comments', (table) => {
    table.increments('id').primary();
    table.text('comment').notNullable();
    table.string('post_id', 255).notNullable();
    table.string('user_id', 255).notNullable();
    table.timestamps(true, true);
    table.index('post_id', 'idx_comments_post_id');
    table.index('user_id', 'idx_comments_user_id');
    table.index('created_at', 'idx_comments_created_at');
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('comments');
};
