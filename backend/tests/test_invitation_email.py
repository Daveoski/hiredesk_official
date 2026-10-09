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
