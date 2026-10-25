#!/usr/bin/env python3
"""The account backend's invariants, checked as text.

Three kinds of bug are cheap to make and expensive to notice in a Supabase project:

1. **A table with RLS on but the default grants still in place.** Policies do not take a privilege
   away; `anon` keeps whatever `grant all` gave it. Every table here must revoke before it grants.
2. **A role table the browser can write.** Then "only an admin can grant an admin" is a rule in
   React, and anyone with the anon key is an admin.
3. **A privileged call the page makes without the server checking again.** The page may hide a
   button; the function still has to read the caller's identity and role from the JWT.

These tests read the SQL and the Edge Functions as text. They are not a substitute for running
against a staging project — that is `docs/ACCOUNTS.md` — but they fail on the regressions that a
staging run would only catch after someone remembered to try.

Run: `python3 tests/test_accounts_schema.py` (also discovered by `python3 -m unittest discover`).
"""

import json
import os
import re
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS = os.path.join(ROOT, "supabase", "migrations")
FUNCTIONS = os.path.join(ROOT, "supabase", "functions")
APP_SRC = os.path.join(ROOT, "app", "src")


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def migration_text():
    paths = sorted(os.path.join(MIGRATIONS, name) for name in os.listdir(MIGRATIONS))
    return "\n".join(read(path) for path in paths if path.endswith(".sql"))


class TablePrivilegeTests(unittest.TestCase):
    def setUp(self):
        self.sql = migration_text()
        self.tables = sorted(set(re.findall(r"create table if not exists public\.(\w+)", self.sql)))

    def test_the_account_tables_exist(self):
        for table in (
            "mechalab_progress",
            "mechalab_workspace",
            "mechalab_roles",
            "mechalab_audit",
            "mechalab_site_settings",
        ):
            with self.subTest(table=table):
                self.assertIn(
                    table,
                    self.tables,
                    msg=f"expected a migration to create {table}; the app and the functions both query it",
                )

    def test_every_table_enables_and_forces_row_level_security(self):
        for table in self.tables:
            with self.subTest(table=table):
                self.assertRegex(
                    self.sql,
                    rf"alter table public\.{table} enable row level security;",
                    msg=f"expected {table} to enable RLS; without it the anon key reads every row",
                )
                self.assertRegex(
                    self.sql,
                    rf"alter table public\.{table} force row level security;",
                    msg=f"expected {table} to force RLS so even the table owner's policies apply",
                )

    def test_every_table_revokes_the_default_grants_first(self):
        for table in self.tables:
            with self.subTest(table=table):
                self.assertRegex(
                    self.sql,
                    rf"revoke all on table public\.{table} from anon, authenticated;",
                    msg=f"expected {table} to revoke Supabase's default grants; a policy cannot remove a privilege",
                )

    def test_roles_are_read_only_for_the_browser(self):
        role_grants = re.findall(
            r"grant ([^;]+?) on table public\.mechalab_roles to ([^;]+);", self.sql
        )
        self.assertTrue(
            role_grants,
            msg="expected an explicit select grant on mechalab_roles; the panel reads the caller's own role",
        )
        for verbs, roles in role_grants:
            with self.subTest(verbs=verbs, roles=roles):
                self.assertEqual(
                    verbs.strip().lower(),
                    "select",
                    msg=f"expected only select on the role table, got {verbs}; a write there lets a learner promote themselves",
                )
                self.assertNotIn(
                    "anon",
                    roles,
                    msg=f"expected the role table to grant nothing to anon, got {roles}; signed-out visitors need no role",
                )

    def test_the_audit_log_has_no_browser_grant(self):
        self.assertNotRegex(
            self.sql,
            r"grant [^;]+ on table public\.mechalab_audit to",
            msg="expected no browser grant on the audit log; it is read through admin-action, which checks the role",
        )

    def test_site_settings_are_readable_and_not_writable(self):
        grants = re.findall(
            r"grant ([^;]+?) on table public\.mechalab_site_settings to ([^;]+);", self.sql
        )
        self.assertTrue(
            grants,
            msg="expected a public select grant on mechalab_site_settings; the announcement needs no sign-in",
        )
        for verbs, _ in grants:
            self.assertEqual(
                verbs.strip().lower(),
                "select",
                msg=f"expected only select on site settings, got {verbs}; an announcement is not a browser write",
            )

    def test_no_write_policy_is_open_to_everyone(self):
        for match in re.finditer(
            r"create policy [^;]+? on public\.(\w+)\s+for (insert|update|delete)[^;]*?;", self.sql
        ):
            table, operation = match.group(1), match.group(2)
            with self.subTest(table=table, operation=operation):
                body = match.group(0)
                self.assertNotIn(
                    "using (true)",
                    body,
                    msg=f"expected {table}'s {operation} policy to name a user, not `using (true)`; that is a public write",
                )
                self.assertNotIn(
                    "with check (true)",
                    body,
                    msg=f"expected {table}'s {operation} policy to check a user, not `with check (true)`; that is a public write",
                )
                self.assertIn(
                    "auth.uid() = user_id",
                    body,
                    msg=f"expected {table}'s {operation} policy to compare auth.uid() with user_id, which is the own-row rule",
                )

    def test_the_admin_helper_is_pinned_and_not_public(self):
        self.assertIn(
            "security definer",
            self.sql,
            msg="expected mechalab_is_admin to be security definer; otherwise its own role policy recurses",
        )
        self.assertIn(
            "set search_path = public, pg_temp",
            self.sql,
            msg="expected the admin helper to pin search_path, as a security-definer function must",
        )
        self.assertRegex(
            self.sql,
            r"revoke all on function public\.mechalab_is_admin\(\) from public;",
            msg="expected the admin helper to be revoked from public and granted only to authenticated",
        )


