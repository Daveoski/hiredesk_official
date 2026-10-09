def test_candidate_applies_without_an_account(world):
    # The public job page needs no login.
    page = world.client.get(f"/public/jobs/{world.job_id}")
    assert page.status_code == 200
    assert page.json()["company_name"] == "Acme"

    application_id = world.apply()

    application = world.client.get(f"/applications/{application_id}", headers=world.manager)
    assert application.status_code == 200
    assert application.json()["stage"] == "applied"
    assert application.json()["job_title"] == "Backend Developer"
    assert application.json()["cv_url"].startswith("https://res.cloudinary.com/")

    # The history starts with the application itself.
    history = world.client.get(f"/applications/{application_id}/history", headers=world.manager).json()
    assert len(history) == 1
    assert history[0]["from_stage"] is None
    assert history[0]["to_stage"] == "applied"
    assert history[0]["changed_by_id"] is None


def test_public_application_accepts_up_to_six_supporting_documents(world):
    files = [("cv", ("cv.pdf", b"%PDF", "application/pdf"))]
    files.extend(
        ("supporting_documents", (f"document-{index}.pdf", b"%PDF", "application/pdf"))
        for index in range(6)
    )
    response = world.client.post(
        f"/public/jobs/{world.job_id}/applications",
        data={
            "full_name": "Cathy Candidate",
            "email": "documents@gmail.com",
            "phone": "+2348012345678",
            "candidate_qualifications": "Python and database experience",
            "expected_salary": "125000",
        },
        files=files,
    )
    assert response.status_code == 201, response.text
    application = world.client.get(f"/applications/{response.json()['id']}", headers=world.manager).json()
    assert application["expected_salary"] == 125000
    assert len(application["supporting_documents"]) == 6
    assert application["supporting_documents"][0]["name"] == "document-0.pdf"

    too_many = files + [("supporting_documents", ("extra.pdf", b"%PDF", "application/pdf"))]
    rejected = world.client.post(
        f"/public/jobs/{world.job_id}/applications",
        data={
            "full_name": "Another Candidate",
            "email": "extra@gmail.com",
            "phone": "+2348012345678",
            "candidate_qualifications": "Relevant experience",
        },
        files=too_many,
    )
    assert rejected.status_code == 422


def test_candidates_cannot_use_protected_endpoints(world):
    application_id = world.apply()
    assert world.client.get(f"/applications/{application_id}").status_code == 401
    assert world.client.get("/applications").status_code == 401
    assert world.client.patch(f"/applications/{application_id}/stage", json={"stage": "screen"}).status_code == 401


def test_cannot_apply_to_a_job_that_is_not_open(world):
    draft_job_id = world.add_job(hiring_manager_id=None, status="draft")
    assert world.client.get(f"/public/jobs/{draft_job_id}").status_code == 404
    response = world.client.post(
        f"/public/jobs/{draft_job_id}/applications",
        data={"full_name": "Cathy", "email": "cathy@gmail.com", "phone": "+2348012345678"},
        files={"cv": ("cv.pdf", b"%PDF", "application/pdf")},
    )
    assert response.status_code == 404

    world.client.patch(f"/jobs/{world.job_id}", headers=world.manager, json={"status": "closed"})
    assert world.client.get(f"/public/jobs/{world.job_id}").status_code == 404


def test_the_same_email_cannot_apply_twice_to_a_job(world):
    world.apply(email="cathy@gmail.com")
    response = world.client.post(
        f"/public/jobs/{world.job_id}/applications",
        data={"full_name": "Cathy", "email": "CATHY@gmail.com", "phone": "+2348012345678"},
        files={"cv": ("cv.pdf", b"%PDF", "application/pdf")},
    )
    assert response.status_code == 409


