#!/usr/bin/env python3
"""E2E tests for all GraphQL routes."""

import json
import sys
import urllib.request
import urllib.error

BASE_URL = "http://localhost:4003"
PASS_COUNT = 0
FAIL_COUNT = 0


def gql(query: str, variables: dict = None, token: str = None):
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE_URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())
    except Exception as exc:
        return {"errors": [{"message": str(exc)}]}


def check(name: str, resp: dict, expect_error: bool = False):
    global PASS_COUNT, FAIL_COUNT
    has_errors = bool(resp.get("errors"))

    if expect_error:
        if has_errors:
            print(f"  ✅ PASS (erro esperado): {name}")
            PASS_COUNT += 1
        else:
            print(f"  ❌ FAIL (esperava erro, não veio): {name}")
            print(f"     resp: {json.dumps(resp)[:200]}")
            FAIL_COUNT += 1
    else:
        if not has_errors:
            print(f"  ✅ PASS: {name}")
            PASS_COUNT += 1
        else:
            msgs = [e.get("message", "?") for e in resp.get("errors", [])]
            print(f"  ❌ FAIL: {name}")
            print(f"     errors: {msgs}")
            FAIL_COUNT += 1


# ──────────────────────────────────────────────
print("=========================================")
print("  GraphQL E2E Tests")
print("=========================================")

# ── Cleanup: Delete e2e user if it exists from previous run ───────────────────
resp_e2e_prelogin = gql("""
  mutation {
    login(data: { userName: "e2e.test.user", password: "Senha123" }) {
      userId token
    }
  }
""")
OLD_E2E_ID = (resp_e2e_prelogin.get("data") or {}).get("login", {}).get("userId", "")
OLD_E2E_TOKEN = (resp_e2e_prelogin.get("data") or {}).get("login", {}).get("token", "")
if OLD_E2E_ID and OLD_E2E_TOKEN:
    gql(f'mutation {{ deleteUser(userId: "{OLD_E2E_ID}") }}', token=OLD_E2E_TOKEN)
    print(f"  🧹 Cleanup: user e2e.test.user (id={OLD_E2E_ID}) removido de run anterior")

# ── 1. createUser ──────────────────────────────
print("\n[ MUTATIONS ] — Criar usuário e2e")
resp = gql("""
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
""")
check("createUser", resp)
E2E_USER_ID = (resp.get("data") or {}).get("createUser", {}).get("id")
print(f"     => userId: {E2E_USER_ID}")

# ── 2. login válido ────────────────────────────
print("\n[ MUTATIONS ] — Login")
resp = gql("""
  mutation {
    login(data: { userName: "elisa.pereira", password: "Senha123" }) {
      userId
      token
    }
  }
""")
check("login_valid_retorna_userId_e_token", resp)
TOKEN = (resp.get("data") or {}).get("login", {}).get("token", "")
LOGIN_USER_ID = (resp.get("data") or {}).get("login", {}).get("userId", "")
print(f"     => userId: {LOGIN_USER_ID}")
print(f"     => token: {TOKEN[:40]}...")

# ── 3. login inválido ──────────────────────────
resp = gql("""
  mutation {
    login(data: { userName: "nao_existe", password: "senhaerrada" }) {
      userId token
    }
  }
""")
check("login_invalid", resp, expect_error=True)

# ── 4. getUser (602) ───────────────────────────
print("\n[ QUERIES ] — Users (autenticado)")
resp = gql('{ user(id: "602") { id userName firstName } }', token=TOKEN)
check("getUser_602", resp)

# ── 5. getUser (812) ───────────────────────────
resp = gql('{ user(id: "812") { id firstName lastName userName indexRef createdAt } }', token=TOKEN)
check("getUser_812", resp)

# ── 6. getUser (115) ───────────────────────────
resp = gql('{ user(id: "115") { id firstName lastName userName indexRef createdAt } }', token=TOKEN)
check("getUser_115", resp)

# ── 7. getUsers ────────────────────────────────
resp = gql('{ users { id firstName lastName userName indexRef createdAt } }', token=TOKEN)
check("getUsers", resp)

# ── 8. getUsers com filtro ─────────────────────
resp = gql("""
  query {
    users(input: { _sort: "indexRef", _order: DESC, _start: 0, _limit: 5 }) {
      id firstName lastName userName indexRef createdAt
    }
  }
""", token=TOKEN)
check("getUsers_filtered_desc", resp)

# ── 9. getUsers com variável ───────────────────
resp = gql("""
  query GET_USERS($id: ID!) {
    user(id: $id) {
      id firstName lastName userName indexRef createdAt
    }
  }
""", variables={"id": "115"}, token=TOKEN)
check("getUsers_variable", resp)

# ── 10. getUsers com fragmento ─────────────────
resp = gql("""
  fragment userFields on User {
    id firstName lastName userName indexRef createdAt
  }
  query {
    user(id: "812") { ...userFields }
  }
""", token=TOKEN)
check("getUser_fragment", resp)

# ── 11. getPost (645) ──────────────────────────
print("\n[ QUERIES ] — Posts")
resp = gql('{ post(id: "645") { id title body indexRef createdAt } }', token=TOKEN)
check("getPost_645", resp)

# ── 12. getPost (342) ──────────────────────────
resp = gql('{ post(id: "342") { id title body indexRef createdAt } }', token=TOKEN)
check("getPost_342", resp)

# ── 13. getPosts ───────────────────────────────
resp = gql('{ posts { id title body indexRef createdAt } }', token=TOKEN)
check("getPosts", resp)

# ── 14. getPost com aliases ────────────────────
resp = gql("""
  query {
    post342: post(id: "342") { postId: id id title }
    post645: post(id: "645") { id postTitle: title }
  }
""", token=TOKEN)
check("getPost_aliases", resp)

