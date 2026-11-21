#!/usr/bin/env python3
"""YEONJI ARCHIVE photo pipeline.

Track A: conservative Playwright collector for pages you are authorized to automate.
Track B: local photo folder -> originals, WebP thumbs, JSON, existing React PHOTO data.
No login bypassing, stealth patches, CAPTCHA handling, or automated rate-limit evasion.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import re
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "public/gallery/gallery_data.json"
ASSETS = ROOT / "public/gallery/assets"
INPUT = ROOT / "photo_sources"
MANIFEST = INPUT / "manifest.csv"
SESSION = ROOT / ".local_playwright_session"  # NEVER COMMIT
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
REQUIRED_TAGS = ["트리플에스", "연지"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def valid_date(value: str | None) -> str | None:
    v = (value or "").strip()[:10]
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            datetime.strptime(v, "%Y-%m-%d")
            return v
    except ValueError:
        pass
    return None


def url_ok(s: str | None) -> str:
    try:
        p = urlsplit((s or "").strip())
        return (s or "").strip() if p.scheme in ("https", "http") and p.netloc else ""
    except ValueError:
        return ""


def url_key(url: str | None) -> str:
    """Preserve CDN auth/resize params; remove only known marketing tracking params."""
    url = url_ok(url)
    if not url:
        return ""
    p = urlsplit(url)
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
         if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path, urlencode(sorted(q)), ""))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def has_tags(text: str, tags: list[str] = REQUIRED_TAGS) -> bool:
    # Exact hashtags, not arbitrary substring matches (#연지방 is not #연지).
    norm = (text or "").casefold()
    return all(re.search(r"(?<![\w])#" + re.escape(t.casefold()) + r"(?![\w])", norm) for t in tags)


def empty_data() -> dict:
    return {"schemaVersion": 1, "updatedAt": now(), "photos": []}


def load_data(path: Path = DATA) -> dict:
    if not path.exists():
        return empty_data()
    result = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(result, list):
        return {"schemaVersion": 1, "updatedAt": now(), "photos": result}
    if not isinstance(result, dict) or not isinstance(result.get("photos"), list):
        raise ValueError(f"Bad JSON shape: {path}")
    return result


def save_data(value: dict, path: Path = DATA) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    value["schemaVersion"] = 1
    value["updatedAt"] = now()
    content = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".gallery.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            out.write(content)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def merge(data: dict, incoming: list[dict]) -> tuple[int, int]:
    rows = data["photos"]
    by_id = {str(r.get("id", "")): r for r in rows}
    by_url = {url_key(r.get("image")): r for r in rows if url_key(r.get("image"))}
    by_hash = {r.get("sha256"): r for r in rows if r.get("sha256")}
    added, dup = 0, 0
    for row in incoming:
        if not row.get("image") or not row.get("id"):
            continue
        u = url_key(row.get("image"))
        digest = row.get("sha256")
        existing = by_id.get(row["id"]) or (by_url.get(u) if u else None) or (by_hash.get(digest) if digest else None)
        if existing is not None:
            # Re-running with manifest.csv approved=yes must upgrade the same item.
            # Never downgrade an approved item or overwrite its editor-written text.
            if row.get("status") == "approved":
                existing["status"] = "approved"
            for field in ("date", "sourceUrl", "originalCreator"):
                if not existing.get(field) and row.get(field):
                    existing[field] = row[field]
            dup += 1
            continue
        rows.append(row)
        by_id[row["id"]] = row
        if u:
            by_url[u] = row
        if digest:
            by_hash[digest] = row
        added += 1
    rows.sort(key=lambda x: (x.get("date") or "", x.get("id") or ""), reverse=True)
    return added, dup


def read_manifest(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as f:
        return {r["filename"].replace("\\", "/").strip(): r
                for r in csv.DictReader(f) if r.get("filename")}


def local_photo_date(rel: Path, meta: dict) -> tuple[str | None, str]:
    if valid_date(meta.get("date")):
        return valid_date(meta.get("date")), "manifest"
    for component in rel.parts[:-1]:
        if valid_date(component):
            return component, "manual_folder"
    return None, "unverified"


def build(args: argparse.Namespace) -> None:
    from PIL import Image, ImageOps, UnidentifiedImageError

    inp = Path(args.input).resolve()
    out = Path(args.output).resolve()
    assets = Path(args.assets).resolve()
    manifest = read_manifest(Path(args.manifest).resolve())
    data = load_data(out)
    incoming: list[dict] = []
    thumb_dir = assets / "thumbs"
    original_dir = assets / "original"
    for folder in (thumb_dir, original_dir):
        folder.mkdir(parents=True, exist_ok=True)
    files = [p for p in inp.rglob("*") if p.is_file() and not p.is_symlink() and p.suffix.lower() in EXTENSIONS]
    for src in sorted(files):
        rel = src.relative_to(inp)
        key = rel.as_posix()
        meta = manifest.get(key, {})
        digest = sha256_file(src)
        ext = src.suffix.lower()
        original_name = f"{digest[:24]}{ext}"
        thumb_name = f"{digest[:24]}.webp"
        original = original_dir / original_name
        thumb = thumb_dir / thumb_name
        try:
            with Image.open(src) as im:
                im.verify()
            with Image.open(src) as im:
                image = ImageOps.exif_transpose(im)
                width, height = image.size
                if width < 64 or height < 64:
                    print(f"SKIP too small: {src}")
                    continue
                if not thumb.exists():
                    image.thumbnail((750, 1050), Image.Resampling.LANCZOS)
                    if image.mode not in ("RGB", "RGBA"):
                        image = image.convert("RGB")
                    image.save(thumb, "WEBP", quality=78, method=5)
        except (OSError, UnidentifiedImageError, ValueError) as exc:
            print(f"SKIP invalid image: {src} ({exc})")
            continue
        if not original.exists():
            shutil.copy2(src, original)  # Original is copied byte-for-byte.
        date, date_source = local_photo_date(rel, meta)
        source_url = url_ok(meta.get("sourceUrl"))
        author = (meta.get("author") or "").strip()
        approved = str(meta.get("approved") or "").strip().lower() in ("yes", "true", "1")
        # Do not publish unknown-provenance files without explicit approval.
        status = "approved" if approved and (source_url or author) else "pending"
        incoming.append({
            "id": f"yj-local-{digest[:24]}",
            "image": f"assets/original/{original_name}",
            "thumb": f"assets/thumbs/{thumb_name}",
            "sha256": digest,
            "date": date,
            "dateSource": date_source,
            "title": (meta.get("caption") or "곽연지").strip(),
            "tags": [t.strip().lstrip("#") for t in (meta.get("tags") or "").split("|") if t.strip()],
            "sourceUrl": source_url or None,
            "source": (meta.get("source") or "LOCAL").strip(),
            "originalCreator": author or None,
            "curator": "빵시온",
            "status": status,
            "width": width,
            "height": height,
        })
    count, dup = merge(data, incoming)
    save_data(data, out)
    print(f"LOCAL import: files={len(files)}, added={count}, duplicates={dup}, total={len(data['photos'])}")
    print(f"Approved={sum(r.get('status') == 'approved' for r in data['photos'])}, pending={sum(r.get('status') != 'approved' for r in data['photos'])}")


# Conservative DOM extractor. No unofficial APIs, stealth, login bypass, or endpoint guessing.
EXTRACT_JS = r"""({maxItems}) => {
  const containers = [...document.querySelectorAll('article, [role="article"], .gallerybox, [data-gallery-item]')];
  const posts = containers.length ? containers : [document.querySelector('main') || document.body];
  const out = [];
  for (const post of posts) {
    const text = (post.innerText || '').slice(0, 1500);
    const time = post.querySelector('time[datetime]')?.getAttribute('datetime') || null;
    const anchors = [...post.querySelectorAll('a[href]')];
    const postLink = anchors.find(a => /\/(status|p|reel)\//i.test(a.getAttribute('href') || '')) || anchors[0];
    let href = postLink?.href || location.href;
    for (const img of post.querySelectorAll('img')) {
      const src = img.currentSrc || img.getAttribute('src') || '';
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (!src.startsWith('http') || Math.min(w, h) < 140) continue;
      out.push({image:src, sourceUrl:href, caption:text, date:time, alt:img.alt || '', context:containers.length ? 'post' : 'page'});
      if (out.length >= maxItems) return out;
    }
  }
  return out;
}"""


def scan(args: argparse.Namespace) -> None:
    if not args.authorized:
        raise SystemExit("Track A requires --authorized after confirming that your source permits automation.")
    if not args.url:
        raise SystemExit("Provide at least one --url of a page you may legally automate.")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit("Run pip install -r requirements.txt && python -m playwright install chromium") from exc
    data = load_data(Path(args.output).resolve())
    incoming: list[dict] = []
    session_dir = Path(args.session_dir).resolve()
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(session_dir), headless=False, viewport={"width": 1250, "height": 880}
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            if args.login:
                page.goto(args.login, wait_until="domcontentloaded", timeout=30000)
                print("Log in manually in the opened browser. This session stays on your machine.")
                input("Press ENTER after login (never paste a password in this terminal): ")
            for link in args.url:
                if not url_ok(link):
                    print(f"SKIP invalid URL: {link}")
                    continue
                hostname = (urlsplit(link).hostname or "").lower()
                if args.allow_host and hostname not in [h.lower() for h in args.allow_host]:
                    print(f"SKIP host not permitted by --allow-host: {hostname}")
                    continue
                try:
                    response = page.goto(link, wait_until="domcontentloaded", timeout=25000)
                    if response and response.status in (401, 403, 429):
                        print(f"STOP: HTTP {response.status}; don't retry until permitted ({link})")
                        break
                    page.wait_for_timeout(1000)
                    values = page.evaluate(EXTRACT_JS, {"maxItems": args.max_items})
                    for r in values:
                        if args.require_tags and not has_tags(r.get("caption", "")):
                            continue
                        image = url_ok(r.get("image"))
                        if not image:
                            continue
                        key = url_key(image)
                        date = valid_date(r.get("date"))
                        incoming.append({
                            "id": "yj-web-" + hashlib.sha256(key.encode()).hexdigest()[:24],
                            "image": image, "thumb": image,
                            "date": date, "dateSource": "html-time" if date else "unverified",
                            "title": (r.get("alt") or "곽연지").strip()[:120],
                            "tags": REQUIRED_TAGS if args.require_tags else [],
                            "sourceUrl": url_ok(r.get("sourceUrl")) or link,
                            "source": hostname,
                            "originalCreator": None,
                            "curator": "빵시온",
                            "status": "approved" if args.publish and r.get("context") == "post" else "pending",
                        })
                    print(f"Scanned {hostname}: {len(values)} DOM images; matching candidates to date: {len(incoming)}")
                except Exception as exc:
                    print(f"SCAN ERROR (skipped, no bypass attempted): {type(exc).__name__}: {exc}")
                # Responsible pacing, never evade 403, 429, or challenges.
                time.sleep(max(3.0, args.delay) + random.uniform(0, 1.0))
        finally:
            context.close()
    added, dup = merge(data, incoming)
    save_data(data, Path(args.output).resolve())
    print(f"WEB candidates saved: added={added}, duplicates={dup}. Publication requires approved status.")


def approve(args: argparse.Namespace) -> None:
    data = load_data(Path(args.output).resolve())
    ids = set(args.id)
    n = 0
    for row in data["photos"]:
        if row.get("id") in ids:
            row["status"] = "approved"
            n += 1
    save_data(data, Path(args.output).resolve())
    print(f"Approved {n} items (requested {len(ids)}).")


def sync_archive(args: argparse.Namespace) -> None:
    """Append to existing React PhotoArchive data without deleting existing photos."""
    src = Path(args.input).resolve()
    dest = Path(args.photos_json).resolve()
    data = load_data(src)
    if not dest.exists():
        raise SystemExit(f"Missing original React PHOTO data: {dest}")
    rows = json.loads(dest.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("Existing public/data/photos.json should be a JSON array. No change made.")
    ids = {r.get("id") for r in rows if isinstance(r, dict)}
    norm_urls = {url_key(r.get("image")) for r in rows if isinstance(r, dict) and url_key(r.get("image"))}
    added = 0
    for r in data["photos"]:
        if r.get("status") != "approved":
            continue
        image = r.get("image", "")
        if image.startswith("assets/"):
            image = "gallery/" + image
        if not image or r.get("id") in ids or (url_key(image) and url_key(image) in norm_urls):
            continue
        photo = {
            "id": r["id"], "category": "photo", "memberId": "S12",
            "image": image,
            "title": {"ko": r.get("title") or "곽연지", "en": "Kwak YeonJi"},
            "album": {"ko": "종합 사진 전시관", "en": "Photo Gallery"},
            "date": r.get("date"),
            "credit": {"ko": "빵시온", "en": "@bbangshion"},
            "originalCreator": r.get("originalCreator"),
            "sourceUrl": r.get("sourceUrl"),
            "tags": ["S12", "곽연지"] + r.get("tags", []),
            "assetType": "curated-photo",
        }
        rows.append(photo)
        ids.add(r["id"])
        if url_key(image):
            norm_urls.add(url_key(image))
        added += 1
    fd, tmp = tempfile.mkstemp(dir=dest.parent, prefix=".photos.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    print(f"Existing React PHOTO updated: appended={added}, preserved={len(rows)-added}, total={len(rows)}")


def status(args: argparse.Namespace) -> None:
    rows = load_data(Path(args.output).resolve())["photos"]
    print(json.dumps({
        "total": len(rows),
        "approved": sum(r.get("status") == "approved" for r in rows),
        "pending": sum(r.get("status") != "approved" for r in rows),
        "newest_confirmed_date": max((r.get("date") for r in rows if valid_date(r.get("date"))), default=None),
    }, indent=2, ensure_ascii=False))


def main():
    cli = argparse.ArgumentParser(description="YEONJI ARCHIVE photo gallery importer")
    sub = cli.add_subparsers(dest="command", required=True)
    loc = sub.add_parser("build", help="Track B: scan local photos and make thumbnails")
    loc.add_argument("--input", default=str(INPUT))
    loc.add_argument("--output", default=str(DATA))
    loc.add_argument("--assets", default=str(ASSETS))
    loc.add_argument("--manifest", default=str(MANIFEST))
    loc.set_defaults(func=build)
    a = sub.add_parser("scan", help="Track A: permissioned Playwright page scan")
    a.add_argument("--url", action="append", default=[])
    a.add_argument("--login", help="Login page for authorized browsing; manual login only")
    a.add_argument("--authorized", action="store_true", help="Confirm authorization from site owner")
    a.add_argument("--allow-host", action="append", default=[], help="Optional exact host allowlist")
    a.add_argument("--session-dir", default=str(SESSION))
    a.add_argument("--output", default=str(DATA))
    a.add_argument("--max-items", type=int, default=100)
    a.add_argument("--delay", type=float, default=4.0)
    a.add_argument("--no-require-tags", dest="require_tags", action="store_false",
                   help="Permit candidates missing exact tags; use manual review")
    a.add_argument("--publish", action="store_true", help="Publish directly ONLY where rights and relevance are verified")
    a.set_defaults(require_tags=True, func=scan)
    appr = sub.add_parser("approve", help="Approve reviewed IDs")
    appr.add_argument("--id", action="append", required=True)
    appr.add_argument("--output", default=str(DATA))
    appr.set_defaults(func=approve)
    sync = sub.add_parser("sync-archive", help="Append approved photos to existing React gallery")
    sync.add_argument("--input", default=str(DATA))
    sync.add_argument("--photos-json", default=str(ROOT / "public/data/photos.json"))
    sync.set_defaults(func=sync_archive)
    report = sub.add_parser("status")
    report.add_argument("--output", default=str(DATA))
    report.set_defaults(func=status)
    args = cli.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
