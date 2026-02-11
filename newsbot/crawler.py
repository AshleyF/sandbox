"""Web crawler for news articles."""

import hashlib
import json
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

import config


@dataclass
class CrawlState:
    """Tracks crawl history to avoid re-crawling recent pages."""
    
    url_timestamps: dict[str, str] = field(default_factory=dict)  # URL -> ISO timestamp
    
    @classmethod
    def load(cls, path: Path) -> "CrawlState":
        """Load crawl state from file."""
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return cls(url_timestamps=data.get("url_timestamps", {}))
            except (json.JSONDecodeError, IOError):
                pass
        return cls()
    
    def save(self, path: Path) -> None:
        """Save crawl state to file."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"url_timestamps": self.url_timestamps}, f, indent=2)
    
    def should_crawl(self, url: str, recrawl_hours: float) -> bool:
        """Check if URL should be crawled based on last crawl time."""
        if url not in self.url_timestamps:
            return True
        
        last_crawl = datetime.fromisoformat(self.url_timestamps[url])
        threshold = datetime.now() - timedelta(hours=recrawl_hours)
        return last_crawl < threshold
    
    def mark_crawled(self, url: str) -> None:
        """Mark URL as crawled with current timestamp."""
        self.url_timestamps[url] = datetime.now().isoformat()


def url_to_filename(url: str) -> str:
    """Convert URL to a safe filename."""
    # Create a hash for uniqueness
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    
    # Extract domain and path for readability
    parsed = urlparse(url)
    domain = parsed.netloc.replace("www.", "").replace(".", "_")
    path = parsed.path.strip("/").replace("/", "_")[:50]
    
    if path:
        return f"{domain}_{path}_{url_hash}.html"
    return f"{domain}_{url_hash}.html"


def normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    parsed = urlparse(url)
    # Remove fragment, normalize trailing slashes
    normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
    if parsed.query:
        normalized += f"?{parsed.query}"
    return normalized


def is_same_domain(url: str, base_url: str) -> bool:
    """Check if URL is from the same domain as base."""
    url_domain = urlparse(url).netloc.replace("www.", "")
    base_domain = urlparse(base_url).netloc.replace("www.", "")
    return url_domain == base_domain


def is_valid_news_url(url: str) -> bool:
    """Filter out non-news URLs (images, videos, etc.)."""
    parsed = urlparse(url)
    path = parsed.path.lower()
    
    # Skip non-HTML resources
    skip_extensions = [
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
        ".mp4", ".mp3", ".avi", ".mov", ".wmv",
        ".pdf", ".doc", ".docx", ".xls", ".xlsx",
        ".css", ".js", ".json", ".xml",
        ".zip", ".rar", ".tar", ".gz",
    ]
    if any(path.endswith(ext) for ext in skip_extensions):
        return False
    
    # Skip common non-article paths
    skip_paths = [
        "/login", "/signin", "/signup", "/register",
        "/search", "/cart", "/checkout",
        "/privacy", "/terms", "/contact", "/about",
        "/ads/", "/advertisement",
    ]
    if any(skip in path for skip in skip_paths):
        return False
    
    return True


def extract_links(html: str, base_url: str) -> list[str]:
    """Extract all valid links from HTML content."""
    soup = BeautifulSoup(html, "lxml")
    links = []
    
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        
        # Skip javascript, mailto, tel links
        if href.startswith(("javascript:", "mailto:", "tel:", "#")):
            continue
        
        # Convert relative URLs to absolute
        absolute_url = urljoin(base_url, href)
        normalized = normalize_url(absolute_url)
        
        # Only follow same-domain links
        if is_same_domain(normalized, base_url) and is_valid_news_url(normalized):
            links.append(normalized)
    
    return list(set(links))  # Deduplicate


def fetch_page(url: str) -> tuple[str | None, int]:
    """Fetch a page and return (content, status_code)."""
    headers = {
        "User-Agent": config.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }
    
    try:
        response = requests.get(
            url,
            headers=headers,
            timeout=config.REQUEST_TIMEOUT,
            allow_redirects=True,
        )
        
        # Only accept HTML responses
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type.lower():
            return None, response.status_code
        
        return response.text, response.status_code
    
    except requests.RequestException as e:
        print(f"  Error fetching {url}: {e}")
        return None, 0


def save_page(url: str, content: str, cache_dir: Path) -> Path:
    """Save page content to cache directory."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    filename = url_to_filename(url)
    filepath = cache_dir / filename
    
    # Save with metadata header
    metadata = {
        "url": url,
        "crawled_at": datetime.now().isoformat(),
    }
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"<!-- CRAWL_METADATA: {json.dumps(metadata)} -->\n")
        f.write(content)
    
    return filepath


