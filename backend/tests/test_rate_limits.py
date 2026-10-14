import pytest

from app.core.config import get_settings


@pytest.fixture
def limits_on(monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_enabled", True)


def register(client, email="ada@acme.com"):
    body = {"company_name": "Acme", "full_name": "Ada", "email": email, "password": "password123"}
    assert client.post("/auth/register", json=body).status_code == 201


def test_password_guessing_on_one_account_is_stopped(client, limits_on):
    register(client)
    for _ in range(10):
        response = client.post("/auth/login", data={"username": "ada@acme.com", "password": "wrong-password"})
        assert response.status_code == 401

    # Even the right password is refused until the window ends, or guessing would still work.
    blocked = client.post("/auth/login", data={"username": "ADA@acme.com", "password": "password123"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) > 0

    # Other accounts are not locked out by it.
    register(client, "bob@acme.com")
    assert client.post("/auth/login", data={"username": "bob@acme.com", "password": "password123"}).status_code == 200


def test_many_logins_from_one_ip_are_stopped(client, limits_on):
    for number in range(12):
        response = client.post("/auth/login", data={"username": f"user{number}@acme.com", "password": "x"})
        assert response.status_code == 401
    assert client.post("/auth/login", data={"username": "new@acme.com", "password": "x"}).status_code == 429


def test_registrations_from_one_ip_are_limited(client, limits_on):
    for number in range(5):
        register(client, f"admin{number}@acme.com")
    body = {"company_name": "Acme", "full_name": "Ada", "email": "admin9@acme.com", "password": "password123"}
    assert client.post("/auth/register", json=body).status_code == 429


def test_public_applications_from_one_ip_are_limited(world, limits_on):
    for number in range(10):
        world.apply(email=f"candidate{number}@gmail.com")
    response = world.client.post(
        f"/public/jobs/{world.job_id}/applications",
        data={"full_name": "Cathy Candidate", "email": "late@gmail.com", "phone": "+2348012345678"},
        files={"cv": ("cv.pdf", b"%PDF-1.4 fake cv", "application/pdf")},
    )
    assert response.status_code == 429


def test_limits_can_be_turned_off(client):
    register(client)
    for _ in range(15):
        client.post("/auth/login", data={"username": "ada@acme.com", "password": "wrong-password"})
    assert client.post("/auth/login", data={"username": "ada@acme.com", "password": "password123"}).status_code == 200


def test_client_ip_comes_from_vercel_header_only_on_vercel(client, limits_on, monkeypatch):
    """Off Vercel, a client could write any x-forwarded-for, so it must not get a fresh limit by changing it."""
    for number in range(12):
        client.post("/auth/login", data={"username": f"u{number}@acme.com", "password": "x"}, headers={"x-forwarded-for": f"10.0.0.{number}"})
    assert client.post("/auth/login", data={"username": "z@acme.com", "password": "x"}).status_code == 429

    monkeypatch.setattr(get_settings(), "vercel", True)
    response = client.post("/auth/login", data={"username": "z@acme.com", "password": "x"}, headers={"x-forwarded-for": "203.0.113.7, 10.0.0.1"})
    assert response.status_code == 401
