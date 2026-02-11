"""Analyze cached news articles using LLM."""

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup
from openai import OpenAI

import config


@dataclass
class ArticleAnalysis:
    """Analysis result for a single article."""
    url: str
    filename: str
    title: str
    description: str
    tags: list[str]
    analyzed_at: str
    source_domain: str


def load_existing_analysis(path: Path) -> dict[str, ArticleAnalysis]:
    """Load existing analysis from JSON file."""
    if not path.exists():
        return {}
    
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        result = {}
        for item in data.get("articles", []):
            result[item["filename"]] = ArticleAnalysis(**item)
        return result
    except (json.JSONDecodeError, IOError, KeyError):
        return {}


def save_analysis(path: Path, articles: dict[str, ArticleAnalysis], all_tags: set[str]) -> None:
    """Save analysis to JSON file."""
    data = {
        "last_updated": datetime.now().isoformat(),
        "total_articles": len(articles),
        "all_tags": sorted(all_tags),
        "articles": [asdict(a) for a in articles.values()],
    }
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def extract_metadata_and_text(filepath: Path) -> tuple[str | None, str, str]:
    """Extract URL from metadata comment and article text from HTML."""
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    # Extract URL from metadata comment
    url = None
    metadata_match = re.search(r'<!-- CRAWL_METADATA: ({.*?}) -->', content)
    if metadata_match:
        try:
            metadata = json.loads(metadata_match.group(1))
            url = metadata.get("url")
        except json.JSONDecodeError:
            pass
    
    # Parse HTML and extract text
    soup = BeautifulSoup(content, "lxml")
    
    # Remove script and style elements
    for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
        element.decompose()
    
    # Get the page title
    page_title = ""
    if soup.title:
        page_title = soup.title.get_text(strip=True)
    
    # Try to find main content area
    main_content = None
    for selector in ["article", "main", '[role="main"]', ".article-body", ".story-body"]:
        main_content = soup.select_one(selector)
        if main_content:
            break
    
    if main_content:
        text = main_content.get_text(separator=" ", strip=True)
    else:
        # Fallback to body
        text = soup.get_text(separator=" ", strip=True)
    
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Limit text length for LLM (first ~4000 chars should be enough)
    if len(text) > 4000:
        text = text[:4000] + "..."
    
    return url, page_title, text


def analyze_article(client: OpenAI, page_title: str, text: str, model: str) -> dict | None:
    """Use LLM to analyze article and generate title, description, and tags."""
    
    if len(text) < 100:
        # Too short to be a real article
        return None
    
    prompt = f"""Analyze this news article and provide:
1. A concise title (max 80 chars) - use the original if good, otherwise improve it
2. A brief description (1-2 sentences, max 200 chars)
3. 2-5 topic tags for clustering similar articles (e.g., "politics", "technology", "sports", "climate", "business", "health", etc.)

Original page title: {page_title}

Article text:
{text}

Respond in JSON format only:
{{"title": "...", "description": "...", "tags": ["tag1", "tag2", ...]}}"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a news analyst. Respond only with valid JSON, no markdown."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=300,
        )
        
        content = response.choices[0].message.content.strip()
        
        # Clean up markdown code blocks if present
        if content.startswith("```"):
            content = re.sub(r'^```(?:json)?\n?', '', content)
            content = re.sub(r'\n?```$', '', content)
        
        return json.loads(content)
    
    except Exception as e:
        print(f"  LLM error: {e}")
        return None


def get_domain(url: str) -> str:
    """Extract domain from URL."""
    if not url:
        return "unknown"
    match = re.search(r'https?://(?:www\.)?([^/]+)', url)
    return match.group(1) if match else "unknown"


def analyze(
    cache_dir: Path | None = None,
    analysis_file: Path | None = None,
    model: str | None = None,
    force: bool = False,
) -> dict:
    """
    Analyze all cached articles using LLM.
    
    Returns statistics about the analysis.
    """
    cache_dir = cache_dir or config.CACHE_DIR
    analysis_file = analysis_file or config.ANALYSIS_FILE
    model = model or config.OPENAI_MODEL
    
    if not config.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set in environment")
    
    client = OpenAI(api_key=config.OPENAI_API_KEY)
    
    # Load existing analysis (skip already analyzed files unless force)
    existing = {} if force else load_existing_analysis(analysis_file)
    all_tags: set[str] = set()
    
    # Collect existing tags
    for article in existing.values():
        all_tags.update(article.tags)
    
    # Find all cached HTML files
    if not cache_dir.exists():
        print(f"Cache directory not found: {cache_dir}")
        return {"analyzed": 0, "skipped": 0, "failed": 0}
    
    html_files = list(cache_dir.glob("*.html"))
    print(f"Found {len(html_files)} cached files")
    print(f"Already analyzed: {len(existing)}")
    print(f"Using model: {model}")
    print("-" * 50)
    
    analyzed = 0
    skipped = 0
    failed = 0
    
    for i, filepath in enumerate(html_files):
        filename = filepath.name
        
        if filename in existing and not force:
            skipped += 1
            continue
        
        print(f"[{i + 1}/{len(html_files)}] Analyzing: {filename}")
        
        # Extract content
        url, page_title, text = extract_metadata_and_text(filepath)
        
        if not text or len(text) < 100:
            print("  Skipping (too short)")
            failed += 1
            continue
        
        # Analyze with LLM
        result = analyze_article(client, page_title, text, model)
        
        if not result:
            print("  Failed to analyze")
            failed += 1
            continue
        
        # Create analysis record
        article = ArticleAnalysis(
            url=url or "",
            filename=filename,
            title=result.get("title", page_title)[:80],
            description=result.get("description", "")[:200],
            tags=[t.lower().strip() for t in result.get("tags", [])],
            analyzed_at=datetime.now().isoformat(),
            source_domain=get_domain(url),
        )
        
        existing[filename] = article
        all_tags.update(article.tags)
        analyzed += 1
        
        print(f"  Title: {article.title}")
        print(f"  Tags: {', '.join(article.tags)}")
    
    # Save results
    save_analysis(analysis_file, existing, all_tags)
    
    stats = {
        "analyzed": analyzed,
        "skipped": skipped,
        "failed": failed,
        "total": len(existing),
        "unique_tags": len(all_tags),
    }
    
    print("-" * 50)
    print(f"Analysis complete!")
    print(f"  Newly analyzed: {analyzed}")
    print(f"  Skipped (already done): {skipped}")
    print(f"  Failed: {failed}")
    print(f"  Total articles: {len(existing)}")
    print(f"  Unique tags: {len(all_tags)}")
    print(f"  Saved to: {analysis_file}")
    
    return stats


if __name__ == "__main__":
    analyze()
