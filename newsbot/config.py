"""Configuration loader for News Bot."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
load_dotenv()


def get_env(key: str, default: str = "") -> str:
    return os.getenv(key, default)


def get_env_int(key: str, default: int) -> int:
    val = os.getenv(key)
    return int(val) if val else default


def get_env_float(key: str, default: float) -> float:
    val = os.getenv(key)
    return float(val) if val else default


def get_env_list(key: str, default: list[str] | None = None) -> list[str]:
    val = os.getenv(key)
    if not val:
        return default or []
    return [s.strip() for s in val.split(",") if s.strip()]


# OpenAI settings
OPENAI_API_KEY = get_env("OPENAI_API_KEY")
OPENAI_MODEL = get_env("OPENAI_MODEL", "gpt-4o-mini")

# Crawler settings
MAX_DEPTH = get_env_int("MAX_DEPTH", 2)
MAX_PAGES = get_env_int("MAX_PAGES", 100)
REQUEST_DELAY = get_env_float("REQUEST_DELAY", 1.0)
REQUEST_TIMEOUT = get_env_int("REQUEST_TIMEOUT", 10)
USER_AGENT = get_env("USER_AGENT", "NewsBot/1.0")

# Cache settings
CACHE_DIR = Path(get_env("CACHE_DIR", "cache"))
CRAWL_STATE_FILE = Path(get_env("CRAWL_STATE_FILE", "crawl_state.json"))

# Re-crawl threshold
RECRAWL_AFTER_HOURS = get_env_float("RECRAWL_AFTER_HOURS", 24)

# News sources
NEWS_SOURCES = get_env_list("NEWS_SOURCES", [
    "https://www.cnn.com",
    "https://www.bbc.com",
    "https://www.reuters.com",
    "https://www.npr.org",
    "https://www.theguardian.com",
    "https://apnews.com",
])

# Analyzer settings
ANALYSIS_FILE = Path(get_env("ANALYSIS_FILE", "news_analysis.json"))
