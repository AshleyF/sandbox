#!/usr/bin/env python3
"""LLM-based caption tagger.

Two phases:

1. `derive-vocab` — sample captions, ask the model to propose a tag vocabulary
   built from what's actually in the descriptions, then save it as
   tag_taxonomy.json (overwriting any prior cluster-based taxonomy).
2. `apply` — for every record, ask the model which tags from the vocabulary
   apply to its caption. Resumable: records already carrying an `llm_tagged`
   marker (or any tag from the current vocabulary) are skipped unless --force.

Auth: Azure AD via DefaultAzureCredential (no API keys).
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock
from typing import Any

from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import AzureOpenAI

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent
CAPTIONS_DIR = ROOT / "captions"
TAXONOMY_PATH = ROOT / "tag_taxonomy.json"
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(exist_ok=True)

AZURE_ENDPOINT = "https://epicopenaisweden.openai.azure.com/"
AZURE_API_VERSION = "2025-01-01-preview"
DEPLOYMENT_VOCAB = "gpt-5.2-chat"   # smarter model for one-shot vocab derivation
DEPLOYMENT_APPLY = "gpt-5-mini"     # cheaper model for the per-caption pass

VOCAB_SAMPLE_SIZE = 600
APPLY_BATCH_SIZE = 25
APPLY_CONCURRENCY = 8
MAX_RETRIES = 4
RETRY_INITIAL_DELAY = 2.0


def setup_logging() -> logging.Logger:
    log = logging.getLogger("llm_tag")
    log.setLevel(logging.INFO)
    if log.handlers:
        return log
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    fh = logging.FileHandler(LOGS_DIR / "llm_tag.log", encoding="utf-8")
    fh.setFormatter(fmt)
    log.addHandler(sh)
    log.addHandler(fh)
    return log


log = setup_logging()


def make_client() -> AzureOpenAI:
    cred = DefaultAzureCredential()
    token_provider = get_bearer_token_provider(cred, "https://cognitiveservices.azure.com/.default")
    return AzureOpenAI(
        azure_endpoint=AZURE_ENDPOINT,
        azure_ad_token_provider=token_provider,
        api_version=AZURE_API_VERSION,
    )


def iter_records(paths: list[Path] | None = None):
    files = paths or sorted(CAPTIONS_DIR.glob("batch_*.json"))
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        for r in d.get("records", []):
            yield f, r


def write_atomic(path: Path, data: dict[str, Any]) -> None:
    fd, tmp_name = tempfile.mkstemp(prefix=path.stem + "_", suffix=".tmp", dir=str(path.parent))
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def is_content_filter_error(err: Exception) -> bool:
    s = str(err)
    return "content_filter" in s or "ResponsibleAIPolicyViolation" in s


def call_with_retry(fn, *args, **kwargs):
    delay = RETRY_INITIAL_DELAY
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception as e:  # noqa: BLE001
            last_err = e
            if is_content_filter_error(e):
                # Don't waste retries on content-filter rejections — they're deterministic.
                raise
            log.warning("LLM call attempt %d/%d failed: %s", attempt + 1, MAX_RETRIES, e)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError(f"LLM call failed after {MAX_RETRIES} attempts: {last_err}")


VOCAB_SYSTEM_PROMPT = """You are helping build a tag vocabulary for a personal photo library.

You will be given hundreds of one-to-two-sentence photo captions sampled from the corpus. Your job is to propose a controlled vocabulary of tags that:

1. Names things that ACTUALLY appear in many of the captions. Do NOT invent categories that aren't represented.
2. Names entities, scenes, activities, or recognizable subjects \u2014 things a user might search for. Examples of good tag KINDS: specific named entities (cybertruck, mickey-mouse, rubiks-cube), animals (macaw, beagle, cat), activities (rock-climbing, ziplining), scene types (beach, christmas-tree, restaurant), objects (calculator, telescope, circuit-board), people-roles (toddler, bride, groom).
3. Each tag must apply to MANY captions (target: \u22655 captions each, but specific named entities like 'cybertruck' that appear in 20+ captions are great). Tags that would apply to only 1\u20132 captions are too narrow.
4. Each tag must be SPECIFIC and identifiable from a caption. Avoid abstract or stylistic tags like 'mood', 'aesthetic', 'composition'. Avoid 'photo' or 'image' as tags.
5. Names must be lowercase, hyphenated, no spaces.

