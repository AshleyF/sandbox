#!/usr/bin/env python3
"""Embed Dropbox captions via Azure OpenAI text-embedding-3-small.

Reads every captions/batch_*.json and adds a base64-encoded float32 embedding
to each record. Resumable: records that already have an `embedding` field are
skipped. Migrates the legacy flat-list batch JSON format to the new
``{embeddings: {...}, records: [...]}`` shape on first touch.

Usage:
    python embed.py                # embed everything pending
    python embed.py --limit 200    # cap this run at N new embeddings
    python embed.py --batch-size 100   # smaller API batches
    python embed.py --status       # report progress without changes
    python embed.py --dry-run      # log what would be embedded, no API calls
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import APIError, AzureOpenAI, RateLimitError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
CAPTIONS_DIR = ROOT / "captions"
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(exist_ok=True)

AZURE_ENDPOINT = "https://epicopenaisweden.openai.azure.com/"
AZURE_API_VERSION = "2024-02-01"
EMBEDDING_DEPLOYMENT = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default"  # nosec B105

EMBEDDING_HEADER = {
    "inline": True,
    "encoding": "base64",
    "model": EMBEDDING_DEPLOYMENT,
    "dimensions": EMBEDDING_DIMENSIONS,
    "dtype": "float32",
    "byte_order": "little-endian",
    "note": (
        "Each record's `embedding` is base64-encoded float32 little-endian. "
        "Decode (Python): np.frombuffer(base64.b64decode(s), dtype='<f4'). "
        "Decode (JS): new Float32Array("
        "Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer)."
    ),
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

log = logging.getLogger("embed")
log.setLevel(logging.INFO)
_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
_sh = logging.StreamHandler(sys.stdout)
_sh.setFormatter(_fmt)
_sh.setLevel(logging.INFO)
log.addHandler(_sh)
_fh = logging.FileHandler(LOGS_DIR / "embed.log", encoding="utf-8")
_fh.setFormatter(_fmt)
_fh.setLevel(logging.INFO)
log.addHandler(_fh)


# ---------------------------------------------------------------------------
# Azure OpenAI client
# ---------------------------------------------------------------------------

def make_client() -> AzureOpenAI:
    credential = DefaultAzureCredential()
    token_provider = get_bearer_token_provider(credential, TOKEN_SCOPE)
    return AzureOpenAI(
        azure_endpoint=AZURE_ENDPOINT,
        api_version=AZURE_API_VERSION,
        azure_ad_token_provider=token_provider,
    )


# ---------------------------------------------------------------------------
# Batch file handling
# ---------------------------------------------------------------------------

def load_batch(path: Path) -> dict:
    """Load a batch JSON file, migrating the legacy list format if needed."""
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        # Legacy format: flat list of records. Migrate.
        return {"embeddings": dict(EMBEDDING_HEADER), "records": data}
    if not isinstance(data, dict) or "records" not in data:
        raise ValueError(f"Unrecognized batch file shape: {path}")
    # Make sure the header is present and current.
    header = data.get("embeddings") or {}
    # Only overwrite header fields if missing — preserve any extra fields users add.
    for k, v in EMBEDDING_HEADER.items():
        header.setdefault(k, v)
    # If the stored model/dim doesn't match what we're producing, warn.
    if header.get("model") != EMBEDDING_DEPLOYMENT or header.get("dimensions") != EMBEDDING_DIMENSIONS:
        log.warning(
            "Batch %s has header model=%s dim=%s, this run produces %s dim=%s",
            path.name, header.get("model"), header.get("dimensions"),
            EMBEDDING_DEPLOYMENT, EMBEDDING_DIMENSIONS,
        )
    data["embeddings"] = header
    return data


def write_batch_atomic(path: Path, data: dict) -> None:
    """Write batch JSON atomically (temp + os.replace)."""
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.stem + "_", suffix=".tmp", dir=str(path.parent)
    )
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
        raise


def pending_records(data: dict) -> list[tuple[int, dict]]:
    """Return [(index_in_records, record_dict)] for records missing an embedding."""
    out: list[tuple[int, dict]] = []
    for i, rec in enumerate(data["records"]):
        emb = rec.get("embedding")
        cap = rec.get("caption")
        if emb:
            continue
        if not cap or not isinstance(cap, str):
            continue  # Skip records with no caption to embed
        out.append((i, rec))
    return out


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

def encode_vector(vec: list[float]) -> str:
    arr = np.asarray(vec, dtype="<f4")  # little-endian float32
    if arr.size != EMBEDDING_DIMENSIONS:
        raise ValueError(
            f"Vector dimension mismatch: got {arr.size}, expected {EMBEDDING_DIMENSIONS}"
        )
    return base64.b64encode(arr.tobytes()).decode("ascii")


def embed_batch(client: AzureOpenAI, texts: list[str], max_retries: int = 5) -> list[list[float]]:
    """Embed a list of texts; retry on transient errors with exponential backoff."""
    attempt = 0
    delay = 2.0
    while True:
        attempt += 1
        try:
            resp = client.embeddings.create(model=EMBEDDING_DEPLOYMENT, input=texts)
            return [d.embedding for d in resp.data]
        except RateLimitError as e:
            if attempt >= max_retries:
                raise
            log.warning("Rate limited (attempt %d/%d): %s", attempt, max_retries, e)
        except APIError as e:
            if attempt >= max_retries:
                raise
            log.warning("API error (attempt %d/%d): %s", attempt, max_retries, e)
        except Exception as e:  # network errors etc.
            if attempt >= max_retries:
                raise
            log.warning("Transient error (attempt %d/%d): %s: %s",
                        attempt, max_retries, type(e).__name__, e)
        time.sleep(delay)
        delay = min(delay * 2, 30.0)


# ---------------------------------------------------------------------------
# Status / counts
# ---------------------------------------------------------------------------

def file_counts(path: Path) -> tuple[int, int, int]:
    """Return (total_records, embedded, pending_with_caption) for a batch file."""
    data = load_batch(path)
    total = len(data["records"])
    embedded = sum(1 for r in data["records"] if r.get("embedding"))
    pending = sum(1 for r in data["records"] if (not r.get("embedding")) and r.get("caption"))
    return total, embedded, pending


def cmd_status() -> None:
    files = sorted(CAPTIONS_DIR.glob("batch_*.json"))
    total = embedded = pending = 0
    for f in files:
        t, e, p = file_counts(f)
        total += t
        embedded += e
        pending += p
    log.info("Captions dir: %s", CAPTIONS_DIR)
    log.info("Batch files: %d", len(files))
    log.info("Records:     total=%d  embedded=%d  pending=%d  no-caption=%d",
             total, embedded, pending, total - embedded - pending)
    pct = (embedded / total * 100) if total else 0
    log.info("Progress:    %.1f%%", pct)


# ---------------------------------------------------------------------------
# Main embed loop
# ---------------------------------------------------------------------------

def cmd_run(args: argparse.Namespace) -> None:
    batch_files = sorted(CAPTIONS_DIR.glob("batch_*.json"))
    if not batch_files:
        log.error("No batch files found in %s", CAPTIONS_DIR)
        return

    client = None if args.dry_run else make_client()

    api_batch_size = args.batch_size
    total_records = 0
    total_pending_before = 0
    files_with_work = 0
    for f in batch_files:
        t, e, p = file_counts(f)
        total_records += t
        total_pending_before += p
        if p > 0:
            files_with_work += 1
    log.info(
        "Plan: %d batch files (%d with work). %d records total, %d pending. "
        "API batch size = %d. Model = %s (dim=%d).",
        len(batch_files), files_with_work, total_records, total_pending_before,
        api_batch_size, EMBEDDING_DEPLOYMENT, EMBEDDING_DIMENSIONS,
    )
    if args.limit:
        log.info("Limit: stop after %d new embeddings.", args.limit)

    embedded_this_run = 0
    started = time.time()
    for fpath in batch_files:
        if args.limit and embedded_this_run >= args.limit:
            break
        data = load_batch(fpath)
        pending = pending_records(data)
        if not pending:
            continue
        log.info("[%s] %d pending records", fpath.name, len(pending))

        # Process this file in API-sized chunks
        cursor = 0
        file_changed = False
        while cursor < len(pending):
            if args.limit and embedded_this_run >= args.limit:
                break
            chunk = pending[cursor:cursor + api_batch_size]
            texts = [rec["caption"] for _, rec in chunk]
            t0 = time.time()
            if args.dry_run:
                vectors = [[0.0] * EMBEDDING_DIMENSIONS for _ in texts]
                tok = sum(len(t) // 4 for t in texts)  # rough estimate
            else:
                assert client is not None
                vectors = embed_batch(client, texts)
                tok = None  # API doesn't echo usage per call in this loop easily
            elapsed = time.time() - t0

            if len(vectors) != len(chunk):
                raise RuntimeError(
                    f"API returned {len(vectors)} vectors for {len(chunk)} inputs"
                )
            for (rec_idx, rec), vec in zip(chunk, vectors):
                rec["embedding"] = encode_vector(vec)
            embedded_this_run += len(chunk)
            file_changed = True
            cursor += len(chunk)
            log.info(
                "  embedded %d/%d in %s  (%.1fs, %.1f rec/s)",
                cursor, len(pending), fpath.name, elapsed,
                len(chunk) / elapsed if elapsed > 0 else 0.0,
            )

        if file_changed and not args.dry_run:
            write_batch_atomic(fpath, data)
            log.info("  wrote %s", fpath.name)
        elif file_changed and args.dry_run:
            log.info("  [dry-run] would write %s", fpath.name)

    elapsed_total = time.time() - started
    rate = embedded_this_run / elapsed_total if elapsed_total > 0 else 0
    log.info(
        "Done. Embedded %d records this run in %.1fs (%.1f rec/s). "
        "Remaining pending: %d.",
        embedded_this_run, elapsed_total, rate,
        max(0, total_pending_before - embedded_this_run),
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    p = argparse.ArgumentParser(
        description="Embed caption text via Azure OpenAI text-embedding-3-small."
    )
    p.add_argument("--status", action="store_true",
                   help="Show progress and exit")
    p.add_argument("--limit", type=int, default=0,
                   help="Stop after embedding N records this run (0 = unlimited)")
    p.add_argument("--batch-size", type=int, default=200,
                   help="Records per API call (Azure caps at ~2048; 200 is conservative)")
    p.add_argument("--dry-run", action="store_true",
                   help="Plan only; no API calls, no file writes")
    args = p.parse_args()

    if args.status:
        cmd_status()
        return
    cmd_run(args)


if __name__ == "__main__":
    main()
