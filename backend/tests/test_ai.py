"""CV links and the AI hiring assistant. Gemini and Cloudinary downloads are replaced by fakes."""
from urllib.parse import parse_qs, urlparse

import pytest
from google.genai import errors

from app.ai.schemas import CriterionCheck, FinalReviewResult, JobDraft, ScreeningResult
from app.core.config import get_settings

ANSWERS = {
    JobDraft: JobDraft(
        description="Build and run our APIs.",
        qualification_requirements="- 3 years of Python",
        eligibility_criteria="- Right to work in Nigeria",
    ),
    ScreeningResult: ScreeningResult(
        match_score=140,  # out of range on purpose: the service clamps it
        recommendation="advance_to_interview",
        summary="Strong Python background.",
        strengths=["Python"],
        gaps=[],
        qualification_checks=[CriterionCheck(criterion="Python", status="met", evidence="CV, page 1")],
        eligibility_checks=[],
        cover_letter_assessment="No cover letter.",
    ),
    FinalReviewResult: FinalReviewResult(
        decision="hire",
        confidence="high",
        summary="Hire.",
        score_comparison="Manager and interviewer agree.",
        strengths=["Skills"],
        concerns=[],
        reasoning="Consistent strong scores.",
    ),
}


class FakeGemini:
    """Stands in for google.genai.Client. Records each request and answers for the requested schema.

    Models listed in `busy` fail with 503, like an overloaded free-tier model.
    """

    def __init__(self):
        self.requests: list[dict] = []
        self.busy: set[str] = set()
        self.models = self

    def generate_content(self, model, contents, config):
        self.requests.append({"model": model, "contents": contents, "config": config})
        if model in self.busy:
            raise errors.ServerError(503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})
        return type("Response", (), {"parsed": ANSWERS[config.response_schema], "text": ""})()

    def texts(self, request: int = -1) -> str:
        return "\n".join(part.text for part in self.requests[request]["contents"] if part.text)


@pytest.fixture
def gemini(monkeypatch):
    fake = FakeGemini()
    monkeypatch.setattr(get_settings(), "gemini_api_key", "test-key")
    monkeypatch.setattr("app.ai.service._client", lambda api_key: fake)
    monkeypatch.setattr("app.ai.service.download_file", lambda url: b"%PDF-1.4 fake cv")
    return fake


def test_cv_link_is_a_signed_download_that_expires(world):
    application_id = world.apply()
    response = world.client.get(f"/applications/{application_id}/files/cv", headers=world.manager)
    assert response.status_code == 200, response.text
    url = urlparse(response.json()["url"])
    assert url.netloc == "api.cloudinary.com" and url.path == "/v1_1/test-cloud/raw/download"
    query = parse_qs(url.query)
    assert query["public_id"] == ["cv.pdf"] and "signature" in query and "expires_at" in query
    assert "test-secret" not in response.text


def test_cv_links_follow_candidate_visibility(world):
    application_id = world.apply()
    assert world.client.get(f"/applications/{application_id}/files/cv", headers=world.ann).status_code == 404
    assert world.client.get(f"/applications/{application_id}/files/documents/0", headers=world.manager).status_code == 404


def test_ai_is_off_without_an_api_key(world):
    response = world.client.post("/ai/job-draft", headers=world.manager, json={"title": "Backend Developer"})
    assert response.status_code == 503
    application_id = world.apply()
    body = world.client.get(f"/applications/{application_id}/ai", headers=world.manager).json()
    assert body == {"enabled": False, "screening": None, "final_review": None}


def test_hiring_manager_drafts_a_job(world, gemini):
    response = world.client.post("/ai/job-draft", headers=world.manager, json={"title": "Backend Developer", "notes": "Lagos"})
    assert response.status_code == 200, response.text
    assert response.json()["eligibility_criteria"] == "- Right to work in Nigeria"
    assert "Acme" in gemini.texts() and "Lagos" in gemini.texts()
    assert world.client.post("/ai/job-draft", headers=world.ann, json={"title": "X"}).status_code == 403


def test_eligibility_criteria_are_saved_and_public(world):
    response = world.client.patch(f"/jobs/{world.job_id}", headers=world.manager, json={"eligibility_criteria": "- Based in Lagos"})
    assert response.status_code == 200, response.text
    assert world.client.get(f"/public/jobs/{world.job_id}").json()["eligibility_criteria"] == "- Based in Lagos"


def test_new_applications_are_screened_with_the_cv(world, gemini):
    application_id = world.apply()  # screened in the background on arrival
    request = gemini.requests[0]
    assert request["model"] == "gemini-3.6-flash"
    assert request["config"].response_schema is ScreeningResult
    pdf = next(part.inline_data for part in request["contents"] if part.inline_data)
    assert pdf.mime_type == "application/pdf" and pdf.data == b"%PDF-1.4 fake cv"
    assert "Cathy" not in gemini.texts(0)  # the name is withheld

    body = world.client.get(f"/applications/{application_id}/ai", headers=world.manager).json()
    assert body["screening"]["match_score"] == 100
    assert body["screening"]["documents_read"] == ["Curriculum vitae (CV)"]
    # Interviewers never see the AI results.
    assert world.client.get(f"/applications/{application_id}/ai", headers=world.ann).status_code == 403
    assert "ai_screening" not in world.client.get(f"/applications/{application_id}", headers=world.manager).json()


def test_a_busy_model_hands_over_to_the_backup_model(world, gemini):
    gemini.busy.add("gemini-3.6-flash")
    application_id = world.apply()
    assert [request["model"] for request in gemini.requests] == ["gemini-3.6-flash", "gemini-flash-lite-latest"]
    screening = world.client.get(f"/applications/{application_id}/ai", headers=world.manager).json()["screening"]
    assert screening["model"] == "gemini-flash-lite-latest"

    gemini.busy.add("gemini-flash-lite-latest")
    response = world.client.post(f"/applications/{application_id}/ai/screening", headers=world.manager)
    assert response.status_code == 429


def test_manager_can_rerun_the_screening(world, gemini):
    application_id = world.apply()
    response = world.client.post(f"/applications/{application_id}/ai/screening", headers=world.manager)
    assert response.status_code == 200, response.text
    assert len(gemini.requests) == 2
    assert world.client.post(f"/applications/{application_id}/ai/screening", headers=world.admin).status_code == 403


def test_final_review_compares_scorecards_with_the_manager_score(world, gemini):
    application_id = world.apply()
    url = f"/applications/{application_id}/ai/final-review"
    assert world.client.post(url, headers=world.manager).status_code == 409  # no scorecards yet

    interview_id = world.schedule(application_id, world.ann_id, world.slot(10)).json()["id"]
    world.hold(interview_id)
    submitted = world.client.put(
        f"/interviews/{interview_id}/scorecard",
        headers=world.ann,
        json={"recommendation": "recommend", "ratings": [{"criterion": "Skills", "rating": 4, "comment": "Solid"}]},
    )
    assert submitted.status_code == 200, submitted.text
    assert world.client.post(url, headers=world.manager).status_code == 409  # no manager score yet

    world.client.patch(f"/applications/{application_id}/assessment", headers=world.manager, json={"match_score": 85})
    response = world.client.post(url, headers=world.manager)
    assert response.status_code == 200, response.text
    review = response.json()["final_review"]
    assert review["decision"] == "hire"
    assert review["manager_match_score"] == 85 and review["interviewer_average"] == 4.0
    assert "Skills: 4/5 (comment: Solid)" in gemini.texts() and "85/100" in gemini.texts()
