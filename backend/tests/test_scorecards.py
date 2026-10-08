def scorecard(*ratings: tuple[str, int]) -> dict:
    return {
        "recommendation": "maybe",
        "ratings": [{"criterion": name, "rating": rating, "comment": None} for name, rating in ratings],
    }


def scorecards_visible_to(world, headers, application_id):
    response = world.client.get(f"/applications/{application_id}/scorecards", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def two_interviews(world):
    """One candidate interviewed by Ann (10:00) and Bob (12:00). Returns the ids."""
    application_id = world.apply()
    ann_interview = world.schedule(application_id, world.ann_id, world.slot(10)).json()["id"]
    bob_interview = world.schedule(application_id, world.bob_id, world.slot(12)).json()["id"]
    return application_id, ann_interview, bob_interview


def test_interviewer_submits_a_scorecard(world):
    application_id, ann_interview, _ = two_interviews(world)

    response = world.client.put(
        f"/interviews/{ann_interview}/scorecard",
        headers=world.ann,
        json={"ratings": [
            {"criterion": "Technical skills", "rating": 5, "comment": "Very strong"},
            {"criterion": "Communication", "rating": 3, "comment": None},
        ]},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "submitted"
    assert response.json()["average_score"] == 4.0
    interview = world.client.get(f"/interviews/{ann_interview}", headers=world.manager).json()
    assert interview["status"] == "completed"


def test_invalid_scorecards_are_rejected(world):
    _, ann_interview, _ = two_interviews(world)
    url = f"/interviews/{ann_interview}/scorecard"

    assert world.client.put(url, headers=world.ann, json=scorecard(("Skills", 6))).status_code == 422
    assert world.client.put(url, headers=world.ann, json=scorecard(("Skills", 0))).status_code == 422
    assert world.client.put(url, headers=world.ann, json={"ratings": []}).status_code == 422
    duplicate = scorecard(("Skills", 4), ("skills", 5))
    assert world.client.put(url, headers=world.ann, json=duplicate).status_code == 422


def test_a_scorecard_cannot_be_submitted_twice(world):
    _, ann_interview, _ = two_interviews(world)
    url = f"/interviews/{ann_interview}/scorecard"

    assert world.client.put(url, headers=world.ann, json=scorecard(("Skills", 4))).status_code == 200
    assert world.client.put(url, headers=world.ann, json=scorecard(("Skills", 1))).status_code == 409


def test_an_interviewer_cannot_submit_another_interviewers_scorecard(world):
    _, ann_interview, _ = two_interviews(world)
    response = world.client.put(
        f"/interviews/{ann_interview}/scorecard", headers=world.bob, json=scorecard(("Skills", 1))
    )
    assert response.status_code == 404


def test_managers_cannot_submit_scorecards(world):
    _, ann_interview, _ = two_interviews(world)
    response = world.client.put(
        f"/interviews/{ann_interview}/scorecard", headers=world.manager, json=scorecard(("Skills", 5))
    )
    assert response.status_code == 403


def test_scorecard_privacy_hides_others_until_you_submit_your_own(world):
    application_id, ann_interview, bob_interview = two_interviews(world)

    # Before anyone submits, each interviewer sees only their own empty scorecard.
    ann_view = scorecards_visible_to(world, world.ann, application_id)
    assert [card["interviewer_id"] for card in ann_view["scorecards"]] == [world.ann_id]
    assert ann_view["scorecards"][0]["status"] == "pending"

    # Ann submits. Bob has not, so Bob still cannot see Ann's scorecard.
    world.client.put(f"/interviews/{ann_interview}/scorecard", headers=world.ann, json=scorecard(("Skills", 5)))
    bob_view = scorecards_visible_to(world, world.bob, application_id)
    assert [card["interviewer_id"] for card in bob_view["scorecards"]] == [world.bob_id]
    assert "Skills" not in str(bob_view)

    # Ann has submitted hers, but Bob's is still pending, so there is nothing more for Ann to see.
    ann_view = scorecards_visible_to(world, world.ann, application_id)
    assert [card["interviewer_id"] for card in ann_view["scorecards"]] == [world.ann_id]

    # Once Bob submits his own, both interviewers see both scorecards.
    world.client.put(f"/interviews/{bob_interview}/scorecard", headers=world.bob, json=scorecard(("Skills", 2)))
    for headers in (world.ann, world.bob):
        view = scorecards_visible_to(world, headers, application_id)
        assert sorted(card["interviewer_id"] for card in view["scorecards"]) == sorted([world.ann_id, world.bob_id])


def test_interviewers_never_get_the_aggregate_score(world):
    application_id, ann_interview, bob_interview = two_interviews(world)
    world.client.put(f"/interviews/{ann_interview}/scorecard", headers=world.ann, json=scorecard(("Skills", 5)))
    world.client.put(f"/interviews/{bob_interview}/scorecard", headers=world.bob, json=scorecard(("Skills", 1)))

    assert scorecards_visible_to(world, world.ann, application_id)["aggregate_score"] is None


def test_manager_sees_all_scorecards_and_the_aggregate_score(world):
    application_id, ann_interview, bob_interview = two_interviews(world)

    # Nobody has submitted yet: the manager sees two pending scorecards and no score.
    before = scorecards_visible_to(world, world.manager, application_id)
    assert [card["status"] for card in before["scorecards"]] == ["pending", "pending"]
    assert before["aggregate_score"] is None

    # Ann averages (5 + 3) / 2 = 4.0 and Bob averages 2.0, so the aggregate is (4.0 + 2.0) / 2 = 3.0.
    world.client.put(
        f"/interviews/{ann_interview}/scorecard", headers=world.ann, json=scorecard(("Skills", 5), ("Culture", 3))
    )
    world.client.put(f"/interviews/{bob_interview}/scorecard", headers=world.bob, json=scorecard(("Skills", 2)))

    after = scorecards_visible_to(world, world.manager, application_id)
    assert len(after["scorecards"]) == 2
    assert after["aggregate_score"] == 3.0


def test_an_unassigned_interviewer_cannot_read_scorecards(world):
    application_id, _, _ = two_interviews(world)
    _, carol = world.add_user("carol@acme.com", "interviewer")
    response = world.client.get(f"/applications/{application_id}/scorecards", headers=carol)
    assert response.status_code == 404


def test_a_cancelled_interview_cannot_receive_a_scorecard(world):
    _, ann_interview, _ = two_interviews(world)
    world.client.post(f"/interviews/{ann_interview}/cancel", headers=world.manager)
    response = world.client.put(
        f"/interviews/{ann_interview}/scorecard", headers=world.ann, json=scorecard(("Skills", 4))
    )
    assert response.status_code == 404
