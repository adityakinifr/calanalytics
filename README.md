# Calendar Analytics Web App
# test

This repository provides a standalone web application that analyzes your Google
Calendar and produces statistics on the most frequent meetings. It can
highlight meetings with specific groups such as executive team members,
Gartner analysts, or direct reports.

## Setup

1. In the Google Cloud Console create a project and enable the **Google
   Calendar API**.
2. Under **APIs & Services → Credentials**:
   - Configure an OAuth consent screen. When prompted for scopes, add
     `https://www.googleapis.com/auth/calendar.readonly` so the app can read
     your calendar events.
   - Create an OAuth client ID for a Web application. Add
     `http://localhost:8080` as an authorized JavaScript origin. Note the
     generated client ID and client secret.
3. When you first launch the app you will be prompted in the browser to enter
   your OAuth client ID and client secret. The app stores these in
   `sessionStorage` so you only need to provide them once per session.
4. Click **Configure Stakeholders** in the app to set email addresses for the
   executive team, Gartner analysts, and direct reports. These values are saved
   in `localStorage` and override the defaults in `config.json`.
5. Optionally edit `config.json` to specify default emails for key groups:

```json
{
  "exec_team": ["ceo@example.com", "cfo@example.com"],
  "gartner_analysts": ["analyst@example.com"],
  "direct_reports": ["report1@example.com"]
}
```

## Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start a local server:

   ```bash
   npm start
   ```

3. Navigate to <http://localhost:8080> in your browser and click **Refresh
   Stats**.

The application uses your existing Google account session and runs entirely in
the browser; no server-side component is required.

