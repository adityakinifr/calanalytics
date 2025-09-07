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

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Globals used across the application. Declared early to prevent
// ReferenceError when they are accessed before initialization.
let tokenClient;
let gapiInited = false;
let gisInited = false;
let charts = [];

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
  lines.push('Top Attendees by Meetings:');
  stats.top_by_count.forEach(([email, count]) =>
    lines.push(`  ${email}: ${count} meetings`)
  );
  lines.push('');
  lines.push('Top Attendees by Time:');
  stats.top_by_time.forEach(([email, time]) =>
    lines.push(`  ${email}: ${time.toFixed(2)} hrs`)
  );
  if (Object.keys(stats.exec_team || {}).length) {
    lines.push('');
    lines.push('Exec Team:');
    for (const [email, data] of Object.entries(stats.exec_team)) {
      lines.push(`  ${email}: ${data.count} meetings, ${data.time.toFixed(2)} hrs`);
    }
  }
  if (Object.keys(stats.gartner_analysts || {}).length) {
    lines.push('');
    lines.push('Gartner Analysts:');
    for (const [email, data] of Object.entries(stats.gartner_analysts)) {
      lines.push(`  ${email}: ${data.count} meetings, ${data.time.toFixed(2)} hrs`);
    }
  }
  if (Object.keys(stats.direct_reports || {}).length) {
    lines.push('');
    lines.push('Direct Reports:');
    for (const [email, data] of Object.entries(stats.direct_reports)) {
      lines.push(`  ${email}: ${data.count} meetings, ${data.time.toFixed(2)} hrs`);
    }
  }
  if (Object.keys(stats.gartner_meetings || {}).length) {
    lines.push('');
    lines.push('Gartner Meetings:');
    for (const [analyst, data] of Object.entries(stats.gartner_meetings)) {
      lines.push(
        `  ${analyst}: ${data.count} meetings, ${data.time.toFixed(2)} hrs (Inquiry: ${data.inquiryCount}, Briefing: ${data.briefingCount})`
      );
    }
  }
  document.getElementById('output').textContent = lines.join('\n');
  renderCharts(stats);
}

function renderCharts(stats) {
  charts.forEach(ch => ch.destroy());
  charts = [];
  const countCtx = document.getElementById('countChart').getContext('2d');
  charts.push(
    new Chart(countCtx, {
      type: 'line',
      data: {
        labels: stats.weekly_labels,
        datasets: [
          {
            label: 'Meetings per Week',
            data: stats.weekly_counts,
            fill: false,
            borderColor: 'rgba(54, 162, 235, 0.8)'
          }
        ]
      }
    })
  );
  const timeCtx = document.getElementById('timeChart').getContext('2d');
  charts.push(
    new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: stats.weekly_labels,
        datasets: [
          {
            label: 'Hours per Week',
            data: stats.weekly_hours,
            fill: false,
            borderColor: 'rgba(75, 192, 192, 0.8)'
          }
        ]
      }
    })
  );
  const container = document.getElementById('individualCharts');
  container.innerHTML = '';
  const names = new Set([
    ...stats.top_by_count.map(([e]) => e),
    ...stats.top_by_time.map(([e]) => e),
    ...Object.keys(stats.exec_team || {}),
    ...Object.keys(stats.gartner_analysts || {}),
    ...Object.keys(stats.gartner_meetings || {})
  ]);
  for (const name of names) {
    const data =
      stats.per_attendee[name] ||
      (stats.exec_team || {})[name] ||
      (stats.gartner_analysts || {})[name] ||
      (stats.gartner_meetings || {})[name];
    if (!data) continue;
    const canvas = document.createElement('canvas');
    canvas.height = 200;
    container.appendChild(canvas);
    charts.push(
      new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Meetings', 'Hours'],
          datasets: [
            {
              label: name,
              data: [data.count || 0, data.time || 0],
              backgroundColor: [
                'rgba(153, 102, 255, 0.5)',
                'rgba(255, 159, 64, 0.5)'
              ]
            }
          ]
        },
        options: {
          plugins: {
            legend: { display: false }
          }
        }
      })
    );
  }
}

async function refresh() {
  const output = document.getElementById('output');
  output.textContent = 'Requesting access token...';
  tokenClient.callback = async resp => {
    if (resp.error !== undefined) {
      console.error('Error retrieving access token', resp);
      output.textContent = 'Error: ' + formatError(resp);
      return;
    }
    gapi.client.setToken(resp);
    try {
      const stats = await getStats(message => {
        output.textContent = message;
      });
      renderStats(stats);
    } catch (err) {
      console.error('Error refreshing stats', err);
      output.textContent = 'Error: ' + formatError(err);
    }
  };
  const prompt = gapi.client.getToken() ? '' : 'consent';
  tokenClient.requestAccessToken({ prompt });
}

