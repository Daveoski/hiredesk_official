import logging
import uuid
from pathlib import Path

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile

from app.core.config import get_settings

logger = logging.getLogger(__name__)

ALLOWED_CV_EXTENSIONS = {".pdf", ".doc", ".docx"}
MAX_CV_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_DOCUMENT_EXTENSIONS = ALLOWED_CV_EXTENSIONS | {".png", ".jpg", ".jpeg"}
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024


def _upload(file: UploadFile, folder: str) -> str:
    settings = get_settings()
    if not settings.cloudinary_cloud_name:
        raise HTTPException(503, "File storage is not configured")

    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    try:
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="raw",
            folder=folder,
            public_id=f"{uuid.uuid4().hex}{Path(file.filename or '').suffix.lower()}",
        )
    except Exception as error:
        logger.exception("Cloudinary upload failed")
        raise HTTPException(502, "Could not upload the CV, please try again") from error
    return result["secure_url"]


def upload_cv(cv: UploadFile) -> str:
    """Check the CV file, upload it to Cloudinary and return its URL."""
    extension = Path(cv.filename or "").suffix.lower()
    if extension not in ALLOWED_CV_EXTENSIONS:
        raise HTTPException(422, "The CV must be a PDF, DOC or DOCX file")
    if cv.size is None or cv.size > MAX_CV_BYTES:
        raise HTTPException(413, "The CV must be 5 MB or smaller")
    return _upload(cv, "hiredesk/cvs")


def upload_supporting_document(document: UploadFile) -> dict[str, str]:
    extension = Path(document.filename or "").suffix.lower()
    if extension not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise HTTPException(422, "Supporting documents must be PDF, DOC, DOCX, PNG or JPG files")
    if document.size is None or document.size > MAX_DOCUMENT_BYTES:
        raise HTTPException(413, "Each supporting document must be 10 MB or smaller")
    return {
        "name": Path(document.filename or "document").name,
        "url": _upload(document, "hiredesk/application-documents"),
    }
