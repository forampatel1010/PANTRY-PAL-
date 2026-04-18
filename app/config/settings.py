from dotenv import load_dotenv
import os

load_dotenv()


class Settings:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    # Optional override, e.g. gemini-2.0-flash. When empty, ai_service tries a built-in model chain.
    GEMINI_MODEL: str = (os.getenv("GEMINI_MODEL") or "").strip()
    SERPER_API_KEY: str = os.getenv("SERPER_API_KEY", "")
    YOUTUBE_API_KEY: str = os.getenv("YOUTUBE_API_KEY", "")


settings = Settings()