class EdgeFunctionTests(unittest.TestCase):
    def function(self, name):
        return read(os.path.join(FUNCTIONS, name, "index.ts"))

    def shared(self):
        return read(os.path.join(FUNCTIONS, "_shared", "http.ts"))

    def test_the_shared_helper_reads_the_role_and_requires_a_second_factor(self):
        text = self.shared()
        for needle, why in (
            ("SUPABASE_SERVICE_ROLE_KEY", "the role lookup needs the service client"),
            ("getUser()", "the caller must come from the JWT, not the body"),
            ("mechalab_roles", "the role must be read from its own table"),
            ("getAuthenticatorAssuranceLevel", "admin writes must check the session's assurance level"),
            ("aal2", "the check must require a two-factor session"),
        ):
            with self.subTest(needle=needle):
                self.assertIn(
                    needle,
                    text,
                    msg=f"expected _shared/http.ts to contain {needle!r}: {why}",
                )

    def test_every_privileged_function_checks_the_caller_on_the_server(self):
        for name in ("account-action", "admin-action", "curriculum-pr"):
            with self.subTest(function=name):
                text = self.function(name)
                self.assertTrue(
                    "requireAdmin(" in text or "auth.getUser()" in text,
                    msg=f"expected {name} to establish the caller from the JWT before doing anything",
                )
                self.assertIn(
                    "_shared/http.ts",
                    text,
                    msg=f"expected {name} to use the shared authorization helper rather than its own copy",
                )

    def test_admin_writes_are_reauthorized_and_audited(self):
        text = self.function("admin-action")
        for needle, why in (
            ("requireAdmin(req)", "the role must be re-read on every call"),
            ("await audit(", "every admin write must leave an audit row"),
            ("last admin", "the last admin must not be able to lock the site out"),
        ):
            with self.subTest(needle=needle):
                self.assertIn(
                    needle,
                    text,
                    msg=f"expected admin-action to contain {needle!r}, because {why}",
                )

    def test_account_deletion_uses_the_callers_identity_and_requires_confirmation(self):
        text = self.function("account-action")
        self.assertIn(
            "deleteUser(user.id)",
            text,
            msg="expected deletion to target the JWT's user id; a body-supplied id could delete anyone",
        )
        self.assertIn(
            "body.confirmation !== 'DELETE'",
            text,
            msg="expected the server to refuse a deletion without the typed confirmation, not only the form",
        )
        self.assertNotIn(
            "body.userId",
            text,
            msg="expected no user id in the delete request body; identity comes from the session",
        )

    def test_the_github_key_never_leaves_the_function(self):
        text = self.function("curriculum-pr")
        for needle, why in (
            ("GITHUB_APP_PRIVATE_KEY", "the App key must be read server-side"),
            ("/pulls", "the workflow must open a pull request rather than commit to the branch"),
            ("LESSON_PATH", "the lesson path must be validated before it reaches GitHub"),
        ):
            with self.subTest(needle=needle):
                self.assertIn(needle, text, msg=f"expected curriculum-pr to contain {needle!r}: {why}")
        self.assertNotIn(
            "VITE_",
            text,
            msg="expected no build-time VITE_ variable in a server function; it would be copied into the bundle",
        )

    def test_no_server_only_name_appears_in_the_browser_bundle(self):
        forbidden = ("SERVICE_ROLE", "service_role", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_ID")
        offenders = []
        for folder, _, names in os.walk(APP_SRC):
            for name in names:
                if not name.endswith((".ts", ".tsx", ".js", ".mjs")):
                    continue
                path = os.path.join(folder, name)
                text = read(path)
                for needle in forbidden:
                    if needle in text:
                        offenders.append(f"{os.path.relpath(path, ROOT)}: {needle}")
        self.assertEqual(
            offenders,
            [],
            msg=f"expected no server-only credential names in app/src, found {offenders}; the bundle is public",
        )

    def test_the_bundle_reads_only_publishable_build_variables(self):
        allowed = {"VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"}
        used = set()
        for folder, _, names in os.walk(APP_SRC):
            for name in names:
                if not name.endswith((".ts", ".tsx", ".js", ".mjs")):
                    continue
                used.update(re.findall(r"VITE_[A-Z0-9_]+", read(os.path.join(folder, name))))
        self.assertEqual(
            used - allowed,
            set(),
            msg=f"expected only the publishable Supabase variables in app/src, found {sorted(used - allowed)}",
        )


class DocumentationTests(unittest.TestCase):
    def test_accounts_doc_covers_setup_redirects_and_the_privacy_story(self):
        text = read(os.path.join(ROOT, "docs", "ACCOUNTS.md")).lower()
        for needle in (
            "callback",
            "redirect",
            "google",
            "staging",
            "export",
            "delete",
            "what leaves the browser",
            "row level security",
            "supabase functions deploy",
        ):
            with self.subTest(needle=needle):
                self.assertIn(
                    needle,
                    text,
                    msg=f"expected docs/ACCOUNTS.md to cover {needle!r}; setup and privacy are part of the feature",
                )

    def test_admin_doc_names_the_bootstrap_and_the_boundary(self):
        text = read(os.path.join(ROOT, "docs", "ADMIN.md")).lower()
        for needle in ("out of band", "two-factor", "audit", "pull request", "cannot"):
            with self.subTest(needle=needle):
                self.assertIn(
                    needle,
                    text,
                    msg=f"expected docs/ADMIN.md to cover {needle!r}; the role boundary must be written down",
                )

    def test_the_test_scripts_are_declared(self):
        scripts = json.loads(read(os.path.join(ROOT, "package.json")))["scripts"]
        for name in ("test:accounts", "test:schema"):
            with self.subTest(script=name):
                self.assertIn(
                    name,
                    scripts,
                    msg=f"expected package.json to declare {name}; CI and the docs both name it",
                )


if __name__ == "__main__":
    unittest.main(verbosity=2)
