exports.up = async function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('first_name', 100).notNullable();
    table.string('last_name', 100).notNullable();
    table.string('user_name', 100).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.integer('index_ref').unsigned().notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.string('token', 512).defaultTo('');
    table.index('user_name', 'idx_users_user_name');
  });
};

exports.down = async function (knex) {
  return knex.schema.dropTable('users');
};
