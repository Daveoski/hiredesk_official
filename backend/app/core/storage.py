"""CV and supporting-document storage on Cloudinary.

Two ways to get a file in:

- Through the API (`upload_cv`, `upload_supporting_document`): the file is part of the
  application request. Simple, but hosted serverless functions (Vercel) cap request
  bodies at 4.5 MB.
- Direct from the browser (`create_signed_upload`, then `confirm_upload`): the API signs
  a one-time upload for one exact file name in our folder, the browser sends the file
  straight to Cloudinary, and the application request only carries its public id. The
  API then asks Cloudinary for the real size before accepting it.
"""
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Literal

import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils
from fastapi import HTTPException, UploadFile

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

ALLOWED_CV_EXTENSIONS = {".pdf", ".doc", ".docx"}
MAX_CV_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_DOCUMENT_EXTENSIONS = ALLOWED_CV_EXTENSIONS | {".png", ".jpg", ".jpeg"}
MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

UploadKind = Literal["cv", "document"]
CV_FOLDER = "hiredesk/cvs"
DOCUMENT_FOLDER = "hiredesk/application-documents"

# kind -> (folder, allowed extensions, max bytes, size error, type error)
RULES: dict[str, tuple[str, set[str], int, str, str]] = {
    "cv": (
        CV_FOLDER,
        ALLOWED_CV_EXTENSIONS,
        MAX_CV_BYTES,
        "The CV must be 5 MB or smaller",
        "The CV must be a PDF, DOC or DOCX file",
    ),
    "document": (
        DOCUMENT_FOLDER,
        ALLOWED_DOCUMENT_EXTENSIONS,
        MAX_DOCUMENT_BYTES,
        "Each supporting document must be 10 MB or smaller",
        "Supporting documents must be PDF, DOC, DOCX, PNG or JPG files",
    ),
}


def _configure() -> Settings:
    settings = get_settings()
    if not settings.cloudinary_cloud_name:
        raise HTTPException(503, "File storage is not configured")
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    return settings


def _check(kind: UploadKind, filename: str | None, size: int | None) -> str:
    """Return the lowercase extension, or raise if the type or size is not allowed."""
    _, extensions, max_bytes, size_error, type_error = RULES[kind]
    extension = Path(filename or "").suffix.lower()
    if extension not in extensions:
        raise HTTPException(422, type_error)
    if size is None or size > max_bytes:
        raise HTTPException(413, size_error)
    return extension


# ---- Upload through the API ----


def _upload(file: UploadFile, folder: str) -> str:
    _configure()
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
    _check("cv", cv.filename, cv.size)
    return _upload(cv, CV_FOLDER)


def upload_supporting_document(document: UploadFile) -> dict[str, str]:
    _check("document", document.filename, document.size)
    return {
        "name": Path(document.filename or "document").name,
        "url": _upload(document, DOCUMENT_FOLDER),
    }


# ---- Direct upload from the browser ----


def create_signed_upload(kind: UploadKind, filename: str, size: int) -> dict:
    """Sign a Cloudinary upload for one new file. The signature only allows this exact public id."""
    extension = _check(kind, filename, size)
    settings = _configure()
    public_id = f"{RULES[kind][0]}/{uuid.uuid4().hex}{extension}"
    params = {"public_id": public_id, "timestamp": int(time.time())}
    signature = cloudinary.utils.api_sign_request(params, settings.cloudinary_api_secret)
    return {
        "upload_url": f"https://api.cloudinary.com/v1_1/{settings.cloudinary_cloud_name}/raw/upload",
        "public_id": public_id,
        "fields": {
            "api_key": settings.cloudinary_api_key,
            "public_id": public_id,
            "timestamp": str(params["timestamp"]),
            "signature": signature,
        },
    }


def confirm_upload(kind: UploadKind, public_id: str) -> str:
    """Check a browser upload with Cloudinary and return its URL.

    Only ids in our folder with the shape we sign are accepted, and the size comes from
    Cloudinary, not from the browser. A file that is too big is deleted.
    """
    folder, extensions, max_bytes, size_error, type_error = RULES[kind]
    match = re.fullmatch(rf"{re.escape(folder)}/[0-9a-f]{{32}}(\.[a-z]+)", public_id)
    if match is None:
        raise HTTPException(422, "The uploaded file reference is not valid")
    if match.group(1) not in extensions:
        raise HTTPException(422, type_error)

    _configure()
    try:
        resource = cloudinary.api.resource(public_id, resource_type="raw")
    except cloudinary.exceptions.NotFound as error:
        raise HTTPException(422, "The uploaded file was not found, please upload it again") from error
    except Exception as error:
        logger.exception("Cloudinary lookup failed")
        raise HTTPException(502, "Could not check the uploaded file, please try again") from error

    if int(resource.get("bytes", 0)) > max_bytes:
        try:
            cloudinary.uploader.destroy(public_id, resource_type="raw")
        except Exception:
            logger.exception("Could not delete the oversized upload %s", public_id)
        raise HTTPException(413, size_error)
    return resource["secure_url"]
