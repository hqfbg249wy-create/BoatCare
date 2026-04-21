#!/usr/bin/env python3
"""
Surgical restore for service_providers.logo_url / cover_image_url after
migration 037 accidentally nulled them out.

Reads a Supabase backup (pg_dump SQL file, custom-format .dump, or a direct
connection to a restored-snapshot project) and UPDATES only the two image
URL columns on the LIVE database — without touching any other column or
table.

Usage
-----
Option A: from a plain-text pg_dump SQL file (easiest for Free tier users
who downloaded their backup):

    python3 scripts/restore/restore_provider_images.py \
        --from-sql-file ~/Downloads/supabase_backup_2026-04-05.sql \
        --live-db "postgresql://postgres:PASSWORD@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres" \
        --dry-run

Option B: directly from a second Supabase project where you restored the
snapshot (e.g. a PITR clone):

    python3 scripts/restore/restore_provider_images.py \
        --from-db "postgresql://postgres:PASSWORD@db.OLD_REF.supabase.co:5432/postgres" \
        --live-db "postgresql://postgres:PASSWORD@db.vcjwlyqkfkszumdrfvtm.supabase.co:5432/postgres"

Option C: from a JSON file you already exported via REST:

    python3 scripts/restore/restore_provider_images.py \
        --from-json service_providers_backup.json \
        --live-db "postgresql://..."

Drop --dry-run when the preview looks right.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip3 install psycopg2-binary", file=sys.stderr)
    sys.exit(2)


# ---------------------------------------------------------------------------
# Parsing sources
# ---------------------------------------------------------------------------

def rows_from_sql_file(path: Path) -> list[dict]:
    """Extract id/logo_url/cover_image_url from a pg_dump plain-text file.

    pg_dump writes the service_providers table either as INSERT INTO ...
    VALUES (...) rows or as a COPY block. We handle both.
    """
    text = path.read_text(encoding="utf-8", errors="replace")

    rows: list[dict] = []

    # --- COPY form ---------------------------------------------------------
    copy_match = re.search(
        r"COPY public\.service_providers \(([^)]+)\) FROM stdin;\n(.*?)\n\\\.",
        text,
        re.DOTALL,
    )
    if copy_match:
        columns = [c.strip() for c in copy_match.group(1).split(",")]
        body = copy_match.group(2)
        try:
            id_i = columns.index("id")
            logo_i = columns.index("logo_url")
            cover_i = columns.index("cover_image_url")
        except ValueError as e:
            print(f"ERROR: COPY header missing expected column: {e}", file=sys.stderr)
            sys.exit(3)

        for line in body.splitlines():
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) <= max(id_i, logo_i, cover_i):
                continue
            rows.append({
                "id": parts[id_i],
                "logo_url": None if parts[logo_i] == r"\N" else parts[logo_i],
                "cover_image_url": None if parts[cover_i] == r"\N" else parts[cover_i],
            })
        return rows

    # --- INSERT form -------------------------------------------------------
    insert_pat = re.compile(
        r"INSERT INTO public\.service_providers \(([^)]+)\) VALUES \((.*?)\);",
        re.DOTALL,
    )
    for m in insert_pat.finditer(text):
        columns = [c.strip() for c in m.group(1).split(",")]
        if "id" not in columns or "logo_url" not in columns or "cover_image_url" not in columns:
            continue
        values = _split_pg_values(m.group(2))
        if len(values) != len(columns):
            continue
        row = dict(zip(columns, values))
        rows.append({
            "id": _unquote(row["id"]),
            "logo_url": _unquote(row["logo_url"]),
            "cover_image_url": _unquote(row["cover_image_url"]),
        })
    return rows


def _split_pg_values(value_body: str) -> list[str]:
    """Naive but good-enough splitter for pg VALUES lists with quoted strings."""
    out: list[str] = []
    buf = ""
    in_str = False
    i = 0
    while i < len(value_body):
        ch = value_body[i]
        if ch == "'" and (i == 0 or value_body[i - 1] != "\\"):
            in_str = not in_str
            buf += ch
        elif ch == "," and not in_str:
            out.append(buf.strip())
            buf = ""
        else:
            buf += ch
        i += 1
    if buf.strip():
        out.append(buf.strip())
    return out


def _unquote(v: str) -> str | None:
    v = v.strip()
    if v.upper() == "NULL":
        return None
    if v.startswith("'") and v.endswith("'"):
        return v[1:-1].replace("''", "'")
    return v


def rows_from_db(dsn: str) -> list[dict]:
    """Read id/logo_url/cover_image_url directly from another Postgres DB."""
    with psycopg2.connect(dsn) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT id::text AS id, logo_url, cover_image_url
              FROM public.service_providers
             WHERE logo_url IS NOT NULL OR cover_image_url IS NOT NULL
        """)
        return [dict(r) for r in cur.fetchall()]


