# Dropbox Photo Captioner + Embedder

Walks every photo in a Dropbox account, captions each one with the GitHub
Copilot CLI's vision model, then embeds the resulting captions with Azure
OpenAI's `text-embedding-3-small` so they're ready for semantic search, then
derives controlled semantic tags from those caption embeddings.

Output is a set of self-contained per-batch JSON files. Each photo record
holds the caption, the original Dropbox path, a deep link, and the embedding
vector (inline as a base64-encoded `float32` array) plus a controlled `tags`
array. No metadata is split out across sidecar files.

Photos are **never permanently downloaded** — each is streamed to a temp file,
captioned, then deleted.

---

## Result of one full run (June 2026)

| | |
|---|---:|
| Total Dropbox items scanned | 156,400 |
| Photos captioned | **52,056** (33.3%) |
| Embeddings generated (1536-dim) | **52,056** (100% of captioned) |
| Tagged records | **52,056** with at least one controlled tag |
| Filtered out (resource forks, <5KB, RAW, etc.) | 104,113 (66.6%) |
| Errors logged in `errors_report.txt` | 231 (0.1%) — mostly model content-filter rejects |
| Captioning time | ~5 days at 1 worker, ~200–400 photos/hour |
| Embedding time | ~20 min at 1 thread, ~44 records/sec |
| Total `captions/` size | ~437 MB (embeddings ≈ 80% of that) |
| Embedding cost | ~$0.03 USD (≈1.6M tokens × $0.02/M) |

---

## Pipeline

```
                                                  +---------------------+
   Dropbox API  ──►  caption.py  ──►  progress.db │     captions/       │
                       │                          │  batch_00001.json   │
                       │  (stream each image     │  batch_00002.json   │
                       │   to temp file, call    │       …             │
                       │   `copilot` CLI,         │  batch_00108.json   │
                       │   delete temp file)      └───────────┬─────────┘
                       ▼                                      │
              caption text in DB                              │
                                                              ▼
                                                       embed.py
                                                       (calls Azure OpenAI
                                                        text-embedding-3-small,
                                                        writes embedding back
                                                        into each record)
```

Both `caption.py` and `embed.py` are **resumable**. Killing either and
re-running picks up exactly where it left off.

---

## Directory layout

```
dropbox-captioner/
├── caption.py            # The captioner (Copilot CLI vision)
├── embed.py              # The embedder (Azure OpenAI text-embedding-3-small)
├── llm_tag.py            # LLM-based tagger (Azure OpenAI gpt-5-mini)
├── tag_taxonomy.json     # Curated tag vocabulary (LLM-derived from sampled captions)
├── .env                  # Dropbox refresh-token credentials
├── progress.db           # SQLite checkpoint (do not delete unless restarting)
├── errors_report.txt     # Per-photo error listing, grouped by category
├── captions/
│   ├── batch_00001.json  # 500 records per file (last file may be shorter)
│   ├── batch_00002.json
│   └── …
└── logs/
    ├── captioner.log     # All caption.py activity
    └── embed.log         # All embed.py activity
```

---

## File format: `captions/batch_NNNNN.json`

Each batch file is a JSON object with two top-level keys: a small header
describing the embedding format, and a list of photo records.

```json
{
  "embeddings": {
    "inline": true,
    "encoding": "base64",
    "model": "text-embedding-3-small",
    "dimensions": 1536,
    "dtype": "float32",
    "byte_order": "little-endian",
    "note": "Each record's `embedding` is base64-encoded float32 little-endian. ..."
  },
  "records": [
    {
      "path": "/Photos/2019/IMG_1234.jpg",
      "dropbox_url": "https://www.dropbox.com/home/Photos/2019?preview=IMG_1234.jpg",
      "shared_link": null,
      "caption": "A golden retriever lying on a wood deck in afternoon sun.",
      "size": 4823910,
      "rev": "0123456789abcdef",
      "server_modified": "2019-08-12T17:42:11",
      "tags": ["dog", "outdoor", "sunset"],
      "embedding": "Xy0bPRn2K70..."
    }
  ]
}
```

### Header (`embeddings`)