def crawl(
    sources: list[str] | None = None,
    max_depth: int | None = None,
    max_pages: int | None = None,
    cache_dir: Path | None = None,
    state_file: Path | None = None,
    recrawl_hours: float | None = None,
) -> dict:
    """
    Crawl news sources and save pages to cache.
    
    Returns statistics about the crawl.
    """
    # Use config defaults
    sources = sources or config.NEWS_SOURCES
    max_depth = max_depth if max_depth is not None else config.MAX_DEPTH
    max_pages = max_pages if max_pages is not None else config.MAX_PAGES
    cache_dir = cache_dir or config.CACHE_DIR
    state_file = state_file or config.CRAWL_STATE_FILE
    recrawl_hours = recrawl_hours if recrawl_hours is not None else config.RECRAWL_AFTER_HOURS
    
    # Load crawl state
    state = CrawlState.load(state_file)
    
    # Track visited URLs and stats
    visited: set[str] = set()
    pages_crawled = 0
    pages_skipped = 0
    pages_saved = 0
    
    # BFS queue: (url, depth, source_url)
    queue: deque[tuple[str, int, str]] = deque()
    
    # Initialize queue with source URLs
    for source in sources:
        normalized = normalize_url(source)
        queue.append((normalized, 0, normalized))
        visited.add(normalized)
    
    print(f"Starting crawl of {len(sources)} sources...")
    print(f"Max depth: {max_depth}, Max pages: {max_pages}")
    print(f"Re-crawl threshold: {recrawl_hours} hours")
    print("-" * 50)
    
    while queue and pages_crawled < max_pages:
        url, depth, source_url = queue.popleft()
        
        # Check if we should skip based on recent crawl
        if not state.should_crawl(url, recrawl_hours):
            print(f"  Skipping (recently crawled): {url}")
            pages_skipped += 1
            continue
        
        print(f"[{pages_crawled + 1}/{max_pages}] Depth {depth}: {url}")
        
        # Fetch the page
        content, status_code = fetch_page(url)
        
        if content is None:
            print(f"  Failed (status: {status_code})")
            continue
        
        # Save to cache
        filepath = save_page(url, content, cache_dir)
        pages_saved += 1
        pages_crawled += 1
        print(f"  Saved: {filepath.name}")
        
        # Mark as crawled
        state.mark_crawled(url)
        
        # Extract and queue links if not at max depth
        if depth < max_depth:
            links = extract_links(content, url)
            new_links = 0
            
            for link in links:
                if link not in visited:
                    visited.add(link)
                    queue.append((link, depth + 1, source_url))
                    new_links += 1
            
            if new_links > 0:
                print(f"  Found {new_links} new links")
        
        # Be polite - delay between requests
        if queue:
            time.sleep(config.REQUEST_DELAY)
    
    # Save updated state
    state.save(state_file)
    
    stats = {
        "sources": len(sources),
        "pages_crawled": pages_crawled,
        "pages_skipped": pages_skipped,
        "pages_saved": pages_saved,
        "urls_discovered": len(visited),
    }
    
    print("-" * 50)
    print(f"Crawl complete!")
    print(f"  Pages crawled: {pages_crawled}")
    print(f"  Pages skipped (recent): {pages_skipped}")
    print(f"  Pages saved: {pages_saved}")
    print(f"  Total URLs discovered: {len(visited)}")
    
    return stats


if __name__ == "__main__":
    crawl()