def rows_from_json(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for r in data:
        out.append({
            "id": str(r["id"]),
            "logo_url": r.get("logo_url"),
            "cover_image_url": r.get("cover_image_url"),
        })
    return out


# ---------------------------------------------------------------------------
# Merge into live DB
# ---------------------------------------------------------------------------

def apply_updates(rows: Iterable[dict], live_dsn: str, dry_run: bool) -> tuple[int, int]:
    """Only touches rows where the backup has a non-null value AND the live row
    is currently NULL. Never downgrades good data."""
    to_apply = [
        r for r in rows
        if (r.get("logo_url") or r.get("cover_image_url"))
    ]

    if not to_apply:
        print("Nothing to restore — backup has no non-null image URLs.")
        return 0, 0

    with psycopg2.connect(live_dsn) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id::text, logo_url, cover_image_url
                  FROM public.service_providers
            """)
            live = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

        planned_logo = 0
        planned_cover = 0
        updates = []
        for r in to_apply:
            pid = r["id"]
            if pid not in live:
                continue
            live_logo, live_cover = live[pid]
            new_logo = r["logo_url"] if live_logo is None and r.get("logo_url") else live_logo
            new_cover = r["cover_image_url"] if live_cover is None and r.get("cover_image_url") else live_cover
            if (new_logo, new_cover) == (live_logo, live_cover):
                continue
            if new_logo != live_logo:
                planned_logo += 1
            if new_cover != live_cover:
                planned_cover += 1
            updates.append((pid, new_logo, new_cover))

        print(f"Would update {planned_logo} logo_url and {planned_cover} cover_image_url values "
              f"across {len(updates)} rows.")

        if dry_run:
            print("Dry-run: no changes applied.")
            return planned_logo, planned_cover

        if not updates:
            return 0, 0

        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(
                cur,
                """
                UPDATE public.service_providers
                   SET logo_url = %s,
                       cover_image_url = %s,
                       updated_at = NOW()
                 WHERE id = %s::uuid
                """,
                [(u[1], u[2], u[0]) for u in updates],
                page_size=200,
            )
        conn.commit()
        print(f"✅ Restored image URLs on {len(updates)} rows.")
        return planned_logo, planned_cover


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--from-sql-file", type=Path, help="pg_dump .sql file")
    src.add_argument("--from-db", help="Source Postgres DSN (e.g. PITR clone)")
    src.add_argument("--from-json", type=Path, help="JSON file with {id, logo_url, cover_image_url}")
    ap.add_argument("--live-db", required=True, help="Live Postgres DSN (target of the UPDATE)")
    ap.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = ap.parse_args()

    if args.from_sql_file:
        rows = rows_from_sql_file(args.from_sql_file)
    elif args.from_db:
        rows = rows_from_db(args.from_db)
    else:
        rows = rows_from_json(args.from_json)

    print(f"Parsed {len(rows)} rows from backup source.")
    nonnull = [r for r in rows if r.get("logo_url") or r.get("cover_image_url")]
    print(f"  → {len(nonnull)} have a non-null image URL.")

    apply_updates(rows, args.live_db, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
