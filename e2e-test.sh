#!/usr/bin/env bash
# E2E test script para todas as rotas GraphQL
set -euo pipefail

BASE_URL="http://localhost:4003"
PASS=0
FAIL=0
TOKEN=""

run_query() {
  local name="$1"
  local query="$2"
  local vars="${3:-null}"
  local headers="${4:-}"
  local expect_error="${5:-false}"

  local body
  body=$(printf '{"query":%s,"variables":%s}' "$(echo "$query" | jq -Rs .)" "$vars")

  local response
  if [[ -n "$headers" ]]; then
    response=$(curl -s -X POST "$BASE_URL" \
      -H "Content-Type: application/json" \
      -H "$headers" \
      -d "$body")
  else
    response=$(curl -s -X POST "$BASE_URL" \
      -H "Content-Type: application/json" \
      -d "$body")
  fi

  local errors
  errors=$(echo "$response" | jq -r '.errors // empty' 2>/dev/null)
  local has_errors="false"
  [[ -n "$errors" ]] && has_errors="true"

  if [[ "$has_errors" == "$expect_error" ]]; then
    echo "  ✅ PASS: $name" >&2
    PASS=$((PASS + 1))
  else
    echo "  ❌ FAIL: $name" >&2
    echo "     Response: $(echo "$response" | jq -c '.errors[0].message // .errors' 2>/dev/null)" >&2
    FAIL=$((FAIL + 1))
  fi

  echo "$response"
}

echo "========================================="
echo "  GraphQL E2E Tests"
echo "========================================="