# ── 15. getPost com fragmento e unixTimestamp ──
resp = gql("""
  fragment postFields on Post {
    id title body indexRef createdAt unixTimestamp
  }
  query {
    post1: post(id: "860") { ...postFields }
    post2: post(id: "342") { ...postFields }
  }
""", token=TOKEN)
check("getPost_fragment_unixTimestamp", resp)

# ── 16. getPost — não encontrado retorna null ──
resp = gql('{ post(id: "999999") { id title } }', token=TOKEN)
has_data = resp.get("data") is not None
if has_data and not resp.get("errors"):
    print("  ✅ PASS: getPost_not_found (retorna null sem erros)")
    PASS_COUNT += 1
else:
    msgs = [e.get("message", "?") for e in resp.get("errors", [])]
    print("  ❌ FAIL: getPost_not_found")
    print(f"     errors: {msgs}")
    FAIL_COUNT += 1

# ── 17. createPost ────────────────────────────
print("\n[ MUTATIONS ] — Posts")
resp = gql("""
  mutation {
    createPost(data: { title: "E2E Test Post", body: "Conteudo do post E2E" }) {
      id title body
      user { firstName }
      indexRef createdAt
    }
  }
""", token=TOKEN)
check("createPost", resp)
E2E_POST_ID = (resp.get("data") or {}).get("createPost", {}).get("id")
print(f"     => postId: {E2E_POST_ID}")

# ── 18. updatePost ────────────────────────────
if E2E_POST_ID:
    resp = gql(f"""
      mutation {{
        updatePost(postId: "{E2E_POST_ID}", data: {{ title: "E2E Updated Post" }}) {{
          id title
          user {{ firstName }}
        }}
      }}
    """, token=TOKEN)
    check("updatePost", resp)
else:
    print("  ⚠️  SKIP: updatePost (sem postId)")

# ── 19. createComment ─────────────────────────
print("\n[ MUTATIONS ] — Comments")
if E2E_POST_ID:
    resp = gql(f"""
      mutation {{
        createComment(data: {{ postId: "{E2E_POST_ID}", comment: "Comentario E2E" }}) {{
          id comment
          user {{ firstName }}
        }}
      }}
    """, token=TOKEN)
    check("createComment", resp)
else:
    print("  ⚠️  SKIP: createComment (sem postId)")

# ── 20. login como e2e user ───────────────────
print("\n[ MUTATIONS ] — E2E user update/delete")
resp = gql("""
  mutation {
    login(data: { userName: "e2e.test.user", password: "Senha123" }) {
      userId token
    }
  }
""")
check("login_e2e_user", resp)
E2E_TOKEN = (resp.get("data") or {}).get("login", {}).get("token", "")

# ── 21. updateUser ────────────────────────────
if E2E_USER_ID and E2E_TOKEN:
    resp = gql(f"""
      mutation {{
        updateUser(userId: "{E2E_USER_ID}", data: {{
          firstName: "E2EUpdated"
          lastName: "TestUpdated"
          userName: "e2e.test.user"
        }}) {{
          id firstName lastName userName
        }}
      }}
    """, token=E2E_TOKEN)
    check("updateUser", resp)
else:
    print("  ⚠️  SKIP: updateUser")

# ── 22. logout (elisa.pereira) ─────────────────
print("\n[ MUTATIONS ] — Logout")
resp = gql("""
  mutation {
    logout(userName: "elisa.pereira")
  }
""", token=TOKEN)
check("logout_elisa", resp)

# ── 23. deletePost — re-login se token expirado ─
print("\n[ MUTATIONS ] — Cleanup")
if E2E_POST_ID:
    resp = gql(f'mutation {{ deletePost(postId: "{E2E_POST_ID}") }}', token=TOKEN)
    if resp.get("errors") and "You have to log in" in str(resp["errors"]):
        re_login = gql('mutation { login(data: { userName: "elisa.pereira", password: "Senha123" }) { token } }')
        TOKEN = (re_login.get("data") or {}).get("login", {}).get("token", TOKEN)
        resp = gql(f'mutation {{ deletePost(postId: "{E2E_POST_ID}") }}', token=TOKEN)
    check("deletePost", resp)
else:
    print("  ⚠️  SKIP: deletePost")

# ── 24. deleteUser ────────────────────────────
if E2E_USER_ID and E2E_TOKEN:
    resp = gql(f'mutation {{ deleteUser(userId: "{E2E_USER_ID}") }}', token=E2E_TOKEN)
    check("deleteUser", resp)
else:
    print("  ⚠️  SKIP: deleteUser")

# ── 25. rotas sem auth devem rejeitar ──────────
print("\n[ SEGURANÇA ] — Rotas sem autenticação devem rejeitar")
check("getUser_sem_auth", gql('{ user(id: "602") { id } }'), expect_error=True)
check("getUsers_sem_auth", gql('{ users { id } }'), expect_error=True)
check("getPosts_sem_auth", gql('{ posts { id } }'), expect_error=True)
check("createPost_sem_auth", gql('mutation { createPost(data: { title: "x", body: "y" }) { id } }'), expect_error=True)

# ── 26. union types (não implementados) ──────────
print("\n[ INFO ] — Union types (PostError) — requerem refatoração no schema")
print("  ⚠️  SKIP: queries_0010/0011 (PostError/PostNotFoundError/PostTimeoutError fora do escopo atual)")

# ──────────────────────────────────────────────
print("\n=========================================")
print("  RESULTADO FINAL")
print("=========================================")
print(f"  ✅ Passou: {PASS_COUNT}")
print(f"  ❌ Falhou: {FAIL_COUNT}")
print(f"  Total:    {PASS_COUNT + FAIL_COUNT}")

if FAIL_COUNT > 0:
    sys.exit(1)