Return ONLY a JSON object with this exact shape (no prose):

{
  "categories": [
    {
      "name": "category-slug",
      "description": "short category description",
      "tags": [
        {"tag": "tag-slug", "description": "what this tag means; what kinds of captions match"}
      ]
    }
  ]
}

Aim for ~80\u2013120 tags across 8\u201315 categories. Categories should be derived from what you see (e.g. animals, vehicles, family, places, technology, art, food, sports).
"""


def cmd_derive_vocab(args: argparse.Namespace) -> None:
    random.seed(42)
    sample: list[str] = []
    all_records = list(iter_records())
    log.info("Total records available: %d", len(all_records))
    random.shuffle(all_records)
    for _f, r in all_records:
        cap = (r.get("caption") or "").strip()
        if cap:
            sample.append(cap)
        if len(sample) >= args.sample_size:
            break
    log.info("Sampled %d captions; sending to %s for vocabulary derivation...", len(sample), DEPLOYMENT_VOCAB)

    user_msg = "Here are sampled captions, one per line:\n\n" + "\n".join(f"- {c}" for c in sample)

    client = make_client()
    resp = call_with_retry(
        client.chat.completions.create,
        model=DEPLOYMENT_VOCAB,
        messages=[
            {"role": "system", "content": VOCAB_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    try:
        vocab = json.loads(content)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Model did not return valid JSON: {e}\n--- content ---\n{content[:2000]}")

    cats = vocab.get("categories") or []
    n_tags = sum(len(c.get("tags") or []) for c in cats)
    log.info("Model returned %d categories with %d tags total.", len(cats), n_tags)

    out = {
        "version": 4,
        "description": "LLM-derived vocabulary. Each tag was proposed by an LLM after reading a large random sample of captions. Tags are applied per-caption by an LLM in the apply phase.",
        "source": {
            "method": f"{DEPLOYMENT_VOCAB} reading {len(sample)} sampled captions",
            "sample_size": len(sample),
        },
        "tagging": {
            "applier": DEPLOYMENT_APPLY,
            "batch_size": APPLY_BATCH_SIZE,
        },
        "categories": cats,
    }
    TAXONOMY_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Wrote %s", TAXONOMY_PATH)


APPLY_SYSTEM_PROMPT_TEMPLATE = """You are tagging photo captions using a fixed vocabulary.

For each caption, output ONLY the tags from the vocabulary that clearly apply based on what the caption explicitly describes. Do not invent tags. Do not add tags that are merely related. Each tag must be defensible: a person reading the caption would agree the tag describes something present.

If no tags apply, return an empty array. Aim for 0\u20136 tags per caption.

VOCABULARY (canonical tag name = description):
{vocab_lines}

Return ONLY a JSON object of the form:
{{"results": [{{"id": <int>, "tags": [<tag>, ...]}}, ...]}}

