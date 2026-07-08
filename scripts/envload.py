"""Load .env for local dev. Imported first by any module that reads env at
import time. In CI there is no .env — real values come from the environment."""

from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except Exception:
    pass
