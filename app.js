function saveCredentials(clientId, clientSecret) {
  sessionStorage.setItem('CLIENT_ID', clientId);
  sessionStorage.setItem('CLIENT_SECRET', clientSecret);
}

function getCredentials() {
  return {
    clientId: sessionStorage.getItem('CLIENT_ID'),
    clientSecret: sessionStorage.getItem('CLIENT_SECRET')
  };
}

function saveStakeholderConfig(config) {
  localStorage.setItem('STAKEHOLDERS_CONFIG', JSON.stringify(config));
}

function getStakeholderConfig() {
  const raw = localStorage.getItem('STAKEHOLDERS_CONFIG');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function parseEmails(text) {
  return text
    .split(/[\s,]+/)
    .map(e => e.trim().toLowerCase())
    .filter(e => e);
}

const credModal = new bootstrap.Modal(
  document.getElementById('credentialsModal')
);
const stakeholderModal = new bootstrap.Modal(
  document.getElementById('stakeholdersModal')
);

document.getElementById('refresh').addEventListener('click', refresh);
document.getElementById('refresh').disabled = true;
document.getElementById('config').addEventListener('click', () => {
  document.getElementById('clientIdInput').value = CLIENT_ID || '';
  document.getElementById('clientSecretInput').value = CLIENT_SECRET || '';
  document.getElementById('clientIdInput').removeAttribute('readonly');
  document.getElementById('clientSecretInput').removeAttribute('readonly');
  document.getElementById('saveCredentials').classList.remove('d-none');
  credModal.show();
});

document.getElementById('configStakeholders').addEventListener('click', async () => {
  const cfg = await fetchConfig();
  document.getElementById('execTeamInput').value = (cfg.exec_team || []).join(', ');
  document.getElementById('gartnerInput').value = (cfg.gartner_analysts || []).join(', ');
  document.getElementById('directReportsInput').value = (cfg.direct_reports || []).join(', ');
  stakeholderModal.show();
});

document.getElementById('saveStakeholders').addEventListener('click', () => {
  const config = {
    exec_team: parseEmails(document.getElementById('execTeamInput').value),
    gartner_analysts: parseEmails(document.getElementById('gartnerInput').value),
    direct_reports: parseEmails(
      document.getElementById('directReportsInput').value
    )
  };
  saveStakeholderConfig(config);
  stakeholderModal.hide();
});

document.getElementById('view-creds').addEventListener('click', () => {
  document.getElementById('clientIdInput').value = CLIENT_ID || '';
  document.getElementById('clientSecretInput').value = CLIENT_SECRET || '';
  document
    .getElementById('clientIdInput')
    .setAttribute('readonly', true);
  document
    .getElementById('clientSecretInput')
    .setAttribute('readonly', true);
  document.getElementById('saveCredentials').classList.add('d-none');
  credModal.show();
});

document.getElementById('saveCredentials').addEventListener('click', () => {
  const clientId = document.getElementById('clientIdInput').value.trim();
  const clientSecret = document.getElementById('clientSecretInput').value.trim();
  if (!clientId || !clientSecret) {
    alert('Client ID and Client Secret are required.');
    return;
  }
  saveCredentials(clientId, clientSecret);
  ({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } = getCredentials());
  credModal.hide();
  document.getElementById('view-creds').classList.remove('d-none');
  if (gisInited) {
    initTokenClient();
  }
});

let { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET } = getCredentials();
if (CLIENT_ID && CLIENT_SECRET) {
  document.getElementById('view-creds').classList.remove('d-none');
  if (gisInited) {
    initTokenClient();
  }
}

function formatError(err) {
  if (!err) return 'Unknown error';
  return (
    err.result?.error?.message ||
    err.message ||
    JSON.stringify(err)
  );
}

let tokenClient;
let gapiInited = false;
let gisInited = false;

window.gapiLoaded = function() {
  gapi.load('client', initializeGapiClient);
};

async function initializeGapiClient() {
  try {
    await gapi.client.init({
      discoveryDocs: [
        'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
      ]
    });
    gapiInited = true;
    maybeEnableRefresh();
  } catch (err) {
    console.error('gapi.client.init failed', err);
    document.getElementById('output').textContent =
      'Failed to initialize: ' + formatError(err);
  }
}

window.gisLoaded = function() {
  gisInited = true;
  if (CLIENT_ID && CLIENT_SECRET) {
    initTokenClient();
  }
};

function initTokenClient() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    callback: () => {}
  });
  maybeEnableRefresh();
}

function maybeEnableRefresh() {
  const refreshBtn = document.getElementById('refresh');
  refreshBtn.disabled = !(gapiInited && tokenClient);
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
  tokenClient.callback = async resp => {
    if (resp.error !== undefined) {
      console.error('Error retrieving access token', resp);
      document.getElementById('output').textContent =
        'Error: ' + formatError(resp);
      return;
    }
    gapi.client.setToken(resp);
    try {
      const stats = await getStats();
      renderStats(stats);
    } catch (err) {
      console.error('Error refreshing stats', err);
      document.getElementById('output').textContent =
        'Error: ' + formatError(err);
    }
  };
  const prompt = gapi.client.getToken() ? '' : 'consent';
  tokenClient.requestAccessToken({ prompt });
}

async function fetchConfig() {
  const stored = getStakeholderConfig();
  if (stored) return stored;
  const res = await fetch('config.json');
  const cfg = await res.json();
  saveStakeholderConfig(cfg);
  return cfg;
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

