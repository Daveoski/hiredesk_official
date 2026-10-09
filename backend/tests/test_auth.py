def test_register_login_and_read_profile(client):
    response = client.post(
        "/auth/register",
        json={"company_name": "Acme", "full_name": "Ada Admin", "email": "Ada@Acme.com", "password": "password123"},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "company_admin"
    assert response.json()["email"] == "ada@acme.com"  # emails are stored in lowercase
    assert "hashed_password" not in response.text

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


def test_google_auth_can_sign_in_or_register(client, monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "google_auth_enabled", True)
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(
        "app.auth.router.google_id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: {
            "email": "google.user@acme.com",
            "email_verified": True,
            "name": "Google User",
        },
    )

    created = client.post(
        "/auth/google",
        json={"id_token": "verified-token", "company_name": "Acme", "create_company": True},
    )
    assert created.status_code == 200
    assert created.json()["token_type"] == "bearer"
    headers = {"Authorization": f"Bearer {created.json()['access_token']}"}

    profile = client.get("/auth/me", headers=headers)
    assert profile.status_code == 200, profile.text
    assert profile.json()["password_login_enabled"] is False

    linked = client.put("/auth/password", headers=headers, json={"password": "linkedpass123"})
    assert linked.status_code == 200
    assert linked.json()["password_login_enabled"] is True

    email_login = client.post("/auth/login", data={"username": "google.user@acme.com", "password": "linkedpass123"})
    assert email_login.status_code == 200

    existing = client.post(
        "/auth/google",
        json={"id_token": "verified-token", "company_name": "Acme"},
    )
    assert existing.status_code == 200

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {existing.json()['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "google.user@acme.com"


def fake_google(monkeypatch, email: str):
    """Enable Google sign-in and make every ID token verify as this email."""
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "google_auth_enabled", True)
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(
        "app.auth.router.google_id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: {"email": email, "email_verified": True, "name": "Someone"},
    )


def test_google_sign_in_from_login_page_does_not_create_a_company(client, monkeypatch):
    fake_google(monkeypatch, "stranger@acme.com")
    response = client.post("/auth/google", json={"id_token": "verified-token"})
    assert response.status_code == 404
    assert client.post("/auth/login", data={"username": "stranger@acme.com", "password": "x"}).status_code == 401


def test_existing_admin_and_hiring_manager_sign_in_with_google(world, monkeypatch):
    for email, role in [("admin@acme.com", "company_admin"), ("manager@acme.com", "hiring_manager")]:
        fake_google(monkeypatch, email)
        response = world.client.post("/auth/google", json={"id_token": "verified-token"})
        assert response.status_code == 200, response.text
        me = world.client.get("/auth/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"})
        assert me.json()["role"] == role
        # Signing in with Google never disables an existing password.
        assert me.json()["password_login_enabled"] is True


def test_invited_hiring_manager_joins_the_company_with_google(world, monkeypatch):
    invite = world.client.post(
        "/users",
        headers=world.admin,
        json={"email": "hm@acme.com", "full_name": "Hana Manager", "role": "hiring_manager"},
    )
    assert invite.status_code == 201
    invite_token = invite.json()["invite_url"].split("token=", 1)[1]

    fake_google(monkeypatch, "someone.else@gmail.com")
    wrong_account = world.client.post("/auth/google", json={"id_token": "t", "invite_token": invite_token})
    assert wrong_account.status_code == 403
    assert "hm@acme.com" in wrong_account.json()["detail"]

    fake_google(monkeypatch, "hm@acme.com")
    response = world.client.post("/auth/google", json={"id_token": "t", "invite_token": invite_token})
    assert response.status_code == 200, response.text
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    me = world.client.get("/auth/me", headers=headers).json()
    admin = world.client.get("/auth/me", headers=world.admin).json()
    assert me["role"] == "hiring_manager"
    assert me["full_name"] == "Hana Manager"
    assert me["company_id"] == admin["company_id"]
    assert world.client.get("/jobs", headers=headers).status_code == 200

    # The invitation is used up, and the next Google sign-in finds the same user.
    assert world.client.post("/auth/accept-invite", json={"token": invite_token, "password": "password123"}).status_code == 410
    again = world.client.post("/auth/google", json={"id_token": "t"})
    assert world.client.get("/auth/me", headers={"Authorization": f"Bearer {again.json()['access_token']}"}).json()["id"] == me["id"]


def test_google_auth_requires_configuration(client, monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "google_auth_enabled", False)
    monkeypatch.setattr(settings, "google_client_id", "")

    response = client.post("/auth/google", json={"id_token": "any-token"})
    assert response.status_code == 503


def test_google_auth_rejects_unverified_email(client, monkeypatch):
    from app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "google_auth_enabled", True)
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(
        "app.auth.router.google_id_token.verify_oauth2_token",
        lambda *_args, **_kwargs: {"email": "unverified@example.com", "email_verified": False},
    )

    response = client.post("/auth/google", json={"id_token": "verified-token"})
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