async function fetchConfig() {
  const stored = getStakeholderConfig();
  if (stored) return stored;
  try {
    const res = await fetch('config.json');
    if (!res.ok) throw new Error('Failed to load');
    const cfg = await res.json();
    saveStakeholderConfig(cfg);
    return cfg;
  } catch (e) {
    const cfg = { exec_team: [], gartner_analysts: [], direct_reports: [] };
    saveStakeholderConfig(cfg);
    return cfg;
  }
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
  const countMap = new Map();
  const timeMap = new Map();
  const weeklyCount = new Map();
  const weeklyTime = new Map();
  const gartnerStats = {};
  for (const event of events) {
    const startStr = event.start?.dateTime || event.start?.date;
    const endStr = event.end?.dateTime || event.end?.date;
    if (!startStr || !endStr) continue;
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const duration = (endDate - startDate) / 36e5;
    if (duration <= 0) continue;
    const weekKey = startOfWeek(startDate).toISOString().slice(0, 10);
    weeklyCount.set(weekKey, (weeklyCount.get(weekKey) || 0) + 1);
    weeklyTime.set(weekKey, (weeklyTime.get(weekKey) || 0) + duration);
    const attendees = event.attendees || [];
    for (const att of attendees) {
      if (att.responseStatus === 'declined') continue;
      if (!att.email) continue;
      const email = att.email.toLowerCase();
      countMap.set(email, (countMap.get(email) || 0) + 1);
      timeMap.set(email, (timeMap.get(email) || 0) + duration);
    }
    const summary = (event.summary || '').toLowerCase();
    const description = (event.description || '').toLowerCase();
    const attEmails = attendees
      .map(a => a.email ? a.email.toLowerCase() : '')
      .filter(Boolean);
    const isGartner =
      summary.includes('gartner') ||
      description.includes('gartner') ||
      attEmails.some(e => (config.gartner_analysts || []).includes(e));
    if (isGartner) {
      const typeMatch =
        summary.match(/(inquiry|briefing)/i) ||
        description.match(/(inquiry|briefing)/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : 'other';
      const analystMatch =
        event.description && event.description.match(/analyst\s*:\s*([^\n]+)/i);
      const analyst = analystMatch ? analystMatch[1].trim() : 'Unknown';
      if (!gartnerStats[analyst]) {
        gartnerStats[analyst] = {
          count: 0,
          time: 0,
          inquiryCount: 0,
          briefingCount: 0,
          inquiryTime: 0,
          briefingTime: 0
        };
      }
      gartnerStats[analyst].count++;
      gartnerStats[analyst].time += duration;
      if (type === 'inquiry') {
        gartnerStats[analyst].inquiryCount++;
        gartnerStats[analyst].inquiryTime += duration;
      } else if (type === 'briefing') {
        gartnerStats[analyst].briefingCount++;
        gartnerStats[analyst].briefingTime += duration;
      }
    }
  }
  const top_by_count = Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const top_by_time = Array.from(timeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const weeklyLabels = Array.from(weeklyCount.keys()).sort();
  const weeklyCounts = weeklyLabels.map(k => weeklyCount.get(k));
  const weeklyHours = weeklyLabels.map(k => weeklyTime.get(k) || 0);
  const exec_team = {};
  for (const email of config.exec_team || []) {
    const e = email.toLowerCase();
    if (countMap.has(e) || timeMap.has(e)) {
      exec_team[e] = {
        count: countMap.get(e) || 0,
        time: timeMap.get(e) || 0
      };
    }
  }
  const gartner_analysts = {};
  for (const email of config.gartner_analysts || []) {
    const e = email.toLowerCase();
    if (countMap.has(e) || timeMap.has(e)) {
      gartner_analysts[e] = {
        count: countMap.get(e) || 0,
        time: timeMap.get(e) || 0
      };
    }
  }
  const direct_reports = {};
  for (const email of config.direct_reports || []) {
    const e = email.toLowerCase();
    if (countMap.has(e) || timeMap.has(e)) {
      direct_reports[e] = {
        count: countMap.get(e) || 0,
        time: timeMap.get(e) || 0
      };
    }
  }
  const per_attendee = {};
  for (const [email, count] of countMap.entries()) {
    per_attendee[email] = {
      count,
      time: timeMap.get(email) || 0
    };
  }
  return {
    top_by_count,
    top_by_time,
    exec_team,
    gartner_analysts,
    direct_reports,
    per_attendee,
    gartner_meetings: gartnerStats,
    weekly_labels: weeklyLabels,
    weekly_counts: weeklyCounts,
    weekly_hours: weeklyHours
  };
}

async function getStats(onProgress) {
  onProgress?.('Loading configuration...');
  const config = await fetchConfig();
  onProgress?.('Fetching calendar events...');
  const events = await fetchEvents();
  onProgress?.('Computing statistics...');
  return computeStats(events, config);
}