def test_invalid_applications_are_rejected(world):
    url = f"/public/jobs/{world.job_id}/applications"
    good_file = {"cv": ("cv.pdf", b"%PDF", "application/pdf")}

    bad_email = {"full_name": "Cathy", "email": "not-an-email", "phone": "+2348012345678"}
    assert world.client.post(url, data=bad_email, files=good_file).status_code == 422

    good_form = {"full_name": "Cathy", "email": "cathy@gmail.com", "phone": "+2348012345678"}
    wrong_type = {"cv": ("virus.exe", b"MZ", "application/octet-stream")}
    assert world.client.post(url, data=good_form, files=wrong_type).status_code == 422
    assert world.client.post(url, data=good_form).status_code == 422  # no CV at all


def test_moving_a_candidate_is_recorded_in_the_stage_history(world):
    application_id = world.apply()

    response = world.client.patch(f"/applications/{application_id}/stage", headers=world.manager, json={"stage": "screen"})
    assert response.status_code == 200
    assert response.json()["stage"] == "screen"

    history = world.client.get(f"/applications/{application_id}/history", headers=world.manager).json()
    assert [(row["from_stage"], row["to_stage"]) for row in history] == [(None, "applied"), ("applied", "screen")]
    assert history[1]["changed_by_id"] == world.manager_id
    assert history[1]["changed_at"] is not None


def test_stages_cannot_be_skipped_and_final_stages_need_the_decision_endpoint(world):
    application_id = world.apply()
    url = f"/applications/{application_id}/stage"

    assert world.client.patch(url, headers=world.manager, json={"stage": "offer"}).status_code == 409
    assert world.client.patch(url, headers=world.manager, json={"stage": "applied"}).status_code == 409
    assert world.client.patch(url, headers=world.manager, json={"stage": "hired"}).status_code == 422
    assert world.client.patch(url, headers=world.manager, json={"stage": "rejected"}).status_code == 422
    assert world.client.patch(url, headers=world.manager, json={"stage": "nonsense"}).status_code == 422

    history = world.client.get(f"/applications/{application_id}/history", headers=world.manager).json()
    assert len(history) == 1  # failed moves leave no history


def test_hiring_decision_hires_a_candidate_from_the_offer_stage(world):
    application_id = world.apply()
    for stage in ["screen", "interview", "offer"]:
        response = world.client.patch(f"/applications/{application_id}/stage", headers=world.manager, json={"stage": stage})
        assert response.status_code == 200

    decision = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "hired"}
    )
    assert decision.status_code == 200
    assert decision.json()["stage"] == "hired"

    history = world.client.get(f"/applications/{application_id}/history", headers=world.manager).json()
    assert [row["to_stage"] for row in history] == ["applied", "screen", "interview", "offer", "hired"]
    assert history[-1]["changed_by_id"] == world.manager_id

    # The process is finished: nothing can change the stage any more.
    again = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "rejected"}
    )
    assert again.status_code == 409


def test_hr_assessment_and_successful_hire_email_company_admin(world, outbox):
    application_id = world.apply()
    for stage in ["screen", "interview", "offer"]:
        response = world.client.patch(
            f"/applications/{application_id}/stage", headers=world.manager, json={"stage": stage}
        )
        assert response.status_code == 200

    outbox.clear()

    def admin_emails():
        return [message for message in outbox if message["to"] == "admin@acme.com"]

    assessment = world.client.patch(
        f"/applications/{application_id}/assessment",
        headers=world.manager,
        json={"match_score": 91, "manager_notes": "Strong final assessment"},
    )
    assert assessment.status_code == 200
    sent = admin_emails()
    assert "91/100" in sent[0]["text"]
    assert "Strong final assessment" in sent[0]["text"]

    decision = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "hired"}
    )
    assert decision.status_code == 200
    sent = admin_emails()
    assert "successful applicant has been hired" in sent[1]["text"]
    assert "91/100" in sent[1]["text"]
    assert "Strong final assessment" in sent[1]["text"]


