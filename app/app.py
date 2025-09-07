from __future__ import annotations
import os
import datetime as dt
from collections import Counter
from pathlib import Path
from typing import Dict, List

from flask import Flask, redirect, url_for, session, request, jsonify
from flask import render_template_string
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

# Scopes required for reading calendar events
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

app = Flask(__name__)
# In production use a random secret key. For development it is fine to use a
# hardcoded one.
app.secret_key = "replace-with-a-secure-secret-key"

CONFIG_PATH = Path("config.json")
TOKEN_PATH = Path("token.json")
CREDENTIALS_PATH = Path("credentials.json")


@app.route("/")
def index():
    """Home page with links to authorize and view stats."""
    if not TOKEN_PATH.exists():
        return render_template_string(
            """
            <h2>Calendar Analytics</h2>
            <p><a href='{{url_for("authorize")}}'>Authorize Google Calendar</a></p>
            """
        )
    return render_template_string(
        """
        <h2>Calendar Analytics</h2>
        <p><a href='{{url_for("stats")}}'>View meeting statistics</a></p>
        """
    )


@app.route("/authorize")
def authorize():
    """Start OAuth flow to authorize Google Calendar access."""
    flow = Flow.from_client_secrets_file(
        str(CREDENTIALS_PATH), scopes=SCOPES, redirect_uri=url_for("oauth2callback", _external=True)
    )
    authorization_url, state = flow.authorization_url(access_type="offline", include_granted_scopes="true")
    session["state"] = state
    return redirect(authorization_url)


@app.route("/oauth2callback")
def oauth2callback():
    """OAuth callback to fetch and store credentials."""
    state = session.get("state")
    flow = Flow.from_client_secrets_file(
        str(CREDENTIALS_PATH), scopes=SCOPES, state=state, redirect_uri=url_for("oauth2callback", _external=True)
    )
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    with open(TOKEN_PATH, "w") as token:
        token.write(creds.to_json())
    return redirect(url_for("index"))


@app.route("/stats")
def stats():
    """Compute simple meeting statistics for the past 90 days."""
    creds = _load_credentials()
    service = build("calendar", "v3", credentials=creds)

    now = dt.datetime.utcnow()
    time_min = (now - dt.timedelta(days=90)).isoformat() + "Z"  # 'Z' indicates UTC time

    events_result = (
        service.events()
        .list(calendarId="primary", timeMin=time_min, maxResults=2500, singleEvents=True, orderBy="startTime")
        .execute()
    )
    events = events_result.get("items", [])

    attendee_counter: Counter[str] = Counter()
    for event in events:
        for attendee in event.get("attendees", []):
            if attendee.get("responseStatus") == "declined":
                continue
            email = attendee.get("email")
            if email:
                attendee_counter[email.lower()] += 1

    # Load categories from config
    config = _load_config()
    exec_team = set(config.get("exec_team", []))
    analysts = set(config.get("gartner_analysts", []))
    directs = set(config.get("direct_reports", []))

    stats_data = {
        "top_attendees": attendee_counter.most_common(10),
        "exec_team": {e: attendee_counter[e] for e in exec_team if e in attendee_counter},
        "gartner_analysts": {e: attendee_counter[e] for e in analysts if e in attendee_counter},
        "direct_reports": {e: attendee_counter[e] for e in directs if e in attendee_counter},
    }
    return jsonify(stats_data)


def _load_credentials() -> Credentials:
    if not TOKEN_PATH.exists():
        raise RuntimeError("No token found. Please authorize first.")
    return Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)


def _load_config() -> Dict[str, List[str]]:
    if CONFIG_PATH.exists():
        import json

        with open(CONFIG_PATH) as f:
            return json.load(f)
    return {}


if __name__ == "__main__":
    app.run(debug=True)
