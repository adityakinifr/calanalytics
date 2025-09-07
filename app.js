function promptForCredentials() {
  alert(
    'Ensure you have configured the OAuth consent screen and enabled the Calendar API in the Google Cloud Console.'
  );
  const clientId = prompt('Enter your OAuth Client ID:');
  const apiKey = prompt('Enter your API Key:');
  if (!clientId || !apiKey) {
    throw new Error('Credentials are required.');
  }
  sessionStorage.setItem('CLIENT_ID', clientId);
  sessionStorage.setItem('API_KEY', apiKey);
  return { clientId, apiKey };
}

function loadCredentials() {
  let clientId = sessionStorage.getItem('CLIENT_ID');
  let apiKey = sessionStorage.getItem('API_KEY');
  if (!clientId || !apiKey) {
    ({ clientId, apiKey } = promptForCredentials());
  }
  return { clientId, apiKey };
}

document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('refresh').disabled = true;
document.getElementById('config').addEventListener('click', () => {
  ({ clientId: CLIENT_ID, apiKey: API_KEY } = promptForCredentials());
  gapi.load('client:auth2', initClient);
});

let { clientId: CLIENT_ID, apiKey: API_KEY } = loadCredentials();

function formatError(err) {
  if (!err) return 'Unknown error';
  return (
    err.result?.error?.message ||
    err.message ||
    JSON.stringify(err)
  );
}

window.gapiLoaded = function() {
  gapi.load('client:auth2', initClient);
};

async function initClient() {
  const refreshBtn = document.getElementById('refresh');
  refreshBtn.disabled = true;
  try {
    await gapi.client.init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      discoveryDocs: [
        'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
      ],
      scope: 'https://www.googleapis.com/auth/calendar.readonly'
    });
  } catch (err) {
    console.error('gapi.client.init failed', err);
    document.getElementById('output').textContent =
      'Failed to initialize: ' + formatError(err);
  }
  refreshBtn.disabled = false;
}

function renderStats(stats) {
  const lines = [];
  lines.push('Top Attendees:');
  stats.top_attendees.forEach(([email, count]) =>
    lines.push(`  ${email}: ${count}`)
  );
  lines.push('');
  lines.push('Exec Team:');
  for (const [email, count] of Object.entries(stats.exec_team)) {
    lines.push(`  ${email}: ${count}`);
  }
  lines.push('');
  lines.push('Gartner Analysts:');
  for (const [email, count] of Object.entries(stats.gartner_analysts)) {
    lines.push(`  ${email}: ${count}`);
  }
  lines.push('');
  lines.push('Direct Reports:');
  for (const [email, count] of Object.entries(stats.direct_reports)) {
    lines.push(`  ${email}: ${count}`);
  }
  document.getElementById('output').textContent = lines.join('\n');
}

async function refresh() {
  document.getElementById('output').textContent = 'Loading...';
  try {
    await gapi.auth2.getAuthInstance().signIn();
    const stats = await getStats();
    renderStats(stats);
  } catch (err) {
    console.error('Error refreshing stats', err);
    document.getElementById('output').textContent =
      'Error: ' + formatError(err);
  }
}

async function fetchConfig() {
  const res = await fetch('config.json');
  return res.json();
}

async function fetchEvents() {
  const now = new Date();
  const timeMin = new Date(
    now.getTime() - 90 * 24 * 60 * 60 * 1000
  ).toISOString();
  let events = [];
  let pageToken;
  do {
    const res = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin,
      maxResults: 2500,
      singleEvents: true,
      orderBy: 'startTime',
      pageToken
    });
    events = events.concat(res.result.items || []);
    pageToken = res.result.nextPageToken;
  } while (pageToken);
  return events;
}

function computeStats(events, config) {
  const counter = new Map();
  for (const event of events) {
    const attendees = event.attendees || [];
    for (const att of attendees) {
      if (att.responseStatus === 'declined') continue;
      if (!att.email) continue;
      const email = att.email.toLowerCase();
      counter.set(email, (counter.get(email) || 0) + 1);
    }
  }
  const top_attendees = Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const exec_team = {};
  for (const email of config.exec_team || []) {
    if (counter.has(email)) exec_team[email] = counter.get(email);
  }
  const gartner_analysts = {};
  for (const email of config.gartner_analysts || []) {
    if (counter.has(email)) gartner_analysts[email] = counter.get(email);
  }
  const direct_reports = {};
  for (const email of config.direct_reports || []) {
    if (counter.has(email)) direct_reports[email] = counter.get(email);
  }
  return { top_attendees, exec_team, gartner_analysts, direct_reports };
}

async function getStats() {
  const [config, events] = await Promise.all([
    fetchConfig(),
    fetchEvents()
  ]);
  return computeStats(events, config);
}