def test_a_candidate_can_be_rejected_at_any_open_stage(world):
    application_id = world.apply()
    world.client.patch(f"/applications/{application_id}/stage", headers=world.manager, json={"stage": "screen"})

    decision = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "rejected"}
    )
    assert decision.status_code == 200
    assert decision.json()["stage"] == "rejected"


def test_a_candidate_cannot_be_hired_before_the_offer_stage(world):
    application_id = world.apply()
    response = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "hired"}
    )
    assert response.status_code == 409


def test_the_decision_must_be_hired_or_rejected(world):
    application_id = world.apply()
    response = world.client.post(
        f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "screen"}
    )
    assert response.status_code == 422


def test_interviewers_cannot_move_or_decide(world):
    application_id = world.apply()
    world.schedule(application_id, world.ann_id, world.slot(10))  # ann is assigned, and still has no right

    move = world.client.patch(f"/applications/{application_id}/stage", headers=world.ann, json={"stage": "screen"})
    decide = world.client.post(f"/applications/{application_id}/decision", headers=world.ann, json={"decision": "rejected"})
    history = world.client.get(f"/applications/{application_id}/history", headers=world.ann)
    assert (move.status_code, decide.status_code, history.status_code) == (403, 403, 403)


def test_only_a_hiring_manager_can_assess_applicants(world):
    application_id = world.apply()
    body = {"match_score": 86, "manager_notes": "Meets the core requirements"}
    assert world.client.patch(f"/applications/{application_id}/assessment", headers=world.admin, json=body).status_code == 403
    response = world.client.patch(f"/applications/{application_id}/assessment", headers=world.manager, json=body)
    assert response.status_code == 200
    assert response.json()["match_score"] == 86


def test_manager_can_sort_applicants_by_qualification_match(world):
    lower = world.apply(email="lower@gmail.com")
    higher = world.apply(email="higher@gmail.com")
    world.client.patch(f"/applications/{lower}/assessment", headers=world.manager, json={"match_score": 54})
    world.client.patch(f"/applications/{higher}/assessment", headers=world.manager, json={"match_score": 92})
    response = world.client.get("/applications?sort_by=match_score&sort_order=desc", headers=world.manager)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()[:2]] == [higher, lower]


def test_a_hiring_manager_only_sees_the_jobs_they_manage(world):
    other_manager_id, other_manager = world.add_user("manager2@acme.com", "hiring_manager")
    other_job_id = world.add_job(hiring_manager_id=other_manager_id)
    own_application = world.apply(email="one@gmail.com", job_id=world.job_id)
    other_application = world.apply(email="two@gmail.com", job_id=other_job_id)

    visible = world.client.get("/applications", headers=world.manager).json()
    assert [row["id"] for row in visible] == [own_application]
    assert world.client.get(f"/applications/{other_application}", headers=world.manager).status_code == 404
    move = world.client.patch(f"/applications/{other_application}/stage", headers=world.manager, json={"stage": "screen"})
    assert move.status_code == 404
    assert world.client.get(f"/jobs/{other_job_id}", headers=world.manager).status_code == 404
    assert [job["id"] for job in world.client.get("/jobs", headers=world.manager).json()] == [world.job_id]

    # Only hiring managers can review applicant details; each manager sees only their own job.
    assert world.client.get("/applications", headers=world.admin).json() == []
    assert [row["id"] for row in world.client.get("/applications", headers=other_manager).json()] == [other_application]


def test_simultaneous_stage_changes_keep_the_history_consistent(world):
    application_id = world.apply()
    call = ("PATCH", f"/applications/{application_id}/stage", {"headers": world.manager, "json": {"stage": "screen"}})

    responses = world.parallel(call, call, call)

    # Only one request wins. The others find the candidate already in "screen" and are refused.
    assert sorted(response.status_code for response in responses) == [200, 409, 409]
    history = world.client.get(f"/applications/{application_id}/history", headers=world.manager).json()
    assert [(row["from_stage"], row["to_stage"]) for row in history] == [(None, "applied"), ("applied", "screen")]
