"""
Backend scaffold for OCR web-app.
- Runs detection/OCR on resized images (max side 1280px) while keeping normalized coordinates stable.
- Stores temporary files under tmp/.
- Detection via RT-DETR; OCR via manga-ocr (comic-translate) or PaddleOCR-VL-For-Manga.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import register_routes
from logging_config import setup_logger

# Setup logger
log = setup_logger()

# Create FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routes
register_routes(app, log)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
