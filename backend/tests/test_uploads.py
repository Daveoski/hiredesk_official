"""Direct browser-to-Cloudinary uploads: the API signs the upload, then verifies the file before accepting it."""
import cloudinary.exceptions
import cloudinary.utils
import pytest

FORM = {"full_name": "Cathy Candidate", "email": "cathy@gmail.com", "phone": "+2348012345678"}


class FakeCloudinary:
    """Files Cloudinary pretends to hold (public_id -> size in bytes), and the ones deleted."""

    def __init__(self):
        self.sizes: dict[str, int] = {}
        self.deleted: list[str] = []

    def __setitem__(self, public_id: str, size: int):
        self.sizes[public_id] = size

    def resource(self, public_id, resource_type):
        assert resource_type == "raw"
        if public_id not in self.sizes:
            raise cloudinary.exceptions.NotFound("not found")
        return {"bytes": self.sizes[public_id], "secure_url": f"https://res.cloudinary.com/test-cloud/raw/upload/{public_id}"}


@pytest.fixture
def cloudinary_files(monkeypatch):
    fake = FakeCloudinary()
    monkeypatch.setattr("cloudinary.api.resource", fake.resource)
    monkeypatch.setattr("cloudinary.uploader.destroy", lambda public_id, resource_type: fake.deleted.append(public_id))
    return fake


def sign(world, kind="cv", filename="cv.pdf", size=1000, job_id=None):
    return world.client.post(
        f"/public/jobs/{job_id or world.job_id}/uploads", json={"kind": kind, "filename": filename, "size": size}
    )


def test_upload_signature_is_valid_and_bound_to_one_file(world):
    response = sign(world, filename="My CV.PDF", size=4_000_000)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["upload_url"] == "https://api.cloudinary.com/v1_1/test-cloud/raw/upload"
    assert body["public_id"].startswith("hiredesk/cvs/") and body["public_id"].endswith(".pdf")
    fields = body["fields"]
    assert fields["public_id"] == body["public_id"]
    assert fields["api_key"] == "test-key"
    expected = cloudinary.utils.api_sign_request(
        {"public_id": fields["public_id"], "timestamp": int(fields["timestamp"])}, "test-secret"
    )
    assert fields["signature"] == expected
    assert "test-secret" not in response.text


def test_upload_signature_checks_type_size_and_job(world):
    assert sign(world, filename="cv.exe").status_code == 422
    assert sign(world, size=6 * 1024 * 1024).status_code == 413
    assert sign(world, kind="document", filename="photo.png", size=9 * 1024 * 1024).status_code == 200
    draft_job = world.add_job(world.manager_id, status="draft")
    assert sign(world, job_id=draft_job).status_code == 404


def test_candidate_applies_with_directly_uploaded_files(world, cloudinary_files):
    cv_id = sign(world).json()["public_id"]
    doc_id = sign(world, kind="document", filename="cert.png", size=8 * 1024 * 1024).json()["public_id"]
    cloudinary_files[cv_id] = 4_800_000  # bigger than the 4.5 MB request limit of hosted functions
    cloudinary_files[doc_id] = 8 * 1024 * 1024

    response = world.client.post(
        f"/public/jobs/{world.job_id}/applications",
        data={**FORM, "cv_public_id": cv_id, "document_public_ids": [doc_id], "document_names": ["certificate.png"]},
    )
    assert response.status_code == 201, response.text

    application = world.client.get(f"/applications/{response.json()['id']}", headers=world.manager).json()
    assert application["cv_url"].endswith(cv_id)
    assert application["supporting_documents"] == [
        {"name": "certificate.png", "url": f"https://res.cloudinary.com/test-cloud/raw/upload/{doc_id}"}
    ]


def test_direct_upload_that_is_too_big_is_rejected_and_deleted(world, cloudinary_files):
    cv_id = sign(world).json()["public_id"]
    cloudinary_files[cv_id] = 6 * 1024 * 1024  # the browser said 1000 bytes, Cloudinary knows better
    response = world.client.post(f"/public/jobs/{world.job_id}/applications", data={**FORM, "cv_public_id": cv_id})
    assert response.status_code == 413
    assert cloudinary_files.deleted == [cv_id]


def test_direct_upload_references_are_checked(world, cloudinary_files):
    url = f"/public/jobs/{world.job_id}/applications"
    # Not a file we signed: another folder, or a made-up name.
    assert world.client.post(url, data={**FORM, "cv_public_id": "other/folder/cv.pdf"}).status_code == 422
    assert world.client.post(url, data={**FORM, "cv_public_id": "hiredesk/cvs/" + "a" * 32 + ".exe"}).status_code == 422
    # Signed but never uploaded.
    missing = sign(world).json()["public_id"]
    assert world.client.post(url, data={**FORM, "cv_public_id": missing}).status_code == 422
    # No CV at all, or a document id without its name.
    assert world.client.post(url, data=FORM).status_code == 422
    cv_id = sign(world).json()["public_id"]
    cloudinary_files[cv_id] = 1000
    no_name = {**FORM, "cv_public_id": cv_id, "document_public_ids": [cv_id]}
    assert world.client.post(url, data=no_name).status_code == 422
