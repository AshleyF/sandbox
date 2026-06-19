"""
Dropbox photo captioner.

Walks every image in your Dropbox, runs each through `copilot -p ... --attachment ...`
to generate a caption, and writes batched JSON files of {path, dropbox_link, caption}.

Resumable: progress is tracked in a SQLite DB, so you can Ctrl+C and rerun.

Setup:
    pip install dropbox python-dotenv
    # fill in .env with DROPBOX_ACCESS_TOKEN

Run:
    python caption.py                    # process everything
    python caption.py --limit 5          # smoke test on 5 photos
    python caption.py --enumerate-only   # just list files, no captioning
    python caption.py --status           # show progress
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import logging
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Iterable

import dropbox
from dropbox.exceptions import ApiError, AuthError
from dropbox.files import FileMetadata
from dropbox.sharing import (
    CreateSharedLinkWithSettingsError,
    SharedLinkSettings,
)
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "progress.db"
CAPTIONS_DIR = ROOT / "captions"
LOG_DIR = ROOT / "logs"
TMP_DIR = ROOT / "tmp"
CAPTIONS_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)
TMP_DIR.mkdir(exist_ok=True)

IMAGE_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff",
    ".heic", ".heif",
}
# Formats we still skip: camera raw files where decoding is unreliable.
SKIP_EXTS = {".raw", ".cr2", ".nef", ".arw", ".dng"}

# Minimum file size for captioning (below this is almost always icons/pixels/glyphs)
MIN_SIZE_BYTES = 5120

# HEIC support via pillow-heif
try:
    from pillow_heif import register_heif_opener  # type: ignore
    register_heif_opener()
    _HEIF_OK = True
except Exception:
    _HEIF_OK = False


def is_junk(name: str, size: int | None) -> str | None:
    """Return a reason string if this file should be skipped, else None."""
    if name.startswith("._"):
        return "filter: resource fork"
    if size is not None and size < MIN_SIZE_BYTES:
        return f"filter: <{MIN_SIZE_BYTES}B"
    return None


def setup_logging() -> logging.Logger:
    log = logging.getLogger("captioner")
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(LOG_DIR / "captioner.log", encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(fh)
    log.addHandler(sh)
    return log


log = setup_logging()


# ---------- DB ----------

SCHEMA = """
CREATE TABLE IF NOT EXISTS photos (
    path           TEXT PRIMARY KEY,        -- Dropbox path_lower
    display_path   TEXT NOT NULL,           -- original-case path
    rev            TEXT,                    -- Dropbox file revision
    size           INTEGER,
    server_modified TEXT,
    dropbox_link   TEXT,
    caption        TEXT,
    status         TEXT NOT NULL DEFAULT 'pending', -- pending|done|skipped|error
    error          TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    batch_file     TEXT,
    captioned_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_status ON photos(status);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def db_connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None,
                          check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    return con


_db_lock = threading.Lock()  # serialize writers


# ---------- Dropbox ----------

def dbx_client() -> dropbox.Dropbox:
    load_dotenv(ROOT / ".env")
    refresh_token = os.environ.get("DROPBOX_REFRESH_TOKEN", "").strip()
    app_key = os.environ.get("DROPBOX_APP_KEY", "").strip()
    app_secret = os.environ.get("DROPBOX_APP_SECRET", "").strip()
    access_token = os.environ.get("DROPBOX_ACCESS_TOKEN", "").strip()

    if refresh_token and app_key and app_secret:
        dbx = dropbox.Dropbox(
            oauth2_refresh_token=refresh_token,
            app_key=app_key,
            app_secret=app_secret,
            timeout=60,
        )
    elif access_token:
        log.warning("Using short-lived DROPBOX_ACCESS_TOKEN; will expire in ~4 hours. "
                    "Run `python caption.py auth` to set up a refresh token.")
        dbx = dropbox.Dropbox(access_token, timeout=60)
    else:
        raise SystemExit(
            "No Dropbox credentials. Set DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + "
            "DROPBOX_APP_SECRET in .env (run `python caption.py auth`), or set "
            "DROPBOX_ACCESS_TOKEN for a short-lived token."
        )
    try:
        dbx.users_get_current_account()
    except AuthError as e:
        raise SystemExit(f"Dropbox auth failed: {e}")
    return dbx


def cmd_auth() -> None:
    """One-time helper to obtain a Dropbox refresh token."""
    load_dotenv(ROOT / ".env")
    app_key = os.environ.get("DROPBOX_APP_KEY", "").strip()
    app_secret = os.environ.get("DROPBOX_APP_SECRET", "").strip()
    if not app_key or not app_secret:
        print("First, set DROPBOX_APP_KEY and DROPBOX_APP_SECRET in .env.")
        print("Find them at: https://www.dropbox.com/developers/apps -> your app -> Settings tab")
        return
    auth_url = (
        f"https://www.dropbox.com/oauth2/authorize"
        f"?client_id={app_key}"
        f"&response_type=code"
        f"&token_access_type=offline"
    )
    print("\n1) Open this URL in a browser and approve:")
    print(f"   {auth_url}")
    print("\n2) Copy the authorization code shown after approval, paste here:")
    code = input("   code: ").strip()
    import requests
    r = requests.post(
        "https://api.dropboxapi.com/oauth2/token",
        data={"code": code, "grant_type": "authorization_code"},
        auth=(app_key, app_secret),
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    refresh = data.get("refresh_token")
    if not refresh:
        print("No refresh_token returned:", data)
        return
    print("\n3) Refresh token obtained. Add this line to your .env:")
    print(f"\n   DROPBOX_REFRESH_TOKEN={refresh}\n")
    print("You can then remove or ignore DROPBOX_ACCESS_TOKEN. Done.")


def is_image(name: str) -> bool:
    ext = Path(name).suffix.lower()
    return ext in IMAGE_EXTS


def is_skipped_image(name: str) -> bool:
    ext = Path(name).suffix.lower()
    return ext in SKIP_EXTS


def enumerate_photos(dbx: dropbox.Dropbox, roots: list[str], con: sqlite3.Connection) -> int:
    """Walk Dropbox under each root and insert rows for any image not seen before."""
    total_new = 0
    for root in roots:
        log.info(f"Enumerating Dropbox path: {root!r}")
        try:
            res = dbx.files_list_folder(root, recursive=True, include_non_downloadable_files=False)
        except ApiError as e:
            log.error(f"list_folder failed for {root!r}: {e}")
            continue
        while True:
            batch_new = 0
            with _db_lock:
                cur = con.cursor()
                cur.execute("BEGIN")
                for entry in res.entries:
                    if not isinstance(entry, FileMetadata):
                        continue
                    name = entry.name
                    if is_skipped_image(name):
                        cur.execute(
                            "INSERT OR IGNORE INTO photos(path, display_path, rev, size, server_modified, status, error) "
                            "VALUES(?,?,?,?,?,?,?)",
                            (entry.path_lower, entry.path_display, entry.rev, entry.size,
                             entry.server_modified.isoformat() if entry.server_modified else None,
                             "skipped", "filter: raw format"),
                        )
                        continue
                    if not is_image(name):
                        continue
                    junk = is_junk(name, entry.size)
                    if junk:
                        cur.execute(
                            "INSERT OR IGNORE INTO photos(path, display_path, rev, size, server_modified, status, error) "
                            "VALUES(?,?,?,?,?,?,?)",
                            (entry.path_lower, entry.path_display, entry.rev, entry.size,
                             entry.server_modified.isoformat() if entry.server_modified else None,
                             "skipped", junk),
                        )
                        continue
                    cur.execute(
                        "INSERT OR IGNORE INTO photos(path, display_path, rev, size, server_modified) "
                        "VALUES(?,?,?,?,?)",
                        (entry.path_lower, entry.path_display, entry.rev, entry.size,
                         entry.server_modified.isoformat() if entry.server_modified else None),
                    )
                    if cur.rowcount:
                        batch_new += 1
                cur.execute("COMMIT")
            total_new += batch_new
            if batch_new:
                log.info(f"  +{batch_new} new images (running total: {total_new})")
            if not res.has_more:
                break
            try:
                res = dbx.files_list_folder_continue(res.cursor)
            except ApiError as e:
                log.error(f"list_folder_continue failed: {e}")
                break
    return total_new


def private_dropbox_url(display_path: str) -> str:
    """Return a private https URL that opens the file in Dropbox web UI.
    Requires the account owner to be signed in. Not a public share link.
    """
    from urllib.parse import quote
    p = display_path.lstrip("/")
    parts = p.rsplit("/", 1)
    if len(parts) == 2:
        parent, name = parts
        return f"https://www.dropbox.com/home/{quote(parent)}?preview={quote(name)}"
    return f"https://www.dropbox.com/home?preview={quote(p)}"


def get_or_create_share_link(dbx: dropbox.Dropbox, path: str) -> str:
    """Return any existing shared link for the file, else empty string.
    We do NOT create new links (no sharing.write scope, and we don't want
    public links anyway). Caller should fall back to private_dropbox_url().
    """
    try:
        existing = dbx.sharing_list_shared_links(path=path, direct_only=True)
        if existing.links:
            return existing.links[0].url
    except ApiError:
        pass
    return ""


# ---------- Copilot CLI captioning ----------

def find_copilot() -> str:
    exe = shutil.which("copilot")
    if not exe:
        raise SystemExit("`copilot` CLI not found on PATH")
    return exe


def caption_with_copilot(image_path: Path, prompt: str, timeout: int, copilot_exe: str) -> str:
    """Run copilot non-interactively on one image and return the caption."""
    cmd = [
        copilot_exe,
        "-p", prompt,
        "--attachment", str(image_path),
        "--allow-all-tools",
        "--no-color" if False else "--banner",  # placeholder; --banner just shows banner
    ]
    # Simpler: minimum flags
    cmd = [
        copilot_exe,
        "-p", prompt,
        "--attachment", str(image_path),
        "--allow-all-tools",
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"copilot exited {proc.returncode}: {proc.stderr.strip()[:500]}"
        )
    text = (proc.stdout or "").strip()
    return clean_caption(text)


def clean_caption(text: str) -> str:
    """Strip CLI chrome / banners / blank lines and return the caption."""
    if not text:
        return ""
    lines = [ln.rstrip() for ln in text.splitlines()]
    # Drop lines that look like banner/log noise
    filtered = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        if s.startswith(("●", "○", "▶", "•", ">")):
            continue
        if s.lower().startswith(("welcome", "github copilot", "copilot ", "session ", "model:")):
            continue
        filtered.append(s)
    if not filtered:
        return text.strip()
    # Heuristic: the caption is typically the longest contiguous prose block.
    # Take the longest line by character length.
    caption = max(filtered, key=len)
    # Strip wrapping quotes if present
    caption = caption.strip().strip('"').strip("'").strip()
    return caption


# ---------- Worker pipeline ----------

class BatchWriter:
    """Accumulates results and flushes them to captions/batch_NNNNN.json."""

    def __init__(self, batch_size: int, con: sqlite3.Connection | None = None):
        self.batch_size = batch_size
        self.lock = threading.Lock()
        # Each entry is (path_lower, record_dict)
        self.buf: list[tuple[str, dict]] = []
        self.next_index = self._scan_next_index()
        self.con = con  # used to write batch_file back to DB on flush

    def _scan_next_index(self) -> int:
        existing = sorted(CAPTIONS_DIR.glob("batch_*.json"))
        if not existing:
            return 1
        last = existing[-1].stem.split("_")[-1]
        try:
            return int(last) + 1
        except ValueError:
            return len(existing) + 1

    def add(self, path_lower: str, record: dict) -> str | None:
        """Add a record. Returns the batch filename if this triggered a flush."""
        with self.lock:
            self.buf.append((path_lower, record))
            if len(self.buf) >= self.batch_size:
                return self._flush_locked()
        return None

    def _flush_locked(self) -> str:
        fname = f"batch_{self.next_index:05d}.json"
        path = CAPTIONS_DIR / fname
        records = [r for _, r in self.buf]
        path.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
        # Tag every flushed row in the DB so we can recover from crashes
        if self.con is not None:
            paths = [p for p, _ in self.buf]
            with _db_lock:
                self.con.execute(
                    "UPDATE photos SET batch_file=? WHERE path IN (" +
                    ",".join("?" * len(paths)) + ")",
                    [fname, *paths],
                )
        self.next_index += 1
        self.buf.clear()
        log.info(f"Wrote batch {fname}")
        return fname

    def flush(self) -> str | None:
        with self.lock:
            if not self.buf:
                return None
            return self._flush_locked()


_TRANSIENT_NETWORK_MARKERS = (
    "getaddrinfo failed",
    "Name or service not known",
    "Temporary failure in name resolution",
    "NameResolutionError",
    "Connection aborted",
    "Connection reset",
    "RemoteDisconnected",
    "Max retries exceeded",
    "ConnectionError",
    "Connection refused",
    "Network is unreachable",
)


class TransientNetworkError(Exception):
    """Raised by network-aware helpers when an outage persists despite backoff."""


def _is_transient_network_error(exc: BaseException) -> bool:
    msg = str(exc)
    return any(marker in msg for marker in _TRANSIENT_NETWORK_MARKERS)


def _dropbox_download_with_retry(dbx: dropbox.Dropbox, path_lower: str):
    """Download a file from Dropbox with exponential backoff for transient network failures.

    On persistent outage, raises TransientNetworkError so the caller can leave
    the row 'pending' (without burning an attempts slot)."""
    # Total budget: 5+15+60+300+900 = ~21 minutes before giving up.
    backoffs = (5, 15, 60, 300, 900)
    last_exc: Exception | None = None
    for attempt, delay in enumerate((0, *backoffs)):
        if delay:
            log.warning(f"network outage; sleeping {delay}s before retry "
                        f"(attempt {attempt}/{len(backoffs)}): {last_exc}")
            time.sleep(delay)
        try:
            return dbx.files_download(path_lower)
        except Exception as e:
            if not _is_transient_network_error(e):
                raise
            last_exc = e
    raise TransientNetworkError(str(last_exc))


def process_one(row: sqlite3.Row, dbx: dropbox.Dropbox, prompt: str, timeout: int,
                copilot_exe: str, con: sqlite3.Connection, writer: BatchWriter) -> None:
    path_lower = row["path"]
    display = row["display_path"]
    suffix_orig = Path(display).suffix.lower() or ".jpg"
    is_heic = suffix_orig in (".heic", ".heif")
    suffix = ".jpg" if is_heic else (suffix_orig or ".jpg")
    tmpfd, tmpname = tempfile.mkstemp(prefix="cap_", suffix=suffix, dir=TMP_DIR)
    os.close(tmpfd)
    tmp = Path(tmpname)
    try:
        # 1) Download bytes (and convert HEIC→JPEG if needed)
        md, resp = _dropbox_download_with_retry(dbx, path_lower)
        try:
            raw = resp.content
        finally:
            resp.close()
        if is_heic:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(raw))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.save(tmp, format="JPEG", quality=88)
        else:
            tmp.write_bytes(raw)

        # 2) Caption via copilot
        caption = caption_with_copilot(tmp, prompt, timeout, copilot_exe)
        if not caption:
            raise RuntimeError("empty caption")

        # 3) Shared link (only if one already exists; we never create one)
        existing_link = get_or_create_share_link(dbx, path_lower)
        private_link = private_dropbox_url(display)

        # 4) Persist
        record = {
            "path": display,
            "dropbox_url": private_link,                    # private deep link (owner only)
            "shared_link": existing_link or None,           # public link, if one happens to exist
            "caption": caption,
            "size": row["size"],
            "rev": row["rev"],
            "server_modified": row["server_modified"],
        }
        batch_file = writer.add(path_lower, record)
        with _db_lock:
            con.execute(
                "UPDATE photos SET caption=?, dropbox_link=?, status='done', "
                "captioned_at=datetime('now'), "
                "attempts=attempts+1, error=NULL WHERE path=?",
                (caption, existing_link or private_link, path_lower),
            )
        log.info(f"OK  {display!r} -> {caption[:80]}")
    except TransientNetworkError as e:
        # Persistent network outage: don't burn an attempts slot, don't mark as error.
        # Leave the row pending so it gets picked up on the next run.
        log.error(f"NETWORK OUTAGE persisted for {display!r}; leaving pending: {e}")
    except subprocess.TimeoutExpired:
        with _db_lock:
            con.execute(
                "UPDATE photos SET status='error', error='timeout', attempts=attempts+1 WHERE path=?",
                (path_lower,),
            )
        log.warning(f"TIMEOUT {display!r}")
    except Exception as e:
        # Transient network errors that briefly recovered shouldn't penalize the row
        # either — but only retry helpers raise TransientNetworkError. Anything else
        # here is a real failure (image decode, copilot, dropbox API, etc.).
        with _db_lock:
            con.execute(
                "UPDATE photos SET status='error', error=?, attempts=attempts+1 WHERE path=?",
                (str(e)[:500], path_lower),
            )
        log.error(f"ERR {display!r}: {e}")
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


# ---------- Commands ----------

def cmd_status(con: sqlite3.Connection) -> None:
    cur = con.execute("SELECT status, COUNT(*) c FROM photos GROUP BY status")
    rows = list(cur)
    total = sum(r["c"] for r in rows)
    print(f"Total tracked images: {total}")
    for r in rows:
        print(f"  {r['status']:>8}: {r['c']}")
    cur = con.execute("SELECT COUNT(*) c FROM photos WHERE status='done'")
    done = cur.fetchone()["c"]
    if total:
        print(f"Progress: {done}/{total} ({100*done/total:.1f}%)")


def cmd_run(args: argparse.Namespace) -> None:
    con = db_connect()
    dbx = dbx_client()
    copilot_exe = find_copilot()

    load_dotenv(ROOT / ".env")
    roots_env = os.environ.get("DROPBOX_ROOTS", "").strip()
    roots = [r.strip() for r in roots_env.split(",") if r.strip()] if roots_env else [""]
    batch_size = int(os.environ.get("BATCH_SIZE", "500"))
    timeout = int(os.environ.get("COPILOT_TIMEOUT", "180"))
    workers = int(os.environ.get("WORKERS", "1"))
    prompt = os.environ.get("CAPTION_PROMPT", "Caption this image in 1-2 sentences.")

    if args.workers:
        workers = args.workers

    if not args.skip_enumerate:
        new_count = enumerate_photos(dbx, roots, con)
        log.info(f"Enumeration complete: {new_count} new images added")
    cmd_status(con)

    if args.enumerate_only:
        return

    # Pull pending rows
    sql = "SELECT * FROM photos WHERE status IN ('pending','error') AND attempts < ?"
    params: list = [args.max_attempts]
    if args.limit:
        sql += " ORDER BY path LIMIT ?"
        params.append(args.limit)
    else:
        sql += " ORDER BY path"
    pending = list(con.execute(sql, params))
    log.info(f"Processing {len(pending)} photos with {workers} worker(s)")
    if not pending:
        log.info("Nothing to do.")
        return

    writer = BatchWriter(batch_size, con=con)
    stop_flag = threading.Event()

    def handle_sigint(sig, frame):
        if stop_flag.is_set():
            log.warning("Force exit")
            sys.exit(130)
        log.warning("Stop requested — finishing in-flight tasks, then flushing. Ctrl+C again to force.")
        stop_flag.set()

    signal.signal(signal.SIGINT, handle_sigint)

    try:
        if workers == 1:
            for row in pending:
                if stop_flag.is_set():
                    break
                process_one(row, dbx, prompt, timeout, copilot_exe, con, writer)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
                futs = []
                for row in pending:
                    if stop_flag.is_set():
                        break
                    futs.append(ex.submit(process_one, row, dbx, prompt, timeout,
                                          copilot_exe, con, writer))
                for f in concurrent.futures.as_completed(futs):
                    if stop_flag.is_set():
                        break
                    try:
                        f.result()
                    except Exception as e:
                        log.error(f"worker error: {e}")
    finally:
        writer.flush()
        cmd_status(con)


def cmd_rebuild_batches(con: sqlite3.Connection) -> None:
    """Find photos status='done' that aren't in any batch JSON and emit them."""
    rows = list(con.execute(
        "SELECT path, display_path, dropbox_link, caption, size, rev, server_modified "
        "FROM photos WHERE status='done' AND (batch_file IS NULL OR batch_file='')"
    ))
    if not rows:
        log.info("No orphaned done rows to rebuild.")
        return
    log.info(f"Rebuilding {len(rows)} orphaned records into recovery batch(es)")
    batch_size = int(os.environ.get("BATCH_SIZE", "500"))
    writer = BatchWriter(batch_size=batch_size, con=con)
    for r in rows:
        record = {
            "path": r["display_path"],
            "dropbox_url": private_dropbox_url(r["display_path"]),
            "shared_link": r["dropbox_link"] if r["dropbox_link"] and r["dropbox_link"].startswith("https://www.dropbox.com/scl") else None,
            "caption": r["caption"],
            "size": r["size"],
            "rev": r["rev"],
            "server_modified": r["server_modified"],
        }
        writer.add(r["path"], record)
    writer.flush()
    con.commit()
    log.info("Rebuild complete.")


def main() -> None:
    p = argparse.ArgumentParser(description="Caption all Dropbox photos via Copilot CLI")
    p.add_argument("--status", action="store_true", help="Show progress and exit")
    p.add_argument("--auth", action="store_true",
                   help="One-time OAuth flow to obtain a Dropbox refresh token")
    p.add_argument("--rebuild-batches", action="store_true",
                   help="Emit recovery batch JSON for any captioned photos missing from batch files")
    p.add_argument("--limit", type=int, default=0, help="Process at most N pending photos")
    p.add_argument("--workers", type=int, default=0, help="Override worker count")
    p.add_argument("--max-attempts", type=int, default=3,
                   help="Skip photos that have already failed this many times")
    p.add_argument("--enumerate-only", action="store_true",
                   help="Only walk Dropbox and update the DB; no captioning")
    p.add_argument("--skip-enumerate", action="store_true",
                   help="Skip the Dropbox walk; caption from existing DB rows")
    args = p.parse_args()

    if args.auth:
        cmd_auth()
        return
    if args.status:
        cmd_status(db_connect())
        return
    if args.rebuild_batches:
        cmd_rebuild_batches(db_connect())
        return
    cmd_run(args)


if __name__ == "__main__":
    main()
