function saveCredentials(clientId, apiKey) {
  sessionStorage.setItem('CLIENT_ID', clientId);
  sessionStorage.setItem('API_KEY', apiKey);
}

function getCredentials() {
  return {
    clientId: sessionStorage.getItem('CLIENT_ID'),
    apiKey: sessionStorage.getItem('API_KEY')
  };
}

const credModal = new bootstrap.Modal(
  document.getElementById('credentialsModal')
);

document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('refresh').disabled = true;
document.getElementById('config').addEventListener('click', () => {
  document.getElementById('clientIdInput').value = CLIENT_ID || '';
  document.getElementById('apiKeyInput').value = API_KEY || '';
  document.getElementById('clientIdInput').removeAttribute('readonly');
  document.getElementById('apiKeyInput').removeAttribute('readonly');
  document.getElementById('saveCredentials').classList.remove('d-none');
  credModal.show();
});

document.getElementById('view-creds').addEventListener('click', () => {
  document.getElementById('clientIdInput').value = CLIENT_ID || '';
  document.getElementById('apiKeyInput').value = API_KEY || '';
  document.getElementById('clientIdInput').setAttribute('readonly', true);
  document.getElementById('apiKeyInput').setAttribute('readonly', true);
  document.getElementById('saveCredentials').classList.add('d-none');
  credModal.show();
});

document.getElementById('saveCredentials').addEventListener('click', () => {
  const clientId = document.getElementById('clientIdInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  if (!clientId || !apiKey) {
    alert('Both Client ID and API Key are required.');
    return;
  }
  saveCredentials(clientId, apiKey);
  ({ clientId: CLIENT_ID, apiKey: API_KEY } = getCredentials());
  credModal.hide();
  document.getElementById('view-creds').classList.remove('d-none');
  if (gapiInited) {
    gapi.load('client:auth2', initClient);
  }
});

let { clientId: CLIENT_ID, apiKey: API_KEY } = getCredentials();
if (CLIENT_ID && API_KEY) {
  document.getElementById('view-creds').classList.remove('d-none');
}

function formatError(err) {
  if (!err) return 'Unknown error';
  return (
    err.result?.error?.message ||
    err.message ||
    JSON.stringify(err)
  );
}

let gapiInited = false;
window.gapiLoaded = function() {
  gapiInited = true;
  if (CLIENT_ID && API_KEY) {
    gapi.load('client:auth2', initClient);
  }
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