# ──────────────────────────────────────────────
# Cleanup: remove o usuário e2e de uma run anterior que não tenha
# chegado até o deleteUser final (evita falha de "already taken").
# ──────────────────────────────────────────────
PRELOGIN=$(curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(data: { userName: \"e2e.test.user\", password: \"Senha123\" }) { userId token } }"}')
OLD_E2E_ID=$(echo "$PRELOGIN" | jq -r '.data.login.userId // empty')
OLD_E2E_TOKEN=$(echo "$PRELOGIN" | jq -r '.data.login.token // empty')
if [[ -n "$OLD_E2E_ID" && -n "$OLD_E2E_TOKEN" ]]; then
  curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -H "authorization: Bearer $OLD_E2E_TOKEN" \
    -d "{\"query\":\"mutation { deleteUser(userId: \\\"$OLD_E2E_ID\\\") }\"}" > /dev/null
  echo "  🧹 Cleanup: user e2e.test.user (id=$OLD_E2E_ID) removido de run anterior"
fi

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — Criar usuário de teste E2E"
# ──────────────────────────────────────────────

echo ""
echo "--- createUser ---"
RESP=$(run_query "createUser" '
  mutation {
    createUser(data: {
      firstName: "E2E"
      lastName: "Test"
      userName: "e2e.test.user"
      password: "Senha123"
    }) {
      id
      firstName
      lastName
      userName
      indexRef
      createdAt
    }
  }
')
E2E_USER_ID=$(echo "$RESP" | jq -r '.data.createUser.id // empty')
echo "     => userId: $E2E_USER_ID"

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — Login"
# ──────────────────────────────────────────────

echo ""
echo "--- login (credenciais seed: elisa.pereira / Senha123) ---"
RESP=$(run_query "login" '
  mutation {
    login(data: { userName: "elisa.pereira", password: "Senha123" }) {
      token
    }
  }
')
TOKEN=$(echo "$RESP" | jq -r '.data.login.token // empty')
echo "     => token: ${TOKEN:0:40}..."

echo ""
echo "--- login (credenciais inválidas) ---"
run_query "login_invalid" '
  mutation {
    login(data: { userName: "naoexiste", password: "senhaerrada" }) {
      token
    }
  }
' "null" "" "true" > /dev/null

# ──────────────────────────────────────────────
echo ""
echo "[ QUERIES ] — Users (autenticado)"
# ──────────────────────────────────────────────

AUTH_HEADER="authorization: Bearer $TOKEN"

echo ""
echo "--- getUser by id (602 / Elisa) ---"
run_query "getUser_602" '{ user(id: "602") { id userName firstName } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getUser by id (812 / Heloisa) ---"
run_query "getUser_812" '{ user(id: "812") { id firstName lastName userName indexRef createdAt } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getUser by id (115 / Talita) ---"
run_query "getUser_115" '{ user(id: "115") { id firstName lastName userName indexRef createdAt } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getUsers (lista) ---"
run_query "getUsers" '{ users { id firstName lastName userName indexRef createdAt } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getUsers com filtro (sort + pagination) ---"
run_query "getUsers_filtered" '
  query {
    users(input: { _sort: "indexRef", _order: DESC, _start: 0, _limit: 5 }) {
      id
      firstName
      lastName
      userName
      indexRef
      createdAt
    }
  }
' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getUsers com variáveis ---"
run_query "getUsers_vars" '
  query GET_USERS($id: ID!) {
    user(id: $id) {
      id
      firstName
      lastName
      userName
      indexRef
      createdAt
    }
  }
' '{"id":"115"}' "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getUsers com fragmento ---"
run_query "getUsers_fragment" '
  fragment userFields on User {
    id
    firstName
    lastName
    userName
    indexRef
    createdAt
  }
  query {
    user(id: "812") {
      ...userFields
    }
  }
' "null" "$AUTH_HEADER" > /dev/null

# ──────────────────────────────────────────────
echo ""
echo "[ QUERIES ] — Posts"
# ──────────────────────────────────────────────

echo ""
echo "--- getPost (645) ---"
run_query "getPost_645" '{ post(id: "645") { id title body indexRef createdAt } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getPost (342) ---"
run_query "getPost_342" '{ post(id: "342") { id title body indexRef createdAt } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getPosts ---"
run_query "getPosts" '{ posts { id title body indexRef createdAt } }' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getPost com aliases ---"
run_query "getPost_aliases" '
  query {
    post342: post(id: "342") { postId: id id title }
    post645: post(id: "645") { id postTitle: title }
  }
' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getPost com fragmento ---"
run_query "getPost_fragment" '
  fragment postFields on Post {
    id
    title
    body
    indexRef
    createdAt
    unixTimestamp
  }
  query {
    post1: post(id: "860") { ...postFields }
    post2: post(id: "342") { ...postFields }
  }
' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getPost não encontrado (postId=8600) — post é nullable, sem erro esperado ---"
run_query "getPost_not_found" '
  query {
    post(id: "8600") { id title }
  }
' "null" "$AUTH_HEADER" > /dev/null

echo ""
echo "--- getPost encontrado (postId=860) ---"
run_query "getPost_found" '
  query {
    post(id: "860") { id title }
  }
' "null" "$AUTH_HEADER" > /dev/null

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — Posts (autenticado como Elisa id=602)"
# ──────────────────────────────────────────────

echo ""
echo "--- createPost ---"
RESP=$(run_query "createPost" '
  mutation {
    createPost(data: { title: "E2E Test Post", body: "Conteudo do post E2E" }) {
      id
      title
      body
      user { firstName }
      indexRef
      createdAt
    }
  }
' "null" "$AUTH_HEADER")
E2E_POST_ID=$(echo "$RESP" | jq -r '.data.createPost.id // empty')
echo "     => postId: $E2E_POST_ID"

echo ""
echo "--- updatePost ---"
if [[ -n "$E2E_POST_ID" ]]; then
  run_query "updatePost" "
    mutation {
      updatePost(postId: \"$E2E_POST_ID\", data: { title: \"E2E Updated Post\" }) {
        id
        title
        user { firstName }
      }
    }
  " "null" "$AUTH_HEADER" > /dev/null
else
  echo "  ⚠️  SKIP: updatePost (sem postId)"
fi

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — Comments"
# ──────────────────────────────────────────────

echo ""
echo "--- createComment ---"
if [[ -n "$E2E_POST_ID" ]]; then
  RESP=$(run_query "createComment" "
    mutation {
      createComment(data: { postId: \"$E2E_POST_ID\", comment: \"Comentario do teste E2E\" }) {
        id
        comment
        user { firstName }
      }
    }
  " "null" "$AUTH_HEADER")
  COMMENT_ID=$(echo "$RESP" | jq -r '.data.createComment.id // empty')
  echo "     => commentId: $COMMENT_ID"
else
  echo "  ⚠️  SKIP: createComment (sem postId)"
fi

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — User Update/Delete (E2E user)"
# ──────────────────────────────────────────────

echo ""
echo "--- login como e2e.test.user ---"
RESP=$(run_query "login_e2e" '
  mutation {
    login(data: { userName: "e2e.test.user", password: "Senha123" }) {
      token
    }
  }
')
E2E_TOKEN=$(echo "$RESP" | jq -r '.data.login.token // empty')
E2E_AUTH="authorization: Bearer $E2E_TOKEN"
echo "     => e2e token: ${E2E_TOKEN:0:40}..."

echo ""
echo "--- updateUser ---"
if [[ -n "$E2E_USER_ID" && -n "$E2E_TOKEN" ]]; then
  run_query "updateUser" "
    mutation {
      updateUser(userId: \"$E2E_USER_ID\", data: {
        firstName: \"E2E-Updated\"
        lastName: \"Test-Updated\"
        userName: \"e2e.test.user\"
      }) {
        id
        firstName
        lastName
        userName
      }
    }
  " "null" "$E2E_AUTH" > /dev/null
else
  echo "  ⚠️  SKIP: updateUser"
fi

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — deletePost"
# ──────────────────────────────────────────────
echo ""
echo "--- deletePost (criado no E2E) ---"
if [[ -n "$E2E_POST_ID" ]]; then
  run_query "deletePost" "
    mutation {
      deletePost(postId: \"$E2E_POST_ID\")
    }
  " "null" "$AUTH_HEADER" > /dev/null
else
  echo "  ⚠️  SKIP: deletePost (sem postId)"
fi

# ──────────────────────────────────────────────
echo ""
echo "[ MUTATIONS ] — deleteUser (E2E cleanup)"
# ──────────────────────────────────────────────
echo ""
echo "--- deleteUser ---"
if [[ -n "$E2E_USER_ID" && -n "$E2E_TOKEN" ]]; then
  run_query "deleteUser" "
    mutation {
      deleteUser(userId: \"$E2E_USER_ID\")
    }
  " "null" "$E2E_AUTH" > /dev/null
else
  echo "  ⚠️  SKIP: deleteUser"
fi

# ──────────────────────────────────────────────
# logout roda por último — invalida o token da Elisa, então qualquer
# teste que ainda dependa de $AUTH_HEADER precisa vir antes deste.
# ──────────────────────────────────────────────
echo ""
echo "--- logout ---"
run_query "logout" '
  mutation {
    logout(userName: "elisa.pereira")
  }
' "null" "$AUTH_HEADER" > /dev/null

# ──────────────────────────────────────────────
echo ""
echo "========================================="
echo "  RESULTADO FINAL"
echo "========================================="
echo "  ✅ Passou: $PASS"
echo "  ❌ Falhou: $FAIL"
echo "  Total:    $((PASS + FAIL))"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
