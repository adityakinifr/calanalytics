# Calendar Analytics Chrome Extension

This repository provides a Chrome extension that analyzes your Google Calendar and
produces statistics on the most frequent meetings. It can highlight meetings with
specific groups such as executive team members, Gartner analysts, or direct reports.

## Setup

1. In the Google Cloud Console create a project and enable the **Google Calendar API**.
2. Create OAuth credentials for a Chrome extension and copy the client ID.
3. Edit `manifest.json` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your
   own client ID.
4. Optionally edit `config.json` to specify emails for key groups:

```json
{
  "exec_team": ["ceo@example.com", "cfo@example.com"],
  "gartner_analysts": ["analyst@example.com"],
  "direct_reports": ["report1@example.com"]
}
```

5. Load the extension in Chrome:
   - Open `chrome://extensions`.
   - Enable **Developer mode**.
   - Click **Load unpacked** and select this folder.

## Usage

1. Navigate to [Google Calendar](https://calendar.google.com) and ensure you are signed in.
2. Click the extension icon and press **Refresh Stats**.
3. The popup will display the top attendees from the last 90 days along with counts for the
   configured groups.

The extension uses the existing Google account session; no server-side component is
required.
