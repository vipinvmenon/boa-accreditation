#!/usr/bin/env python3
"""Static checks on migration files. No database needed, no credentials.

A column-count error found here costs nothing. Found at `db push` against the
hosted project it costs a failed migration, and — because Supabase applies
migrations in one transaction per file — a confusing partial state to reason
about at whatever hour you were pushing.

Four checks:
  1. every VALUES tuple has as many items as its column list
  2. $$ delimiters balance
  3. exactly one top-level `begin;` / `commit;` pair per file
  4. every `create function` is followed by a `set search_path` before its body

Check 4 is this project's own rule. A SECURITY DEFINER function without an
explicit search_path is a privilege-escalation vector, and one with
`search_path = public, private, pg_temp` silently fails to resolve
extensions.gen_random_bytes because pgcrypto lives in `extensions` on hosted
Supabase. Both mistakes are invisible until runtime.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "supabase" / "migrations"

failures = []


def fail(path, msg):
    failures.append(f"{path.name}: {msg}")


def strip_noise(sql: str) -> str:
    """Remove $$-quoted bodies and -- comments so scanning sees only statements."""
    sql = re.sub(r"\$\$.*?\$\$", "$$BODY$$", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", "", sql)
    return sql


def split_top_level(s: str):
    """Split on commas that are not inside parens, BRACKETS or quotes.

    Brackets matter: `array['site','bar']::public.boa_acc_zone[]` is ONE value
    containing commas. Tracking only parens counted each zone as a separate
    column and reported a 10-column insert as having 16 items — a false
    positive that would have taught everyone to ignore this check.
    """
    out, depth, buf, quote = [], 0, [], None
    for ch in s:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "'\"":
            quote = ch
            buf.append(ch)
        elif ch in "([":
            depth += 1
            buf.append(ch)
        elif ch in ")]":
            depth -= 1
            buf.append(ch)
        elif ch == "," and depth == 0:
            out.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    if "".join(buf).strip():
        out.append("".join(buf))
    return out


def check_file(path: Path):
    raw = path.read_text()

    # 2. $$ balance — on the raw text, before anything is stripped.
    if raw.count("$$") % 2 != 0:
        fail(path, f"odd number of $$ delimiters ({raw.count('$$')}) — a function body is unterminated")

    sql = strip_noise(raw)

    # 3. exactly one begin/commit pair
    begins = len(re.findall(r"^\s*begin;", sql, re.M | re.I))
    commits = len(re.findall(r"^\s*commit;", sql, re.M | re.I))
    if begins != 1 or commits != 1:
        fail(path, f"expected exactly one begin;/commit; pair, found {begins}/{commits}")

    # 1. VALUES arity
    for m in re.finditer(
        r"insert\s+into\s+[\w.\"]+\s*\(([^)]*)\)\s*values\s*(.+?)(?:;|on\s+conflict|returning)",
        sql,
        re.S | re.I,
    ):
        cols = [c for c in split_top_level(m.group(1)) if c.strip()]
        body = m.group(2)
        for tup in re.finditer(r"\(((?:[^()']|'(?:[^']|'')*'|\([^()]*\))*)\)", body):
            vals = [v for v in split_top_level(tup.group(1)) if v.strip()]
            if len(vals) != len(cols):
                line = raw[: m.start()].count("\n") + 1
                fail(path, f"line ~{line}: {len(cols)} columns but a VALUES tuple has {len(vals)} items")

    # 4. create function must set search_path
    for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(", sql, re.I):
        name = m.group(1)
        tail = sql[m.end() : m.end() + 700]
        head = tail.split("$$BODY$$")[0]
        if "search_path" not in head:
            line = raw[: m.start()].count("\n") + 1
            fail(path, f"line ~{line}: function {name} has no `set search_path` — see the module docstring")
        elif re.search(r"search_path\s*=\s*(?!'')", head) and "search_path = ''" not in head:
            line = raw[: m.start()].count("\n") + 1
            sp = re.search(r"search_path\s*=\s*([^\n]*)", head)
            print(f"  note  {path.name}:{line} {name} uses search_path {sp.group(1).strip()} "
                  f"(prefer '' with fully-qualified names)")


def main():
    if not MIGRATIONS.exists():
        print("check:sql — no supabase/migrations directory yet")
        return 0
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        print("check:sql — no migrations yet")
        return 0
    for f in files:
        check_file(f)
    if failures:
        print("\ncheck:sql FAILED:")
        for f in failures:
            print(f"  {f}")
        return 1
    print(f"check:sql OK — {len(files)} migration(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
