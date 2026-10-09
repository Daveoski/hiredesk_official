"""Invited hiring managers and interviewers receive a real link by email, and the admin learns if it failed."""
from app.core.config import get_settings


def invite(world, email="hana@acme.com", role="hiring_manager"):
    return world.client.post("/users", headers=world.admin, json={"email": email, "full_name": "Hana <Manager>", "role": role})


def test_invitation_email_contains_the_working_link(world, outbox):
    outbox.clear()
    response = invite(world)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email_sent"] is True

    message = outbox[-1]
    assert message["to"] == "hana@acme.com"
    assert message["subject"] == "Ada Admin invited you to join Acme on HireDesk"
    assert body["invite_url"] in message["text"]
    assert "hiring manager" in message["text"]
    # The HTML version has a button with the same link, and escapes names.
    assert f'href="{body["invite_url"]}"' in message["html"]
    assert "Join the team" in message["html"]
    assert "Hana &lt;Manager&gt;" in message["html"]

    # The emailed link really works.
    token = body["invite_url"].split("token=", 1)[1]
    accepted = world.client.post("/auth/accept-invite", json={"token": token, "password": "password123"})
    assert accepted.status_code == 201
    assert accepted.json()["role"] == "hiring_manager"


def test_admin_is_told_when_the_invitation_email_fails(world, monkeypatch):
    monkeypatch.setattr("app.users.router.send_email", lambda **message: False)
    response = invite(world, role="interviewer")
    assert response.status_code == 201
    assert response.json()["email_sent"] is False
    assert "accept-invite?token=" in response.json()["invite_url"]  # the admin can still share it


def token_of(invitation: dict) -> str:
    return invitation["invite_url"].split("token=", 1)[1]


def test_admin_lists_resends_and_revokes_pending_invitations(world, outbox):
    first = invite(world).json()
    invite(world, email="ivan@acme.com", role="interviewer")

    pending = world.client.get("/users/invitations", headers=world.admin)
    assert pending.status_code == 200
    assert [item["email"] for item in pending.json()] == ["ivan@acme.com", "hana@acme.com"]
    assert "token" not in pending.text  # links can't be recovered from the list

    # Inviting the same person again points the admin to "resend".
    again = invite(world)
    assert again.status_code == 409 and "Resend" in again.json()["detail"]

    # Resending emails a fresh link; the old link stops working.
    outbox.clear()
    resent = world.client.post(f"/users/invitations/{first['id']}/resend", headers=world.admin)
    assert resent.status_code == 200
    assert resent.json()["email_sent"] is True
    assert resent.json()["invite_url"] != first["invite_url"]
    assert outbox[-1]["to"] == "hana@acme.com"
    assert world.client.post("/auth/accept-invite", json={"token": token_of(first), "password": "password123"}).status_code == 410
    accepted = world.client.post("/auth/accept-invite", json={"token": token_of(resent.json()), "password": "password123"})
    assert accepted.status_code == 201

    # Revoking withdraws the link.
    ivan = next(item for item in world.client.get("/users/invitations", headers=world.admin).json())
    assert world.client.delete(f"/users/invitations/{ivan['id']}", headers=world.admin).status_code == 204
    assert world.client.get("/users/invitations", headers=world.admin).json() == []
    assert world.client.delete(f"/users/invitations/{ivan['id']}", headers=world.admin).status_code == 404


def test_only_the_company_admin_manages_invitations(world):
    invitation = invite(world).json()
    for headers in (world.manager, world.ann):
        assert world.client.get("/users/invitations", headers=headers).status_code == 403
        assert world.client.post(f"/users/invitations/{invitation['id']}/resend", headers=headers).status_code == 403

    other = world.client.post(
        "/auth/register",
        json={"company_name": "Other", "full_name": "Olu", "email": "olu@other.com", "password": "password123"},
    )
    assert other.status_code == 201
    other_admin = world.login("olu@other.com")
    assert world.client.get("/users/invitations", headers=other_admin).json() == []
    assert world.client.delete(f"/users/invitations/{invitation['id']}", headers=other_admin).status_code == 404


def test_an_expired_invitation_can_be_sent_again(world):
    from sqlalchemy import text

    from app.db.session import engine

    invitation = invite(world).json()
    with engine.begin() as connection:
        connection.execute(text("UPDATE invitations SET expires_at = now() - interval '1 day'"))

    again = invite(world)
    assert again.status_code == 201
    assert again.json()["id"] == invitation["id"]  # the same row, not a duplicate
    assert len(world.client.get("/users/invitations", headers=world.admin).json()) == 1


def test_smtp_is_used_when_configured(monkeypatch):
    from app.core import email

    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent.append(("connect", host, port))

        def starttls(self):
            sent.append(("starttls",))

        def login(self, username, password):
            sent.append(("login", username, password))

        def send_message(self, message):
            sent.append(("send", message["From"], message["To"], message["Subject"], message.is_multipart()))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "team@gmail.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    monkeypatch.setattr(settings, "email_from", "HireDesk <onboarding@resend.dev>")
    monkeypatch.setattr(email.smtplib, "SMTP", FakeSMTP)

    assert email.send_email(to="new@acme.com", subject="Hi", text="Plain", html="<p>Rich</p>") is True
    assert sent == [
        ("connect", "smtp.gmail.com", 587),
        ("starttls",),
        ("login", "team@gmail.com", "app-password"),
        # Gmail sends as the signed-in account, so that address replaces the configured one.
        ("send", "HireDesk <team@gmail.com>", "new@acme.com", "Hi", True),
    ]


def test_send_email_reports_failure_instead_of_raising(monkeypatch):
    from app.core import email

    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "resend_api_key", "re_test")

    def reject(payload):
        raise RuntimeError("You can only send testing emails to your own email address")

    monkeypatch.setattr(email.resend.Emails, "send", reject)
    assert email.send_email(to="someone@else.com", subject="Hi", text="Plain") is False
