def test_manager_schedules_an_interview(world):
    application_id = world.apply()
    response = world.schedule(application_id, world.ann_id, world.slot(10), minutes=45)

    assert response.status_code == 200
    interview = response.json()
    assert interview["status"] == "scheduled"
    assert interview["duration_minutes"] == 45
    assert interview["interviewer_id"] == world.ann_id

    listed = world.client.get("/interviews", headers=world.manager).json()
    assert [row["id"] for row in listed] == [interview["id"]]


def test_assignment_has_no_date_until_the_interviewer_schedules(world):
    application_id = world.apply()
    assigned = world.client.post(
        "/interviews",
        headers=world.manager,
        json={"application_id": application_id, "interviewer_id": world.ann_id},
    )
    assert assigned.status_code == 201
    assert assigned.json()["status"] == "assigned"
    assert assigned.json()["starts_at"] is None

    scheduled = world.client.patch(
        f"/interviews/{assigned.json()['id']}/schedule",
        headers=world.ann,
        json={
            "starts_at": world.slot(10).isoformat(),
            "duration_minutes": 45,
            "meeting_type": "in_person",
            "location": "HireDesk office, meeting room 2",
        },
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["meeting_type"] == "in_person"
    assert scheduled.json()["location"] == "HireDesk office, meeting room 2"


def test_overlapping_interviews_for_the_same_interviewer_are_rejected(world):
    first_application = world.apply(email="one@gmail.com")
    second_application = world.apply(email="two@gmail.com")
    assert world.schedule(first_application, world.ann_id, world.slot(10), minutes=60).status_code == 200  # 10:00-11:00

    # Overlaps at the end, at the start, and fully inside the first interview.
    assert world.schedule(second_application, world.ann_id, world.slot(10, 30), minutes=60).status_code == 409
    assert world.schedule(second_application, world.ann_id, world.slot(9, 30), minutes=60).status_code == 409
    assert world.schedule(second_application, world.ann_id, world.slot(10, 15), minutes=15).status_code == 409


def test_back_to_back_interviews_and_other_interviewers_are_allowed(world):
    first_application = world.apply(email="one@gmail.com")
    second_application = world.apply(email="two@gmail.com")
    assert world.schedule(first_application, world.ann_id, world.slot(10), minutes=60).status_code == 200

    back_to_back = world.schedule(second_application, world.ann_id, world.slot(11), minutes=60)  # 11:00-12:00
    other_interviewer = world.schedule(second_application, world.bob_id, world.slot(10), minutes=60)
    assert back_to_back.status_code == 200
    assert other_interviewer.status_code == 200


def test_cancelling_an_interview_frees_the_time_slot(world):
    first_application = world.apply(email="one@gmail.com")
    second_application = world.apply(email="two@gmail.com")
    first = world.schedule(first_application, world.ann_id, world.slot(10)).json()

    cancelled = world.client.post(f"/interviews/{first['id']}/cancel", headers=world.manager)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert world.client.post(f"/interviews/{first['id']}/cancel", headers=world.manager).status_code == 409

    assert world.schedule(second_application, world.ann_id, world.slot(10)).status_code == 200


def test_simultaneous_requests_cannot_double_book_an_interviewer(world):
    first_application = world.apply(email="one@gmail.com")
    second_application = world.apply(email="two@gmail.com")
    interview_ids = []
    for application_id in (first_application, second_application):
        assigned = world.client.post(
            "/interviews",
            headers=world.manager,
            json={"application_id": application_id, "interviewer_id": world.ann_id},
        )
        assert assigned.status_code == 201
        interview_ids.append(assigned.json()["id"])

    def request(interview_id):
        body = {
            "starts_at": world.slot(14).isoformat(),
            "duration_minutes": 60,
            "meeting_type": "virtual",
            "meeting_url": "https://meet.google.com/test-room",
        }
        return ("PATCH", f"/interviews/{interview_id}/schedule", {"headers": world.ann, "json": body})

    responses = world.parallel(*(request(interview_id) for interview_id in interview_ids))

    assert sorted(response.status_code for response in responses) == [200, 409]
    booked = world.client.get("/interviews", headers=world.manager).json()
    assert len(booked) == 2
    assert sum(item["status"] == "scheduled" for item in booked) == 1


def test_invalid_interviews_are_rejected(world):
    application_id = world.apply()
    in_the_past = world.slot(10).replace(year=2020)
    assert world.schedule(application_id, world.ann_id, in_the_past).status_code == 422
    assert world.schedule(application_id, world.ann_id, world.slot(10), minutes=5).status_code == 422

    assigned = world.client.post(
        "/interviews", headers=world.manager, json={"application_id": application_id, "interviewer_id": world.ann_id}
    ).json()
    no_timezone = world.client.patch(
        f"/interviews/{assigned['id']}/schedule",
        headers=world.ann,
        json={"starts_at": "2099-01-01T10:00:00", "duration_minutes": 60, "meeting_type": "virtual", "meeting_url": "https://meet.google.com/test"},
    )
    assert no_timezone.status_code == 422

    # Only users with the interviewer role can be assigned.
    assert world.schedule(application_id, world.manager_id, world.slot(10)).status_code == 422


def test_cannot_schedule_for_a_finished_hiring_process(world):
    application_id = world.apply()
    world.client.post(f"/applications/{application_id}/decision", headers=world.manager, json={"decision": "rejected"})
    assert world.schedule(application_id, world.ann_id, world.slot(10)).status_code == 409


def test_interviewers_see_only_their_assigned_candidates_and_interviews(world):
    ann_application = world.apply(email="one@gmail.com")
    other_application = world.apply(email="two@gmail.com")
    interview = world.schedule(ann_application, world.ann_id, world.slot(10)).json()
    world.schedule(other_application, world.bob_id, world.slot(10))

    # Ann sees her own interview and candidate, and nothing else.
    ann_interviews = world.client.get("/interviews", headers=world.ann).json()
    assert [row["id"] for row in ann_interviews] == [interview["id"]]
    ann_applications = world.client.get("/applications", headers=world.ann).json()
    assert [row["id"] for row in ann_applications] == [ann_application]
    assert world.client.get(f"/applications/{ann_application}", headers=world.ann).status_code == 200
    assert world.client.get(f"/applications/{other_application}", headers=world.ann).status_code == 404

    # Bob cannot open Ann's interview or candidate.
    assert world.client.get(f"/interviews/{interview['id']}", headers=world.bob).status_code == 404
    assert world.client.get(f"/applications/{ann_application}", headers=world.bob).status_code == 404


def test_interviewers_cannot_schedule_or_cancel_interviews(world):
    application_id = world.apply()
    interview = world.schedule(application_id, world.ann_id, world.slot(10)).json()

    assert world.schedule(application_id, world.ann_id, world.slot(12), headers=world.ann).status_code == 403
    assert world.client.post(f"/interviews/{interview['id']}/cancel", headers=world.ann).status_code == 403


def test_a_cancelled_interview_is_hidden_from_the_interviewer(world):
    application_id = world.apply()
    interview = world.schedule(application_id, world.ann_id, world.slot(10)).json()
    world.client.post(f"/interviews/{interview['id']}/cancel", headers=world.manager)

    assert world.client.get("/interviews", headers=world.ann).json() == []
    assert world.client.get(f"/applications/{application_id}", headers=world.ann).status_code == 404
