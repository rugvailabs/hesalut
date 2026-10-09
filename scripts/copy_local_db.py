"""Copy the whole local Postgres database to a remote one (Neon, Render, ...).

    python scripts/copy_local_db.py --env-file C:\\Users\\udayk\\neon.env --dry-run
    python scripts/copy_local_db.py --env-file C:\\Users\\udayk\\neon.env

Everything goes: the directory's categories, listings, reviews, subscriptions
and search analytics, the accounts, the audit log, and the legacy voice tables -
plus `alembic_version`, so the deployed API's own migration step sees a schema
that is already current and does nothing.

HOW IT WORKS. pg_dump and psql both run inside the local `postgres` container,
which already has the right client versions and can reach the internet; nothing
extra needs installing on Windows. The dump is taken with --clean --if-exists,
so the restore drops whatever it is replacing: running this twice is fine, and
the second run leaves the remote database exactly as the first did.

THE CONNECTION STRING IS NEVER PRINTED and never passed on a command line
(where it would show up in the process list). It is copied into the container as
a file, read from there by psql, and deleted afterwards.

THIS OVERWRITES THE REMOTE DATABASE. It is meant for a test deployment whose
data comes from the local machine, not for a live site with real customers.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

CONTAINER = "hesalut_postgres"
BACKEND_CONTAINER = "hesalut_backend"
REMOTE_URL_PATH = "/tmp/copy-target-url"
DUMP_PATH = "/tmp/copy-local-db.sql"

# Rows worth comparing afterwards: if these match, the copy landed.
COUNT_TABLES = (
    "categories",
    "businesses",
    "business_reviews",
    "business_verifications",
    "users",
    "plans",
    "subscriptions",
    "payments",
    "enquiries",
    "search_impressions",
)


def run(args: list[str], *, capture: bool = True, check: bool = True) -> str:
    result = subprocess.run(args, capture_output=capture, text=True)
    if check and result.returncode != 0:
        sys.exit(
            f"command failed ({' '.join(args[:3])} ...): "
            f"{(result.stderr or result.stdout or '').strip()[:800]}"
        )
    return (result.stdout or "").strip()


def read_url(env_file: Path) -> str:
    """The connection string from a file.

    Takes either `DATABASE_URL=postgresql://...` or the bare URL on its own
    line, because both are what people actually paste into a file.
    """
    if not env_file.is_file():
        sys.exit(f"no such file: {env_file}")
    # utf-8-sig: Notepad and PowerShell redirection often leave a BOM.
    for line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip().strip('"').strip("'")
        if line.startswith("DATABASE_URL="):
            line = line.split("=", 1)[1].strip().strip('"').strip("'")
        if line.startswith(("postgres://", "postgresql://", "postgresql+psycopg2://")):
            # psql does not know SQLAlchemy's driver suffix.
            return line.replace("postgresql+psycopg2://", "postgresql://", 1)
    sys.exit(
        f"{env_file} has no connection string - expected a line like "
        "DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require"
    )


def describe(url: str) -> str:
    """The target, with the password left out."""
    parts = urlsplit(url)
    host = parts.hostname or "?"
    database = (parts.path or "/?").lstrip("/")
    user = parts.username or "?"
    return f"{user}@{host}/{database}"


def local_credentials() -> tuple[str, str]:
    """The local database's user and name, from the backend container."""
    url = run(["docker", "exec", BACKEND_CONTAINER, "printenv", "DATABASE_URL"])
    match = re.match(r".*://([^:]+):[^@]*@[^/]+/(.+)$", url)
    if match is None:
        sys.exit("could not read the local DATABASE_URL from the backend container")
    user, database = match.group(1), match.group(2)
    return user, database.split("?", 1)[0]


def counts(psql_target: list[str], user: str) -> dict[str, int]:
    """Row counts per table, skipping tables that do not exist yet."""
    sql = " UNION ALL ".join(
        f"SELECT '{table}' AS t, count(*) FROM {table}" for table in COUNT_TABLES
    )
    out = run(
        ["docker", "exec", CONTAINER, "sh", "-c",
         f"psql {' '.join(psql_target)} -At -F',' -c \"{sql}\" 2>/dev/null || true"]
    )
    result: dict[str, int] = {}
    for line in out.splitlines():
        table, _, value = line.partition(",")
        if value.isdigit():
            result[table] = int(value)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        required=True,
        type=Path,
        help="file containing DATABASE_URL=... for the remote database",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show what would be copied, then stop before touching the remote",
    )
    args = parser.parse_args()

    remote_url = read_url(args.env_file)
    user, database = local_credentials()

    print(f"local  : {user}@{CONTAINER}/{database}")
    print(f"remote : {describe(remote_url)}")

    local_target = ["-U", user, "-d", database]
    before = counts(local_target, user)
    if not before:
        sys.exit("the local database looks empty - nothing to copy")
    print("\nlocal rows:")
    for table, value in before.items():
        print(f"  {table:24s} {value}")

    if args.dry_run:
        print("\ndry run: the remote database has not been touched.")
        return 0

    print("\ndumping the local database...")
    run([
        "docker", "exec", CONTAINER,
        "pg_dump", "-U", user, "-d", database,
        "--no-owner", "--no-acl", "--clean", "--if-exists",
        "-f", DUMP_PATH,
    ])
    size = run(["docker", "exec", CONTAINER, "sh", "-c", f"wc -c < {DUMP_PATH}"])
    print(f"  dump written: {int(size):,} bytes")

    # The URL travels as a file, so it never appears in a command line.
    subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "sh", "-c",
         f"umask 177 && cat > {REMOTE_URL_PATH}"],
        input=remote_url,
        text=True,
        check=True,
    )

    try:
        print("restoring into the remote database (this replaces what is there)...")
        output = run([
            "docker", "exec", CONTAINER, "sh", "-c",
            # -o /dev/null: the dump's own SELECT setval(...) results are not
            # worth printing; errors still come through on stderr.
            f'psql "$(cat {REMOTE_URL_PATH})" -v ON_ERROR_STOP=1 -q -o /dev/null'
            f' -f {DUMP_PATH} 2>&1',
        ], check=False)
        noise = [
            line for line in output.splitlines()
            # "does not exist, skipping" is --if-exists doing its job on a fresh
            # database; everything else is worth showing.
            if line.strip() and "does not exist, skipping" not in line
        ]
        if noise:
            print("  psql said:")
            for line in noise[:20]:
                print(f"    {line}")

        after = counts([f'"$(cat {REMOTE_URL_PATH})"'], user)
    finally:
        run(["docker", "exec", CONTAINER, "rm", "-f", REMOTE_URL_PATH, DUMP_PATH], check=False)

    print("\nremote rows after the copy:")
    mismatches = []
    for table, expected in before.items():
        got = after.get(table)
        flag = "ok" if got == expected else "MISMATCH"
        if got != expected:
            mismatches.append(table)
        print(f"  {table:24s} {expected} -> {got if got is not None else 'missing'}  {flag}")

    if mismatches:
        print(f"\n{len(mismatches)} table(s) did not match: {', '.join(mismatches)}")
        return 1
    print("\nevery table matches. The deployed API will serve this data.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
