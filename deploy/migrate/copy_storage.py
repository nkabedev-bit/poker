#!/usr/bin/env python3
"""Copies the stored files (avatars, logos, posters, sounds) from the cloud project into
the self-hosted storage on this server.

The file list comes from storage.objects in the restored database. Each file is fetched
through the app's /media route on Vercel — the server in Russia cannot read files from
Supabase's own address, which sits behind Cloudflare — and uploaded to the local Storage
API. Files already here are skipped, so running it again only fetches what is missing;
--force copies everything anew.

    python3 deploy/migrate/copy_storage.py [--force]
"""

import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

VERCEL_HOST = "poker-two-liart.vercel.app"
LOCAL_API = "http://127.0.0.1:8000"
# /media only serves the club's public buckets; anything else is reported, not copied.
MEDIA_BUCKETS = {"player-avatars", "tournament-logos", "tournament-sounds"}


def service_key():
    with open("/opt/club/.env") as env:
        for line in env:
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("SUPABASE_SERVICE_ROLE_KEY is missing from /opt/club/.env")


def stored_objects():
    out = subprocess.run(
        [
            "docker", "exec", "supabase-db", "psql", "-h", "localhost", "-U", "postgres",
            "-At", "-F", "\t", "-c",
            "select bucket_id, name, coalesce(metadata->>'mimetype', 'application/octet-stream')"
            " from storage.objects order by bucket_id, name",
        ],
        check=True, capture_output=True, text=True,
    ).stdout
    return [line.split("\t") for line in out.splitlines() if line]


def already_here(bucket, name):
    # Reads the first byte: HEAD answers from the restored metadata alone and says 200
    # for a file that was never copied.
    probe = urllib.request.Request(
        f"{LOCAL_API}/storage/v1/object/public/{bucket}/{quoted(name)}",
        headers={"Range": "bytes=0-0"},
    )
    try:
        with urllib.request.urlopen(probe, timeout=15) as answer:
            return answer.status in (200, 206)
    except urllib.error.HTTPError:
        return False


def quoted(path):
    return "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))


def main():
    key = service_key()
    force = "--force" in sys.argv[1:]
    copied, present, skipped, failed = 0, 0, [], []

    for bucket, name, mimetype in stored_objects():
        if bucket not in MEDIA_BUCKETS:
            skipped.append(f"{bucket}/{name}")
            continue

        if not force and already_here(bucket, name):
            present += 1
            continue

        source = f"https://{VERCEL_HOST}/media/{bucket}/{quoted(name)}"
        try:
            # DNS hands out Vercel addresses that Russian networks cut; curl pins one
            # that gets through, the same one the app's container uses.
            body = subprocess.run(
                ["curl", "-sf", "--max-time", "60", "--retry", "3", "--retry-all-errors", "--retry-delay", "2", "--resolve", f"{VERCEL_HOST}:443:76.76.21.21", source],
                check=True, capture_output=True,
            ).stdout
        except subprocess.CalledProcessError as error:
            failed.append(f"{bucket}/{name}: download exit {error.returncode}")
            continue

        upload = urllib.request.Request(
            f"{LOCAL_API}/storage/v1/object/{bucket}/{quoted(name)}",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {key}",
                "apikey": key,
                "Content-Type": mimetype,
                "x-upsert": "true",
            },
        )
        try:
            with urllib.request.urlopen(upload, timeout=60):
                copied += 1
        except urllib.error.HTTPError as error:
            failed.append(f"{bucket}/{name}: upload {error.code} {error.read()[:120]!r}")

    print(f"copied {copied}, already here {present}, skipped {len(skipped)} outside /media buckets, failed {len(failed)}")
    for line in skipped[:20] + failed[:20]:
        print("  ", line)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
