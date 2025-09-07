async function fetchConfig() {
  const url = chrome.runtime.getURL('config.json');
  const res = await fetch(url);
  return res.json();
}

function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('No token'));
        return;
      }
      resolve(token);
    });
  });
}

async function fetchEvents(token) {
  const now = new Date();
  const timeMin = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=2500&singleEvents=true&orderBy=startTime`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  return data.items || [];
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
  const [token, config] = await Promise.all([getToken(), fetchConfig()]);
  const events = await fetchEvents(token);
  return computeStats(events, config);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_stats') {
    getStats()
      .then(stats => sendResponse({ stats }))
      .catch(err => sendResponse({ error: err.message || String(err) }));
    return true; // asynchronous response
  }
});
