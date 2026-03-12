exports.up = async function (knex) {
  return knex.schema.alterTable('comments', (table) => {
    table
      .integer('post_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE')
      .alter();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE')
      .alter();
  });
};

exports.down = async function (knex) {
  return knex.schema.alterTable('comments', (table) => {
    table.dropForeign('post_id');
    table.dropForeign('user_id');
  });
};
