def test_register_login_and_read_profile(client):
    response = client.post(
        "/auth/register",
        json={"company_name": "Acme", "full_name": "Ada Admin", "email": "Ada@Acme.com", "password": "password123"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "company_admin"
    assert response.json()["email"] == "ada@acme.com"  # emails are stored in lowercase
    assert "password" not in response.text

    login = client.post("/auth/login", data={"username": "ADA@acme.com", "password": "password123"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == "ada@acme.com"


def test_register_with_a_used_email_is_rejected(client):
    body = {"company_name": "Acme", "full_name": "Ada", "email": "ada@acme.com", "password": "password123"}
    assert client.post("/auth/register", json=body).status_code == 201
    assert client.post("/auth/register", json=body).status_code == 409


def test_login_with_wrong_password_is_rejected(client):
    body = {"company_name": "Acme", "full_name": "Ada", "email": "ada@acme.com", "password": "password123"}
    client.post("/auth/register", json=body)
    response = client.post("/auth/login", data={"username": "ada@acme.com", "password": "wrong-password"})
    assert response.status_code == 401


def test_protected_endpoints_need_a_valid_token(client):
    assert client.get("/jobs").status_code == 401
    assert client.get("/jobs", headers={"Authorization": "Bearer not-a-real-token"}).status_code == 401


def test_only_admins_invite_team_and_only_managers_create_jobs(world):
    new_user = {"email": "new@acme.com", "full_name": "New", "role": "interviewer"}
    new_job = {"title": "Designer", "description": "Design things"}

    assert world.client.post("/users", headers=world.manager, json=new_user).status_code == 403
    assert world.client.post("/users", headers=world.ann, json=new_user).status_code == 403
    assert world.client.post("/jobs", headers=world.admin, json=new_job).status_code == 403
    assert world.client.post("/jobs", headers=world.ann, json=new_job).status_code == 403

    assert world.client.post("/users", headers=world.admin, json=new_user).status_code == 201
    assert world.client.post("/jobs", headers=world.manager, json=new_job).status_code == 201


def test_invitation_is_one_time_and_creates_the_invited_role(world):
    invite = world.client.post(
        "/users",
        headers=world.admin,
        json={"email": "new@acme.com", "full_name": "New Teammate", "role": "interviewer"},
    )
    assert invite.status_code == 201
    token = invite.json()["invite_url"].split("token=", 1)[1]
    accepted = world.client.post("/auth/accept-invite", json={"token": token, "password": "password123"})
    assert accepted.status_code == 201
    assert accepted.json()["role"] == "interviewer"
    assert world.client.post("/auth/accept-invite", json={"token": token, "password": "password123"}).status_code == 410


def test_interviewers_cannot_use_manager_endpoints(world):
    assert world.client.get("/jobs", headers=world.ann).status_code == 403
    assert world.client.get("/users", headers=world.ann).status_code == 403
    application_id = world.apply()
    response = world.client.patch(f"/applications/{application_id}/stage", headers=world.ann, json={"stage": "screen"})
    assert response.status_code == 403


def test_companies_cannot_see_each_others_data(world):
    other = world.client.post(
        "/auth/register",
        json={"company_name": "Other", "full_name": "Olu", "email": "olu@other.com", "password": "password123"},
    )
    assert other.status_code == 201
    other_admin = world.login("olu@other.com")

    assert world.client.get("/jobs", headers=other_admin).json() == []
    assert world.client.get(f"/jobs/{world.job_id}", headers=other_admin).status_code == 404
    application_id = world.apply()
    assert world.client.get(f"/applications/{application_id}", headers=other_admin).status_code == 404
    other_users = world.client.get("/users", headers=other_admin).json()
    assert [user["email"] for user in other_users] == ["olu@other.com"]
