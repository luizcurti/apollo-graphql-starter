#!/usr/bin/env node
// E2E tests for all GraphQL routes.

const BASE_URL = 'http://localhost:4003';
let passCount = 0;
let failCount = 0;

const gql = async (query, { variables, token } = {}) => {
  const payload = { query };
  if (variables) payload.variables = variables;

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (exc) {
    return { errors: [{ message: exc.message }] };
  }
};

const check = (name, resp, expectError = false) => {
  const hasErrors = Boolean(resp.errors && resp.errors.length > 0);

  if (hasErrors === expectError) {
    console.log(`  ✅ PASS${expectError ? ' (erro esperado)' : ''}: ${name}`);
    passCount += 1;
  } else {
    const label = expectError ? '(esperava erro, não veio)' : '';
    console.log(`  ❌ FAIL${label ? ` ${label}` : ''}: ${name}`);
    if (hasErrors) {
      const msgs = resp.errors.map((e) => e.message || '?');
      console.log(`     errors: ${JSON.stringify(msgs)}`);
    } else {
      console.log(`     resp: ${JSON.stringify(resp).slice(0, 200)}`);
    }
    failCount += 1;
  }
};

const main = async () => {
  console.log('=========================================');
  console.log('  GraphQL E2E Tests');
  console.log('=========================================');

  // ── Cleanup: remove o usuário e2e de uma run anterior ────────────────────
  const preLogin = await gql(`
    mutation {
      login(data: { userName: "e2e.test.user", password: "Senha123" }) {
        userId token
      }
    }
  `);
  const oldE2eId = preLogin.data?.login?.userId;
  const oldE2eToken = preLogin.data?.login?.token;
  if (oldE2eId && oldE2eToken) {
    await gql(`mutation { deleteUser(userId: "${oldE2eId}") }`, {
      token: oldE2eToken,
    });
    console.log(
      `  🧹 Cleanup: user e2e.test.user (id=${oldE2eId}) removido de run anterior`,
    );
  }

  // ── 1. createUser ────────────────────────────────────────────────────────
  console.log('\n[ MUTATIONS ] — Criar usuário e2e');
  let resp = await gql(`
    mutation {
      createUser(data: {
        firstName: "E2E"
        lastName: "Test"
        userName: "e2e.test.user"
        password: "Senha123"
      }) {
        id firstName lastName userName indexRef createdAt
        posts { id }
      }
    }
  `);
  check('createUser', resp);
  const e2eUserId = resp.data?.createUser?.id;
  console.log(`     => userId: ${e2eUserId}`);

  // ── 2. login válido ─────────────────────────────────────────────────────
  console.log('\n[ MUTATIONS ] — Login');
  resp = await gql(`
    mutation {
      login(data: { userName: "elisa.pereira", password: "Senha123" }) {
        userId
        token
      }
    }
  `);
  check('login_valid_retorna_userId_e_token', resp);
  const token = resp.data?.login?.token;
  const loginUserId = resp.data?.login?.userId;
  console.log(`     => userId: ${loginUserId}`);
  console.log(`     => token: ${(token || '').slice(0, 40)}...`);

  // ── 3. login inválido ───────────────────────────────────────────────────
  resp = await gql(`
    mutation {
      login(data: { userName: "nao_existe", password: "senhaerrada" }) {
        userId token
      }
    }
  `);
  check('login_invalid', resp, true);

  // ── 4-6. getUser ─────────────────────────────────────────────────────────
  console.log('\n[ QUERIES ] — Users (autenticado)');
  resp = await gql('{ user(id: "602") { id userName firstName } }', {
    token,
  });
  check('getUser_602', resp);

  resp = await gql(
    '{ user(id: "812") { id firstName lastName userName indexRef createdAt } }',
    { token },
  );
  check('getUser_812', resp);

  resp = await gql(
    '{ user(id: "115") { id firstName lastName userName indexRef createdAt } }',
    { token },
  );
  check('getUser_115', resp);

  // ── 7. getUsers ──────────────────────────────────────────────────────────
  resp = await gql(
    '{ users { id firstName lastName userName indexRef createdAt } }',
    { token },
  );
  check('getUsers', resp);

  // ── 8. getUsers com filtro ──────────────────────────────────────────────
  resp = await gql(
    `
    query {
      users(input: { _sort: "indexRef", _order: DESC, _start: 0, _limit: 5 }) {
        id firstName lastName userName indexRef createdAt
      }
    }
  `,
    { token },
  );
  check('getUsers_filtered_desc', resp);

  // ── 9. getUsers com variável ────────────────────────────────────────────
  resp = await gql(
    `
    query GET_USERS($id: ID!) {
      user(id: $id) {
        id firstName lastName userName indexRef createdAt
      }
    }
  `,
    { variables: { id: '115' }, token },
  );
  check('getUsers_variable', resp);

  // ── 10. getUsers com fragmento ──────────────────────────────────────────
  resp = await gql(
    `
    fragment userFields on User {
      id firstName lastName userName indexRef createdAt
    }
    query {
      user(id: "812") { ...userFields }
    }
  `,
    { token },
  );
  check('getUser_fragment', resp);

  // ── 11-13. getPost / getPosts ───────────────────────────────────────────
  console.log('\n[ QUERIES ] — Posts');
  resp = await gql('{ post(id: "645") { id title body indexRef createdAt } }', {
    token,
  });
  check('getPost_645', resp);

  resp = await gql('{ post(id: "342") { id title body indexRef createdAt } }', {
    token,
  });
  check('getPost_342', resp);

  resp = await gql('{ posts { id title body indexRef createdAt } }', {
    token,
  });
  check('getPosts', resp);

  // ── 14. getPost com aliases ─────────────────────────────────────────────
  resp = await gql(
    `
    query {
      post342: post(id: "342") { postId: id id title }
      post645: post(id: "645") { id postTitle: title }
    }
  `,
    { token },
  );
  check('getPost_aliases', resp);

  // ── 15. getPost com fragmento e unixTimestamp ───────────────────────────
  resp = await gql(
    `
    fragment postFields on Post {
      id title body indexRef createdAt unixTimestamp
    }
    query {
      post1: post(id: "860") { ...postFields }
      post2: post(id: "342") { ...postFields }
    }
  `,
    { token },
  );
  check('getPost_fragment_unixTimestamp', resp);

  // ── 16. getPost — não encontrado retorna null ───────────────────────────
  resp = await gql('{ post(id: "999999") { id title } }', { token });
  if (resp.data !== undefined && resp.data !== null && !resp.errors) {
    console.log('  ✅ PASS: getPost_not_found (retorna null sem erros)');
    passCount += 1;
  } else {
    const msgs = (resp.errors || []).map((e) => e.message || '?');
    console.log('  ❌ FAIL: getPost_not_found');
    console.log(`     errors: ${JSON.stringify(msgs)}`);
    failCount += 1;
  }

  // ── 17. createPost ──────────────────────────────────────────────────────
  console.log('\n[ MUTATIONS ] — Posts');
  resp = await gql(
    `
    mutation {
      createPost(data: { title: "E2E Test Post", body: "Conteudo do post E2E" }) {
        id title body
        user { firstName }
        indexRef createdAt
      }
    }
  `,
    { token },
  );
  check('createPost', resp);
  const e2ePostId = resp.data?.createPost?.id;
  console.log(`     => postId: ${e2ePostId}`);

  // ── 18. updatePost ───────────────────────────────────────────────────────
  if (e2ePostId) {
    resp = await gql(
      `
      mutation {
        updatePost(postId: "${e2ePostId}", data: { title: "E2E Updated Post" }) {
          id title
          user { firstName }
        }
      }
    `,
      { token },
    );
    check('updatePost', resp);
  } else {
    console.log('  ⚠️  SKIP: updatePost (sem postId)');
  }

  // ── 19. createComment ───────────────────────────────────────────────────
  console.log('\n[ MUTATIONS ] — Comments');
  if (e2ePostId) {
    resp = await gql(
      `
      mutation {
        createComment(data: { postId: "${e2ePostId}", comment: "Comentario E2E" }) {
          id comment
          user { firstName }
        }
      }
    `,
      { token },
    );
    check('createComment', resp);
  } else {
    console.log('  ⚠️  SKIP: createComment (sem postId)');
  }

  // ── 20. login como e2e user ─────────────────────────────────────────────
  console.log('\n[ MUTATIONS ] — E2E user update/delete');
  resp = await gql(`
    mutation {
      login(data: { userName: "e2e.test.user", password: "Senha123" }) {
        userId token
      }
    }
  `);
  check('login_e2e_user', resp);
  const e2eToken = resp.data?.login?.token;

  // ── 21. updateUser ───────────────────────────────────────────────────────
  if (e2eUserId && e2eToken) {
    resp = await gql(
      `
      mutation {
        updateUser(userId: "${e2eUserId}", data: {
          firstName: "E2EUpdated"
          lastName: "TestUpdated"
          userName: "e2e.test.user"
        }) {
          id firstName lastName userName
        }
      }
    `,
      { token: e2eToken },
    );
    check('updateUser', resp);
  } else {
    console.log('  ⚠️  SKIP: updateUser');
  }

  // ── 22. deletePost (antes do logout — precisa da sessão da Elisa) ──────
  console.log('\n[ MUTATIONS ] — Cleanup');
  if (e2ePostId) {
    resp = await gql(`mutation { deletePost(postId: "${e2ePostId}") }`, {
      token,
    });
    check('deletePost', resp);
  } else {
    console.log('  ⚠️  SKIP: deletePost');
  }

  // ── 23. deleteUser ───────────────────────────────────────────────────────
  if (e2eUserId && e2eToken) {
    resp = await gql(`mutation { deleteUser(userId: "${e2eUserId}") }`, {
      token: e2eToken,
    });
    check('deleteUser', resp);
  } else {
    console.log('  ⚠️  SKIP: deleteUser');
  }

  // ── 24. logout (elisa.pereira) — por último, invalida o token dela ─────
  console.log('\n[ MUTATIONS ] — Logout');
  resp = await gql(
    `
    mutation {
      logout(userName: "elisa.pereira")
    }
  `,
    { token },
  );
  check('logout_elisa', resp);

  // ── 25. rotas sem auth devem rejeitar ───────────────────────────────────
  console.log('\n[ SEGURANÇA ] — Rotas sem autenticação devem rejeitar');
  check('getUser_sem_auth', await gql('{ user(id: "602") { id } }'), true);
  check('getUsers_sem_auth', await gql('{ users { id } }'), true);
  check('getPosts_sem_auth', await gql('{ posts { id } }'), true);
  check(
    'createPost_sem_auth',
    await gql(
      'mutation { createPost(data: { title: "x", body: "y" }) { id } }',
    ),
    true,
  );

  // ── 26. union types (não implementados) ─────────────────────────────────
  console.log(
    '\n[ INFO ] — Union types (PostError) — requerem refatoração no schema',
  );
  console.log(
    '  ⚠️  SKIP: queries_0010/0011 (PostError/PostNotFoundError/PostTimeoutError fora do escopo atual)',
  );

  console.log('\n=========================================');
  console.log('  RESULTADO FINAL');
  console.log('=========================================');
  console.log(`  ✅ Passou: ${passCount}`);
  console.log(`  ❌ Falhou: ${failCount}`);
  console.log(`  Total:    ${passCount + failCount}`);

  if (failCount > 0) process.exit(1);
};

main();
