import re
import httpx
from app.config.settings import settings

SERPER_URL = "https://google.serper.dev/search"
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
TIMEOUT = 10.0

SPAM_DOMAINS = {
    "pinterest.com", "quora.com", "reddit.com", "facebook.com",
    "instagram.com", "twitter.com", "tiktok.com", "snapchat.com",
    "amazon.com", "flipkart.com", "ebay.com",
}

PREFERRED_DOMAINS = {
    "hebbarskitchen.com", "archanaskitchen.com", "vegrecipesofindia.com",
    "cookingandme.com", "indianhealthyrecipes.com", "ruchiskitchen.com",
    "tarladalal.com", "spiceupthecurry.com", "manjulaskitchen.com",
    "sanjaytorarestaurant.com", "allrecipes.com", "food.com",
    "simplyrecipes.com", "seriouseats.com", "bbc.co.uk",
}


def _extract_domain(url: str) -> str:
    match = re.search(r"https?://(?:www\.)?([^/]+)", url)
    return match.group(1).lower() if match else ""


def _clean_title(title: str) -> str:
    title = re.sub(r"\s*[-|]\s*.*$", "", title).strip()
    title = re.sub(r"\s+", " ", title)
    return title


def _is_valid_link(url: str) -> bool:
    domain = _extract_domain(url)
    return domain not in SPAM_DOMAINS


def _rank_links(links: list[dict]) -> list[dict]:
    def score(link: dict) -> int:
        domain = _extract_domain(link.get("url", ""))
        return 1 if domain in PREFERRED_DOMAINS else 0

    return sorted(links, key=score, reverse=True)


async def fetch_web_links(query: str) -> list[dict]:
    if not settings.SERPER_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.post(
                SERPER_URL,
                headers={
                    "X-API-KEY": settings.SERPER_API_KEY,
                    "Content-Type": "application/json",
                },
                json={"q": query, "num": 10},
            )
            response.raise_for_status()
            data = response.json()

        raw_links = [
            {
                "title": _clean_title(item.get("title", "")),
                "url": item.get("link", ""),
                "snippet": item.get("snippet", ""),
            }
            for item in data.get("organic", [])
            if item.get("link")
        ]

        valid_links = [l for l in raw_links if _is_valid_link(l["url"])]
        ranked = _rank_links(valid_links)
        return ranked[:3]

    except Exception:
        return []


async def fetch_youtube_videos(query: str) -> list[dict]:
    if not settings.YOUTUBE_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                YOUTUBE_SEARCH_URL,
                params={
                    "part": "snippet",
                    "q": query,
                    "type": "video",
                    "maxResults": 5,
                    "relevanceLanguage": "en",
                    "key": settings.YOUTUBE_API_KEY,
                },
            )
            response.raise_for_status()
            data = response.json()

        videos = []
        for item in data.get("items", []):
            video_id = item.get("id", {}).get("videoId")
            snippet = item.get("snippet", {})
            title = _clean_title(snippet.get("title", ""))
            channel = snippet.get("channelTitle", "")
            thumbnail = (
                snippet.get("thumbnails", {})
                .get("medium", {})
                .get("url", "")
            )
            if video_id and title:
                videos.append({
                    "title": title,
                    "channel": channel,
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "thumbnail": thumbnail,
                })
            if len(videos) == 3:
                break

        return videos

    except Exception:
        return []


async def fetch_all_resources(search_queries: list[str]) -> dict:
    query = search_queries[0] if search_queries else ""
    if not query:
        return {"web_links": [], "youtube_videos": []}

    web_links, youtube_videos = await _gather(
        fetch_web_links(query),
        fetch_youtube_videos(query),
    )

    return {
        "web_links": web_links,
        "youtube_videos": youtube_videos,
    }


async def _gather(*coros):
    import asyncio
    return await asyncio.gather(*coros, return_exceptions=False)
