"""
Logging configuration.
"""
import logging
from logging.handlers import RotatingFileHandler

from config import LOG_FILE


def setup_logger() -> logging.Logger:
    """
    Configure structured logging to both console and a rotating file.
    """
    logger = logging.getLogger("ocr_backend")
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=5)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger


def log_event(event: str, logger: logging.Logger, **kwargs):
    """
    Log small payloads in a consistent JSON-ish format.
    """
    import json
    payload = {k: v for k, v in kwargs.items() if v is not None}
    try:
        formatted = json.dumps(payload, default=str, ensure_ascii=True)
    except Exception:
        formatted = str(payload)
    logger.info("%s %s", event, formatted)

