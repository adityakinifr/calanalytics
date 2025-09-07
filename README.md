# Calendar Analytics

This project provides a small Flask web application that analyzes a Google Calendar and
produces statistics on the most frequent meetings. It can highlight meetings with
specific groups such as executive team members, Gartner analysts, or direct reports.

## Setup

1. Create a Google Cloud project and enable the **Google Calendar API**.
2. Create OAuth credentials and download the `credentials.json` file into the project
   root.
3. Optionally create a `config.json` file to specify emails for key groups:

```json
{
  "exec_team": ["ceo@example.com", "cfo@example.com"],
  "gartner_analysts": ["analyst@example.com"],
  "direct_reports": ["report1@example.com"]
}
```

4. Install dependencies and run the web app:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app/app.py
```

5. Open `http://localhost:5000` in your browser. Authorize access to your calendar and
   then view the meeting statistics.

The statistics are computed for the last 90 days and return the top attendees along with
counts for the configured groups.

## Notes

The application stores OAuth tokens locally in `token.json`. Remove this file if you
want to trigger the authorization flow again.
