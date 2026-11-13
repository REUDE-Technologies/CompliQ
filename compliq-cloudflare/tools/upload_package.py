#!/usr/bin/env python3
"""upload_package.py - upload one inspection package to the CompliQ Worker API.

  python upload_package.py --api https://compliq.<account>.workers.dev --email eng@acme.com --org "Acme Wind" WTG-014_2026-11-04/

Re-running after a failure is safe: the server reports which images are still missing and only those are sent.
Needs: pip install requests
"""
import argparse
import getpass
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("package", type=Path, help="folder with manifest.json, points.json and images/")
    ap.add_argument("--api", required=True, help="base URL of the Worker")
    ap.add_argument("--email", required=True)
    ap.add_argument("--org", required=True, help="organization name, as on the sign-in page")
    ap.add_argument("--sector", default="wind", choices=["wind", "solar"])
    ap.add_argument("--password", help="omit to be prompted")
    ap.add_argument("--workers", type=int, default=4, help="parallel image uploads")
    args = ap.parse_args()

    s = requests.Session()
    s.headers["X-Requested-With"] = "compliq"
    r = s.post(f"{args.api}/api/auth/login",
               json={"email": args.email, "password": args.password or getpass.getpass("Password: "),
                     "organization": args.org, "sector": args.sector})
    if r.status_code != 200:
        sys.exit(f"login failed: {r.status_code} {r.text}")
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"   # works on http (local) and https

    manifest = json.loads((args.package / "manifest.json").read_text())
    points = json.loads((args.package / "points.json").read_text())
    r = s.post(f"{args.api}/api/inspections", json={"manifest": manifest, "points": points})
    if r.status_code == 422:
        sys.exit("package rejected:\n  " + "\n  ".join(r.json().get("errors", [])))
    r.raise_for_status()
    job = r.json()
    inspection_id, missing = job["inspection_id"], job["missing_images"]
    print(f"inspection {inspection_id}: {job['status']}, {len(missing)} images to send")

    def put(code):
        data = (args.package / "images" / f"{code}.webp").read_bytes()
        resp = s.put(f"{args.api}/api/inspections/{inspection_id}/images/{code}", data=data,
                     headers={"Content-Type": "image/webp"})
        return code, resp.status_code, resp.text

    failed = []
    with ThreadPoolExecutor(args.workers) as ex:
        for code, status, text in ex.map(put, missing):
            if status != 200:
                failed.append(code)
                print(f"  {code}: {status} {text}")
    if failed:
        sys.exit(f"{len(failed)} images failed - run the same command again to retry them")

    r = s.post(f"{args.api}/api/inspections/{inspection_id}/complete")
    print("complete:", r.status_code, r.json())
    if r.status_code != 200:
        sys.exit(1)


if __name__ == "__main__":
    main()
