#!/usr/bin/env python3
"""Fits a data-only dump from the cloud to the self-hosted Supabase's service schemas.

The cloud runs newer versions of Supabase's own services (auth, storage) than the
self-hosted images, so its dump can carry tables and columns this database does not have
yet. Those are almost always empty; this drops every empty block of the service schemas
and the columns no row fills, and says so.
It refuses — exits with an error — rather than silently throw away a row of real data.

The club's own tables (schema public) are left alone: schema.sql creates them in the same
restore, exactly as the data expects.

    python3 fit_data.py data.sql > fitted.sql
"""

import re
import subprocess
import sys

COPY_LINE = re.compile(r'^COPY "([^"]+)"\."([^"]+)" \((.*)\) FROM stdin;$')
OWN_SCHEMAS = {"public"}


def target_columns():
    out = subprocess.run(
        [
            "docker", "exec", "supabase-db", "psql", "-h", "localhost", "-U", "postgres",
            "-At", "-F", "\t", "-c",
            "select table_schema, table_name, column_name from information_schema.columns",
        ],
        check=True, capture_output=True, text=True,
    ).stdout
    columns = {}
    for line in out.splitlines():
        schema, table, column = line.split("\t")
        columns.setdefault((schema, table), set()).add(column)
    return columns


def main():
    known = target_columns()
    notes, refused = [], []
    out = sys.stdout

    with open(sys.argv[1], encoding="utf-8") as dump:
        lines = iter(dump)
        for line in lines:
            match = COPY_LINE.match(line.rstrip("\n"))
            if not match or match.group(1) in OWN_SCHEMAS:
                out.write(line)
                continue

            schema, table, column_list = match.groups()
            columns = [c.strip().strip('"') for c in column_list.split(",")]
            rows = []
            for row in lines:
                if row.rstrip("\n") == "\\.":
                    break
                rows.append(row)

            have = known.get((schema, table))
            name = f"{schema}.{table}"
            # Nothing to restore, and some newer service tables are not writable by the
            # postgres role here (storage.buckets_vectors) — an empty block only fails.
            if not rows:
                continue
            if have is None:
                refused.append(f"{name}: {len(rows)} rows, table missing here")
                continue

            keep = [i for i, c in enumerate(columns) if c in have]
            dropped = [c for c in columns if c not in have]
            if dropped:
                lost = [r for r in rows if any(r.rstrip("\n").split("\t")[i] != "\\N" for i, c in enumerate(columns) if c in dropped)]
                if lost:
                    refused.append(f"{name}: {len(lost)} rows have values in {dropped}, missing here")
                    continue
                notes.append(f"{name}: columns {dropped} missing here, all empty — dropped")
                rows = ["\t".join(r.rstrip("\n").split("\t")[i] for i in keep) + "\n" for r in rows]

            kept_list = ", ".join(f'"{columns[i]}"' for i in keep)
            out.write(f'COPY "{schema}"."{table}" ({kept_list}) FROM stdin;\n')
            out.writelines(rows)
            out.write("\\.\n")

    for note in notes:
        print("  " + note, file=sys.stderr)
    if refused:
        for line in refused:
            print("  REFUSED " + line, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