| Field | Type | Meaning |
|---|---|---|
| `inline` | bool | `true` means the embeddings live in each record's `embedding` field (rather than a separate file). |
| `encoding` | string | Always `"base64"` in this version. |
| `model` | string | Azure OpenAI deployment name used. `text-embedding-3-small`. |
| `dimensions` | int | Length of each embedding vector. `1536` for `text-embedding-3-small`. |
| `dtype` | string | `"float32"` — each component is a 4-byte IEEE 754 single-precision float. |
| `byte_order` | string | `"little-endian"` — the byte order of the float32 values inside the base64 blob. |
| `note` | string | Short reminder of how to decode the embeddings in Python/JavaScript. |

### Record

| Field | Type | Meaning |
|---|---|---|
| `path` | string | The original-case Dropbox path of the photo, e.g. `/Photos/2019/IMG_1234.jpg`. This is the primary key. |
| `dropbox_url` | string | A **private** Dropbox web URL that opens the file in your Dropbox UI. Only works for you (the account owner). Not a public share. |
| `shared_link` | string or `null` | A pre-existing public share URL if Dropbox already had one for this file. **The captioner never creates new public links** — it only records ones that already existed. |
| `caption` | string | One-to-two-sentence caption written by Copilot's vision model. Prompt: `"Caption this image in 1-2 sentences."`. |
| `size` | int | File size in bytes as reported by Dropbox at enumeration time. |
| `rev` | string | Dropbox revision identifier. A new `rev` is issued every time the file's bytes change. Used to detect that a previously-captioned photo has been edited — if you re-run `caption.py` after a photo's content changes, it will be re-captioned. |
| `server_modified` | string (ISO-8601) | Last server-side modification timestamp from Dropbox. Useful for sorting chronologically. |
| `tags` | array of strings | Tags assigned by an LLM that read the caption and chose only tags from `tag_taxonomy.json` that are clearly described in the caption. 0–6 tags per record. |
| `tagged_by` | string | Set to `"llm"` to mark that this record has been processed by `llm_tag.py`. Used for resumability. |
| `embedding` | string (base64) | The base64-encoded packed `float32` vector for the caption text. Decode it as described below to get a 1536-element array of `float32` values. The vectors are **L2-normalized** (unit length), so cosine similarity reduces to a plain dot product. |

### Tags

Tags are **applied by an LLM that reads each caption** and picks only tags
from a fixed vocabulary that clearly describe what the caption explicitly
says. This guarantees every tag is defensible from the caption text alone —
no embedding-cluster bleed where unrelated photos get incorrect tags.

The pipeline is two-phase, both phases in `llm_tag.py`:

1. **Vocabulary derivation** (`python llm_tag.py derive-vocab`)
   - Samples ~600 captions uniformly from the corpus
   - Sends them to `gpt-5.2-chat` with an instruction to propose a controlled
     vocabulary (lowercase-hyphenated tags) for things that ACTUALLY appear
     in many captions — no invented categories
   - Saves the result to `tag_taxonomy.json` (categories → tags → description)

2. **Apply** (`python llm_tag.py apply`)
   - For each record, sends caption + vocabulary to `gpt-5-mini`
   - Model returns only tags from the vocabulary that clearly apply
   - Writes `tags` and `tagged_by: "llm"` into each record
   - 8-way concurrent; resumable (records already marked `tagged_by: "llm"`
     are skipped unless `--force`)
   - Falls back to single-record probing if a chunk hits Azure's content
     filter so one false-positive doesn't kill 24 innocent captions with it

Auth is `DefaultAzureCredential` (no API keys), endpoint
`https://epicopenaisweden.openai.azure.com/`.

Approximate run cost on this corpus (52,056 records): **~$1**, **~5 hours**
including a retry pass.

To rebuild the vocabulary from scratch (e.g. after captioning more photos):

```bash
python llm_tag.py derive-vocab          # → tag_taxonomy.json
# (review tag_taxonomy.json — edit by hand if you want to add/remove tags)
python llm_tag.py apply                 # writes tags into every batch_*.json
python llm_tag.py apply --force         # forcibly re-tag records that already carry llm tags
```

---

## Decoding the embedding

The embedding is a base64-encoded little-endian `float32` array. Decoding it
is a one-liner in both Python and JavaScript — no extra libraries needed.

### Python

