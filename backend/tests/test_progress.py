"""Team members change their own password, and admins follow hiring progress by email and report."""
from tests.conftest import PASSWORD

SCORECARD = {"ratings": [{"criterion": "Problem solving", "rating": 4}], "recommendation": "recommend"}


def admin_subjects(outbox) -> list[str]:
    return [message["subject"] for message in outbox if message["to"] == "admin@acme.com"]


def test_invited_teammate_changes_their_own_password(world, outbox):
    response = world.client.put(
        "/auth/password", headers=world.ann, json={"current_password": PASSWORD, "password": "brand-new-pass"}
    )
    assert response.status_code == 200, response.text
    assert outbox[-1]["to"] == "ann@acme.com"
    assert "password was changed" in outbox[-1]["subject"]

    assert world.client.post("/auth/login", data={"username": "ann@acme.com", "password": PASSWORD}).status_code == 401
    login = world.client.post("/auth/login", data={"username": "ann@acme.com", "password": "brand-new-pass"})
    assert login.status_code == 200
    # The interviewer can still do their job with the new session.
    assert world.client.get("/interviews", headers={"Authorization": f"Bearer {login.json()['access_token']}"}).status_code == 200


def test_changing_password_needs_the_correct_current_password(world):
    wrong = world.client.put(
        "/auth/password", headers=world.manager, json={"current_password": "not-it", "password": "brand-new-pass"}
    )
    assert wrong.status_code == 400
    missing = world.client.put("/auth/password", headers=world.manager, json={"password": "brand-new-pass"})
    assert missing.status_code == 400
    same = world.client.put("/auth/password", headers=world.manager, json={"current_password": PASSWORD, "password": PASSWORD})
    assert same.status_code == 400
    assert world.client.post("/auth/login", data={"username": "manager@acme.com", "password": PASSWORD}).status_code == 200


def test_admin_is_emailed_as_hiring_progresses(world, outbox):
    application_id = world.apply()
    outbox.clear()

    world.client.patch(f"/applications/{application_id}/stage", headers=world.manager, json={"stage": "screen"})
    world.client.patch(f"/applications/{application_id}/stage", headers=world.manager, json={"stage": "interview"})
    scheduled = world.schedule(application_id, world.ann_id, world.slot(10))
    assert scheduled.status_code == 200, scheduled.text
    interview_id = scheduled.json()["id"]
    world.hold(interview_id)
    submitted = world.client.put(f"/interviews/{interview_id}/scorecard", headers=world.ann, json=SCORECARD)
    assert submitted.status_code == 200, submitted.text
    rejected = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "rejected"}
    )
    assert rejected.status_code == 200

    subjects = admin_subjects(outbox)
    assert [subject.split(":")[0] for subject in subjects] == [
        "[HireDesk] Candidate moved to screen",
        "[HireDesk] Candidate moved to interview",
        "[HireDesk] Interviewer assigned",
        "[HireDesk] Interview scheduled",
        "[HireDesk] Scorecard submitted",
        "[HireDesk] Candidate rejected",
    ]
    scorecard_email = next(m for m in outbox if m["subject"].startswith("[HireDesk] Scorecard submitted"))
    assert "Recommendation: recommend" in scorecard_email["text"]
    assert "Average rating: 4.0/5" in scorecard_email["text"]
    assert "/overview" in scorecard_email["text"]


def test_admin_is_emailed_when_an_invited_teammate_joins(world, outbox):
    invite = world.client.post(
        "/users", headers=world.admin, json={"email": "new@acme.com", "full_name": "Nia New", "role": "interviewer"}
    )
    token = invite.json()["invite_url"].split("token=", 1)[1]
    assert world.client.post("/auth/accept-invite", json={"token": token, "password": PASSWORD}).status_code == 201
    assert "[HireDesk] Nia New joined your team" in admin_subjects(outbox)


def test_progress_report_is_for_admins_and_shows_the_whole_company(world):
    first = world.apply("first@gmail.com")
    world.apply("second@gmail.com")
    world.client.patch(f"/applications/{first}/stage", headers=world.manager, json={"stage": "screen"})
    world.schedule(first, world.ann_id, world.slot(9))

    assert world.client.get("/reports/progress", headers=world.manager).status_code == 403
    assert world.client.get("/reports/progress", headers=world.ann).status_code == 403

    response = world.client.get("/reports/progress", headers=world.admin)
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["company_name"] == "Acme"
    assert report["totals"]["open_jobs"] == 1
    assert report["totals"]["active_candidates"] == 2
    assert report["totals"]["new_applications"] == 2
    assert report["totals"]["upcoming_interviews"] == 1
    assert report["pipeline"]["applied"] == 1
    assert report["pipeline"]["screen"] == 1
    assert report["jobs"][0]["applicants"] == 2
    assert report["jobs"][0]["hiring_manager_name"] == "Manager"

    team = {member["full_name"]: member for member in report["team"]}
    assert team["Manager"]["active_candidates"] == 2
    assert team["Ann"]["upcoming_interviews"] == 1
    assert team["Bob"]["upcoming_interviews"] == 0
    assert any(item["to_stage"] == "screen" and item["changed_by_name"] == "Manager" for item in report["recent_activity"])


def test_admin_can_email_the_progress_report(world, outbox):
    application_id = world.apply()
    world.client.patch(f"/applications/{application_id}/stage", headers=world.manager, json={"stage": "screen"})
    outbox.clear()

    response = world.client.post("/reports/progress/email?days=30", headers=world.admin)
    assert response.status_code == 200
    assert response.json() == {"sent_to": ["admin@acme.com"]}
    assert outbox[0]["subject"] == "[HireDesk] Progress report: Acme, last 30 days"
    assert "Backend Developer" in outbox[0]["text"]
    assert "Cathy Candidate" in outbox[0]["text"]


def test_scheduled_progress_reports_go_to_every_admin(world, outbox):
    from app.reports.send_progress_reports import send_progress_reports

    world.apply()
    outbox.clear()
    assert send_progress_reports() == 1
    assert outbox[0]["to"] == "admin@acme.com"
    assert "Progress report: Acme" in outbox[0]["subject"]