Use the integer id provided for each caption.
"""


def load_vocab() -> tuple[list[str], dict[str, str]]:
    tax = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    tags: list[str] = []
    descs: dict[str, str] = {}
    for cat in tax.get("categories", []):
        for entry in cat.get("tags", []):
            tag = entry.get("tag")
            if not tag:
                continue
            tags.append(tag)
            descs[tag] = entry.get("description", "")
    return tags, descs


def cmd_apply(args: argparse.Namespace) -> None:
    vocab_tags, vocab_descs = load_vocab()
    if not vocab_tags:
        raise SystemExit("No tags found in tag_taxonomy.json. Run derive-vocab first.")
    log.info("Loaded %d tags from vocabulary.", len(vocab_tags))
    vocab_set = set(vocab_tags)
    vocab_lines = "\n".join(f"- {t}: {vocab_descs.get(t, '')}" for t in vocab_tags)
    sys_prompt = APPLY_SYSTEM_PROMPT_TEMPLATE.format(vocab_lines=vocab_lines)

    files = sorted(CAPTIONS_DIR.glob("batch_*.json"))
    if args.limit:
        files = files[: args.limit]
    log.info("Processing %d batch files with concurrency=%d.", len(files), args.concurrency)

    client = make_client()
    api_lock = Lock()
    api_calls = [0]

    def call_chunk(chunk: list[tuple[int, str]]) -> dict[int, list[str]]:
        user_msg_lines = [f"{idx}. {cap}" for idx, (_, cap) in enumerate(chunk)]
        user_msg = "\n".join(user_msg_lines)
        try:
            resp = call_with_retry(
                client.chat.completions.create,
                model=DEPLOYMENT_APPLY,
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_msg},
                ],
                response_format={"type": "json_object"},
            )
        except Exception as e:  # noqa: BLE001
            if is_content_filter_error(e) and len(chunk) > 1:
                # Fall back to single-record probing so one flagged caption doesn't
                # kill the rest. Records still flagged singly get marked tagged_by=llm
                # with empty tags so we don't retry them forever.
                out: dict[int, list[str]] = {}
                for idx in range(len(chunk)):
                    sub = call_chunk([chunk[idx]])
                    if 0 in sub:
                        out[idx] = sub[0]
                    else:
                        out[idx] = []  # mark processed-but-blocked
                return out
            log.error("Chunk failed (size=%d): %s", len(chunk), str(e)[:200])
            return {}
        with api_lock:
            api_calls[0] += 1
        content = resp.choices[0].message.content or "{}"
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as e:
            log.warning("Bad JSON in response: %s", e)
            return {}
        out: dict[int, list[str]] = {}
        for item in parsed.get("results") or []:
            try:
                chunk_id = int(item.get("id"))
                tags_out = item.get("tags") or []
            except (TypeError, ValueError):
                continue
            if 0 <= chunk_id < len(chunk):
                out[chunk_id] = [t for t in tags_out if isinstance(t, str) and t in vocab_set]
        return out

    total = 0
    tagged = 0
    skipped = 0

    for path in files:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        records = data.get("records") or []
        if not records:
            continue

        work: list[tuple[int, str]] = []
        for i, r in enumerate(records):
            total += 1
            cap = (r.get("caption") or "").strip()
            if not cap:
                continue
            existing = r.get("tags") or []
            if not args.force and r.get("tagged_by") == "llm" and all(t in vocab_set for t in existing):
                skipped += 1
                continue
            work.append((i, cap))

        if not work:
            continue

        chunks = [work[i : i + APPLY_BATCH_SIZE] for i in range(0, len(work), APPLY_BATCH_SIZE)]
        file_tagged = 0
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            futures = {pool.submit(call_chunk, chunk): chunk for chunk in chunks}
            for fut in as_completed(futures):
                chunk = futures[fut]
                results = fut.result()
                for chunk_id, tags_out in results.items():
                    rec_idx, _ = chunk[chunk_id]
                    cleaned = sorted(set(tags_out))
                    rec = records[rec_idx]
                    rec["tags"] = cleaned
                    rec["tagged_by"] = "llm"
                    if cleaned:
                        file_tagged += 1
                        tagged += 1

        write_atomic(path, data)
        log.info(
            "Saved %s  (api_calls=%d, file_tagged=%d/%d, total_tagged=%d)",
            path.name,
            api_calls[0],
            file_tagged,
            len(work),
            tagged,
        )

    log.info("Done. records=%d tagged=%d skipped=%d api_calls=%d", total, tagged, skipped, api_calls[0])


def main() -> None:
    ap = argparse.ArgumentParser(description="LLM-based caption tagger.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_d = sub.add_parser("derive-vocab", help="Sample captions and ask the LLM to propose a tag vocabulary.")
    p_d.add_argument("--sample-size", type=int, default=VOCAB_SAMPLE_SIZE)
    p_d.set_defaults(func=cmd_derive_vocab)

    p_a = sub.add_parser("apply", help="Tag every record using the saved vocabulary.")
    p_a.add_argument("--limit", type=int, default=0, help="Only process the first N batch files (0 = all).")
    p_a.add_argument("--force", action="store_true", help="Retag records that already have llm tags.")
    p_a.add_argument("--concurrency", type=int, default=APPLY_CONCURRENCY, help="Parallel API requests per batch file.")
    p_a.set_defaults(func=cmd_apply)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
