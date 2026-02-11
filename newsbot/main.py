#!/usr/bin/env python3
"""News Bot - Web crawler for news articles."""

import argparse
import sys
from pathlib import Path

# Ensure we can import from this directory
sys.path.insert(0, str(Path(__file__).parent))

import config
from crawler import crawl


def main():
    parser = argparse.ArgumentParser(
        description="Crawl news websites and cache articles.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                    # Use settings from .env
  python main.py --depth 3          # Crawl 3 links deep
  python main.py --max-pages 50     # Limit to 50 pages
  python main.py --recrawl 12       # Re-crawl after 12 hours
  python main.py --sources https://www.cnn.com https://www.bbc.com
        """,
    )
    
    parser.add_argument(
        "--depth",
        type=int,
        default=None,
        help=f"Maximum link depth to crawl (default: {config.MAX_DEPTH})",
    )
    
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help=f"Maximum pages to crawl (default: {config.MAX_PAGES})",
    )
    
    parser.add_argument(
        "--recrawl",
        type=float,
        default=None,
        help=f"Hours before re-crawling a URL (default: {config.RECRAWL_AFTER_HOURS})",
    )
    
    parser.add_argument(
        "--sources",
        nargs="+",
        default=None,
        help="URLs to crawl (default: from .env or config)",
    )
    
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help=f"Directory to cache pages (default: {config.CACHE_DIR})",
    )
    
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-crawl all pages, ignoring last crawl time",
    )
    
    args = parser.parse_args()
    
    # Override recrawl time to 0 if forcing
    recrawl_hours = 0 if args.force else args.recrawl
    
    try:
        stats = crawl(
            sources=args.sources,
            max_depth=args.depth,
            max_pages=args.max_pages,
            cache_dir=args.cache_dir,
            recrawl_hours=recrawl_hours,
        )
        
        return 0 if stats["pages_saved"] > 0 else 1
        
    except KeyboardInterrupt:
        print("\nCrawl interrupted by user.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
