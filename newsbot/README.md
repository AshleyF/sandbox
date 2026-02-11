# News Bot

A web crawler for collecting news articles from major news sources.

## Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. (Optional) Edit `.env` to customize settings.

## Usage

Basic crawl with default settings:
```bash
python main.py
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--depth N` | Maximum link depth to crawl | 2 |
| `--max-pages N` | Maximum pages to crawl | 100 |
| `--recrawl HOURS` | Re-crawl threshold in hours | 24 |
| `--sources URL [URL ...]` | Specific URLs to crawl | From .env |
| `--cache-dir DIR` | Cache directory | `cache/` |
| `--force` | Force re-crawl, ignore timestamps | Off |

### Examples

```bash
# Crawl 3 levels deep, max 200 pages
python main.py --depth 3 --max-pages 200

# Crawl specific sources
python main.py --sources https://www.cnn.com https://www.bbc.com

# Force re-crawl everything
python main.py --force

# Re-crawl pages older than 12 hours
python main.py --recrawl 12
```

## Configuration

Edit `.env` to customize:

- **MAX_DEPTH**: How many links deep to follow (default: 2)
- **MAX_PAGES**: Maximum pages to collect (default: 100)
- **REQUEST_DELAY**: Seconds between requests (default: 1.0)
- **REQUEST_TIMEOUT**: Request timeout in seconds (default: 10)
- **RECRAWL_AFTER_HOURS**: Skip URLs crawled within this time (default: 24)
- **NEWS_SOURCES**: Comma-separated list of starting URLs

## How It Works

1. **Breadth-First Crawl**: Starts from configured news sources and follows links
2. **Same-Domain Only**: Only follows links within the same domain
3. **Cycle Detection**: Tracks visited URLs to avoid infinite loops
4. **Smart Filtering**: Skips non-article URLs (images, videos, login pages, etc.)
5. **Crawl State**: Remembers when URLs were last crawled to avoid redundant work
6. **Polite Crawling**: Delays between requests to be respectful to servers

## Output

- Cached pages are saved in the `cache/` directory
- Each file includes metadata with the original URL and crawl timestamp
- Crawl state is saved in `crawl_state.json`

## Project Structure

```
newsbot/
├── .env.example     # Example configuration
├── .env             # Your configuration (git-ignored)
├── .gitignore       # Git ignore rules
├── config.py        # Configuration loader
├── crawler.py       # Web crawler implementation
├── main.py          # CLI entry point
├── requirements.txt # Python dependencies
├── README.md        # This file
├── cache/           # Cached pages (git-ignored)
└── crawl_state.json # Crawl history (git-ignored)
```