```python
import base64
import numpy as np

vec = np.frombuffer(base64.b64decode(record["embedding"]), dtype="<f4")
# vec.shape == (1536,)
# np.linalg.norm(vec) ≈ 1.0  (already L2-normalized)
```

### Browser JavaScript (vanilla)

```javascript
function decodeEmbedding(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Float32Array(bytes.buffer);   // length === 1536
}
```

### Node.js

```javascript
function decodeEmbedding(b64) {
  const buf = Buffer.from(b64, "base64");
  // Re-view the bytes as Float32Array (works on little-endian platforms — true for
  // every modern x86 and ARM CPU you'd actually run this on).
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
```

The vectors are already **L2-normalized**, so cosine similarity is just the
dot product:

```javascript
function cosineSim(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
```

---

## JavaScript example: load a batch, search it semantically

> **About semantic search in the browser:** to search by a natural-language
> query (e.g. *"sunset on the beach"*), you need to embed the query into the
> same 1536-dim space and compare it against the photo embeddings. Embedding
> the query requires calling an embedding model — typically a server-side
> Azure OpenAI / OpenAI call, or an in-browser model (e.g.
> [transformers.js](https://github.com/xenova/transformers.js) with a small
> ONNX embedding model).
>
> The code below covers the **reading and ranking** side, which is the
> tricky-but-fast part. Replace `await embedQuery(text)` with whatever
> embedding source you choose.

```javascript
// 1) Fetch and parse a batch file.
async function loadBatch(url) {
  const data = await fetch(url).then(r => r.json());
  // Decode all embeddings up-front. Each is 6,144 bytes = ~3 MB for a
  // 500-record file. Fast enough for interactive use.
  for (const rec of data.records) {
    rec._vec = decodeEmbedding(rec.embedding);
  }
  return data;
}

function decodeEmbedding(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Float32Array(bytes.buffer);
}

// 2) Rank records in a batch against a query vector (also Float32Array, 1536-dim,
//    L2-normalized — same model as the records).
function search(batch, queryVec, topK = 10) {
  const scored = batch.records.map(r => ({
    score: dot(queryVec, r._vec),
    path: r.path,
    caption: r.caption,
    dropbox_url: r.dropbox_url,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// 3) Search across many batches (just loop and merge).
async function searchAll(batchUrls, queryVec, topK = 10) {
  const all = [];
  for (const url of batchUrls) {
    const batch = await loadBatch(url);
    for (const r of batch.records) {
      all.push({
        score: dot(queryVec, r._vec),
        path: r.path,
        caption: r.caption,
        dropbox_url: r.dropbox_url,
      });
    }
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, topK);
}

// 4) Plug in your embedding source. This stub calls a hypothetical
//    server-side endpoint that wraps Azure OpenAI text-embedding-3-small.
async function embedQuery(text) {
  const resp = await fetch("/api/embed", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({text}),
  });
  const {embedding} = await resp.json();   // expect a 1536-number array
  return new Float32Array(embedding);
}

// 5) Putting it together.
async function semanticSearchExample() {
  const queryVec = await embedQuery("a calm beach at sunset");
  const top = await searchAll(
    ["captions/batch_00001.json", "captions/batch_00002.json"],
    queryVec,
    20,
  );
  for (const hit of top) {
    console.log(hit.score.toFixed(3), hit.caption, "→", hit.dropbox_url);
  }
}
```

For a fully-static site without a backend, swap `embedQuery` for an
in-browser model load (transformers.js + a small ONNX embedding model). The
results won't match `text-embedding-3-small` exactly — you'd want to
re-embed the captions with the same model the browser uses for queries.

---

## Captioner: `caption.py`

Streams every Dropbox image, runs `copilot -p "..." --attachment <tmp> --allow-all-tools`,
parses the caption from stdout, writes a row to `progress.db`, and appends to
the current batch JSON.

```powershell
python caption.py                    # process everything (resumable)
python caption.py --limit 5          # smoke test on 5 photos
python caption.py --workers 4        # parallel copilot calls
python caption.py --enumerate-only   # just walk Dropbox, no captioning
python caption.py --status           # progress report and exit
python caption.py --rebuild-batches  # write recovery batch JSONs for any
                                     # rows committed to DB but not yet in
                                     # a batch file (e.g. after a crash)
python caption.py --auth             # one-time OAuth flow to fetch a Dropbox
                                     # refresh token (interactive)
python caption.py --max-attempts N   # skip photos already failed N times
                                     # (default 3). Pass 5 to retry "permanent"
                                     # errors after a transient outage.
```

### Filters (which files are marked `skipped`)

Files matching any of the rules below are inserted into `progress.db` with
`status='skipped'` and a reason and are **never sent to the captioner**.

| Rule | Reason | Example |
|---|---|---|
| Filename starts with `._` | `filter: resource fork` | macOS metadata sidecars |
| File size `< 5,120 bytes` | `filter: <5120B` | Tracking pixels, button glyphs, sprites |
| Extension in `{.raw, .cr2, .nef, .arw, .dng}` | `filter: raw format` | Camera RAW that the vision model can't reliably decode |
| Not an image extension at all | (never inserted) | `.txt`, `.zip`, etc. |

HEIC/HEIF are **not** skipped — they are transcoded to JPEG in memory via
`pillow-heif` before being attached.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` | — | OAuth credentials. Use `python caption.py --auth` to obtain a refresh token. |
| `DROPBOX_ROOTS` | (entire account) | Comma-separated Dropbox paths to limit the walk, e.g. `/Photos,/Camera Uploads`. |
| `BATCH_SIZE` | `500` | Records per batch JSON file. |
| `WORKERS` | `1` | Parallel `copilot` invocations. Each consumes one premium-request quota slot per photo. |
| `COPILOT_TIMEOUT` | `180` | Per-photo timeout in seconds. |
| `CAPTION_PROMPT` | `"Caption this image in 1-2 sentences."` | Prompt sent to Copilot. |

---

## Embedder: `embed.py`

Reads every `captions/batch_*.json`, embeds any caption that doesn't yet have
an `embedding` field via Azure OpenAI, and writes the file back atomically.
On first touch, also migrates the legacy flat-list batch format to the new
`{embeddings, records}` shape.

```powershell
python embed.py                # embed everything pending (resumable)
python embed.py --status       # show progress without changes
python embed.py --limit 1000   # cap this run at N new embeddings
python embed.py --batch-size 100   # records per API call (default 200,
                                    # Azure caps at ~2048)
python embed.py --dry-run      # plan only; no API calls, no file writes
```

### Configuration (in-code constants near the top of `embed.py`)

| Constant | Value |
|---|---|
| `AZURE_ENDPOINT` | `https://epicopenaisweden.openai.azure.com/` |
| `AZURE_API_VERSION` | `2024-02-01` |
| `EMBEDDING_DEPLOYMENT` | `text-embedding-3-small` |
| `EMBEDDING_DIMENSIONS` | `1536` |
| `TOKEN_SCOPE` | `https://cognitiveservices.azure.com/.default` |

### Auth

Auth is **Azure Entra ID (Azure AD)** via `azure-identity.DefaultAzureCredential` —
**no API keys**. The credential chain tries:

1. Environment variables (`AZURE_CLIENT_ID`/`SECRET`/`TENANT_ID`, etc.)
2. Managed identity (when running on Azure)
3. Workload identity
4. Azure CLI (`az login`)
5. Azure PowerShell (`Connect-AzAccount`)
6. Visual Studio / VS Code sign-in
7. Interactive browser prompt

If you've already done `az login` on this machine, embedding "just works".

### Resumability

`embed.py` treats each batch JSON as the source of truth: any record that
already has an `embedding` field is skipped. There is no separate progress
file for embeddings. You can interrupt the run at any time; the only loss is
the partial API-batch in flight.

---

## `progress.db` schema (SQLite)

The captioner tracks per-photo state in `progress.db`. The embedder does
*not* touch this file — embeddings are tracked entirely in the batch JSONs.

```sql
CREATE TABLE photos (
    path            TEXT PRIMARY KEY,   -- Dropbox path_lower (lower-cased)
    display_path    TEXT NOT NULL,      -- Original-case Dropbox path
    rev             TEXT,               -- Dropbox revision
    size            INTEGER,            -- Bytes
    server_modified TEXT,               -- ISO-8601 from Dropbox
    dropbox_link    TEXT,               -- Public share URL if one existed, else private deep link
    caption         TEXT,               -- The generated caption, once 'done'
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | done | skipped | error
    error           TEXT,               -- Last error message (when status='error')
    attempts        INTEGER NOT NULL DEFAULT 0,
    batch_file      TEXT,               -- Which batch_NNNNN.json this record was written to
    captioned_at    TEXT
);
CREATE INDEX idx_status ON photos(status);
```

Useful one-liners:

```powershell
# Count by status
python -c "import sqlite3; print(dict(sqlite3.connect('progress.db').execute('SELECT status, COUNT(*) FROM photos GROUP BY status').fetchall()))"

# See the most recent captions
python -c "import sqlite3; [print(r) for r in sqlite3.connect('progress.db').execute('SELECT captioned_at, display_path, substr(caption,1,80) FROM photos WHERE status=\"done\" ORDER BY captioned_at DESC LIMIT 10').fetchall()]"
```

---

## `errors_report.txt`

Plain-text report of every photo that ended in `status='error'`, grouped by
category. Regenerate at any time with `tmp/make_error_report.py`.

Categories used:

| Category | Meaning |
|---|---|
| `content_filter` | Copilot's vision model refused the image. Almost always photos containing identifiable minors, even in completely innocent contexts. Not retriable — the filter is image-based, not prompt-based. |
| `transient_network` | Connection reset / remote disconnected mid-download. Retriable. |
| `timeout` | Per-photo timeout exceeded. |
| `auth` | Brief Copilot CLI auth blip; the next photo on the same worker usually succeeds. |
| `empty_caption` | Model returned no text. |
| `api_error` | Upstream returned a 4xx error (e.g. invalid request). |
| `other` | Anything else. |

---

## Caveats and gotchas

- **Quota**: each captioned photo = one Copilot CLI premium-request quota slot.
- **Captioning is slow**: ~10–25 seconds per photo single-threaded. The full
  52K-photo run took ~5 days. Bump `--workers` if you have quota to spare.
- **Embedding is fast and cheap**: ~$0.03 for 52K records at ~44 records/sec.
- **Content filter**: ~0.4% of photos (mostly family photos with kids) are
  rejected by Copilot's vision-safety filter. Not fixable by changing the
  prompt — the filter looks at the image, not the prompt.
- **Resumable both ways**: Ctrl+C either script at any time; re-run to
  continue.
- **HEIC** is transcoded to JPEG in memory (no permanent conversion). Camera
  RAW files are skipped, not converted.
- **Dropbox token**: once the run is done, **revoke the refresh token** at
  https://www.dropbox.com/developers/apps.

---

## Brainstorm: building a semantic-search UI on top of these embeddings

A semantic-search website on top of this dataset really has **two
sub-problems**, and only one of them is hard:

| Sub-problem | Hard part? | Why |
|---|---|---|
| **(A) Embed the query text** into the same 1536-dim space | **Yes** | Requires running an embedding model. The model used here (`text-embedding-3-small`) is a closed OpenAI model and can't be loaded into a browser. |
| **(B) Search** — given a query vector, find the most similar photo embeddings | No | 52K × 1536 floats = ~320 MB. A linear scan of dot products takes <100 ms in a modern browser. Optional HNSW index makes it sub-millisecond. |

The architecture choice is almost entirely about how you solve (A). Below
are the realistic options, ordered roughly from "least infrastructure" to
"most infrastructure".

---

### Option 1 — Fully static (no backend), in-browser embedding model

Use [transformers.js](https://github.com/xenova/transformers.js) (ONNX
Runtime Web under the hood) to run a small sentence-embedding model in the
browser via WASM or WebGPU.

Candidate models (all available pre-quantized for the browser on Hugging
Face under the `Xenova/` namespace):

| Model | Dims | Download size | Notes |
|---|---:|---:|---|
| `Xenova/all-MiniLM-L6-v2` | 384 | ~25 MB | Tiny and fast. Decent retrieval quality for short text. |
| `Xenova/multilingual-e5-small` | 384 | ~120 MB | Stronger retrieval; supports 100+ languages. |
| `Xenova/bge-small-en-v1.5` | 384 | ~33 MB | Excellent retrieval for English captions. |
| `Xenova/all-mpnet-base-v2` | 768 | ~110 MB | Higher quality but ~3× larger. |

**The catch:** the dimensionality and vector space of any of these is
**completely different** from `text-embedding-3-small`. You can't mix and
match — vectors from one model are meaningless in another model's space.

So if you go this route, you'd run `embed.py` again with the matching browser
model. Two paths:

1. Add a `--model` flag to `embed.py` and use the
   [OpenAI Python wrapper for Transformers / Sentence-Transformers](https://github.com/UKPLab/sentence-transformers)
   to compute embeddings *locally* with the same model the browser will use
   later. Same JSON shape, just different `model`/`dimensions` in the header.
2. Or use the Hugging Face Inference API for the batch re-embed and the
   browser for queries — both hit the same hosted model.

**Pros:**
- Zero backend. Host everything on GitHub Pages, Cloudflare Pages, or any
  static file server.
- No API keys to manage, no ongoing cost.
- Privacy: queries never leave the user's browser.

**Cons:**
- ~25–120 MB model download on first visit (cached afterwards via service worker).
- ~30–500 ms per query for query-embedding (slower than a server call).
- Need to re-run the embedder once with the matching model (~20 min of work).
- Retrieval quality with small models is *good* but not as good as
  `text-embedding-3-small`, especially for nuanced queries.

**Sketch:**

```html
<script type="module">
import { pipeline } from
  "https://cdn.jsdelivr.net/npm/@xenova/[email protected]";

const embedder = await pipeline(
  "feature-extraction",
  "Xenova/bge-small-en-v1.5",
  { quantized: true }
);

async function embedQuery(text) {
  // BGE expects the "query: " prefix for queries (not for documents)
  const out = await embedder("query: " + text,
                             { pooling: "mean", normalize: true });
  return new Float32Array(out.data);   // length 384
}
</script>
```

---

### Option 2 — Tiny backend (1 endpoint), keep existing embeddings

A single 30-line serverless function that takes a query string and returns
a 1536-dim `text-embedding-3-small` vector. The browser still does the
actual nearest-neighbor search against the static JSON files — the backend
only embeds the query, nothing else.

| Host | Free tier | Cold start | Auth pattern |
|---|---|---|---|
| Cloudflare Workers | 100k req/day | <10 ms | Use `WORKERS_AI` binding *or* a hosted OpenAI key |
| Vercel Edge Functions | 1M req/mo | <50 ms | Env var holds API key |
| Azure Container Apps (consumption) | 180k vCPU-s/mo | ~1 s warm-up | Managed identity → Azure OpenAI |
| Azure Static Web Apps + Functions | 100k req/mo | ~1 s | Built-in Easy Auth + managed identity |

**Pros:**
- Reuses the existing embeddings (no re-embed run needed).
- Query embedding quality is exactly what the corpus was built with.
- Backend is tiny, deployable in minutes, free for personal use.

**Cons:**
- Still need to deploy and maintain *something*.
- Need to keep an API key or Azure managed identity around.
- Single point of failure for queries (search becomes offline if the function is down).

**Sketch (Cloudflare Worker, ~30 lines):**

```javascript
export default {
  async fetch(req, env) {
    if (req.method !== "POST") return new Response("POST only", { status: 405 });
    const { text } = await req.json();
    const r = await fetch(
      `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/`
        + `text-embedding-3-small/embeddings?api-version=2024-02-01`,
      {
        method: "POST",
        headers: {
          "api-key": env.AZURE_OPENAI_KEY,         // or use AAD token
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: text }),
      },
    );
    const data = await r.json();
    return Response.json({ embedding: data.data[0].embedding });
  },
};
```

(If you're following the "no API keys at Microsoft" rule, swap the `api-key`
header for a bearer token from an Azure managed identity — Cloudflare doesn't
have that natively, so this is one of the few places Vercel/Azure Functions
make more sense than Cloudflare.)

---

### Option 3 — All-in-one backend (skip the "search in browser" idea)

If you already have a backend service, you may as well do the search there
too. Now the browser just sends a query string and receives a ranked list of
photo records.

Architectures roughly in order of capability:

1. **Naive in-memory** — backend loads the 320 MB of vectors at startup, does
   a brute-force dot product on every query. Fine for tens of thousands of
   photos. ~50 ms per query.
2. **HNSW index** — use [hnswlib](https://github.com/nmslib/hnswlib) or
   [usearch](https://github.com/unum-cloud/usearch) to build an index once,
   load it on startup. Sub-millisecond queries. Memory is similar.
3. **Vector database** — pgvector on Postgres, Qdrant, Weaviate, Pinecone,
   etc. Overkill for 52K records but the obvious choice once you cross
   ~1M records.
4. **Azure AI Search** with vector fields — managed service, exact match for
   the rest of the Azure stack.

**Pros:**
- One round-trip per query. No model downloads. Fast.
- Search runs anywhere; the browser is dumb.
- Easiest path to add features like filters (year, folder, file type) and
  hybrid keyword+vector search.

**Cons:**
- The captions JSON files become an internal data format, not the website's
  serving format.
- Highest infrastructure cost (still tiny for 52K records — a single
  `Standard_B1s` VM or container is plenty).

---

### Option 4 — Hybrid: keyword search as the default, semantic as an upgrade

If you don't want to commit to either backend or in-browser models, just
ship the JSON files and do **keyword/BM25 search** over the caption text in
the browser. This works surprisingly well because the captions are very
descriptive ("A golden retriever lying on a wood deck in afternoon sun.").

Libraries: [MiniSearch](https://github.com/lucaong/minisearch),
[Fuse.js](https://github.com/krisk/fuse),
[Lunr.js](https://lunrjs.com/).

**Pros:**
- Zero backend, zero model download, instant.
- Works offline.
- The embeddings can sit in the JSON unused until you're ready to add
  semantic search later (existing format is forward-compatible).

**Cons:**
- Not semantic — `"beach sunset"` finds photos whose captions contain those
  exact words. `"evening at the shore"` won't match.

**Sketch:**

```javascript
import MiniSearch from "minisearch";

const all = await Promise.all(batchUrls.map(u => fetch(u).then(r => r.json())));
const records = all.flatMap(b => b.records);

const idx = new MiniSearch({ fields: ["caption"], storeFields: ["path", "caption", "dropbox_url"] });
idx.addAll(records.map((r, i) => ({ id: i, ...r })));

const hits = idx.search("dog on a deck");
```

---

### Option 5 — Augment with hybrid retrieval

Combine semantic and keyword scoring. The browser does BM25 over captions
(fast, no model) and dot-product against pre-computed embeddings (fast, but
needs Option 1 or 2 for the query embedding). Sum or rank-fuse the two
scores. This is how most "best-in-class" search systems work and usually
beats either approach alone.

---

### About the search itself (sub-problem B)

In a modern browser, even brute-force search over 52K × 1536 floats is
*fast*:

- Dot product per record: 1536 multiply-adds.
- 52K records: ~80 million multiply-adds per query.
- On a 2-year-old laptop, that's ~50–100 ms in plain JavaScript with
  `Float32Array`s. Faster with SIMD / WebGPU.

So a search index is **not required** for this dataset. If you grow into
millions of records, switch to:

- **[hnswlib-wasm](https://github.com/ChenZhen-CH/hnswlib-wasm)** — HNSW in
  the browser. Index file is ~50% larger than raw vectors but query is
  sub-millisecond.
- **[usearch](https://github.com/unum-cloud/usearch)** — same idea, smaller,
  newer, supports quantization.
- **[Voy](https://github.com/tantaraio/voy)** — pure-Rust HNSW compiled to
  WASM, designed for the browser.

---

### Recommendation

For this 52K-photo dataset, in priority order:

1. **If you want fully-static and "good enough" quality:** Option 1. Pick
   `Xenova/bge-small-en-v1.5`, re-embed the 52K captions once
   (~10 min on a laptop), and host on GitHub Pages. ~330 MB of static
   files plus a one-time 33 MB model download.
2. **If you want best quality and don't mind one tiny serverless function:**
   Option 2. Keep the existing `text-embedding-3-small` embeddings,
   deploy a 30-line Cloudflare Worker or Vercel Edge Function for query
   embedding, do search in the browser. Free at personal scale.
3. **If you want filters/sorting/advanced features:** Option 3 with a
   `usearch` or Azure AI Search index behind it.
4. **As a stopgap or supplement to any of the above:** Option 4 (MiniSearch
   over captions) — ship it even before semantic is wired up; the
   ergonomics of "search captions" alone are surprisingly good.
