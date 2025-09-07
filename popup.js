function renderStats(stats) {
  const lines = [];
  lines.push('Top Attendees:');
  stats.top_attendees.forEach(([email, count]) => lines.push(`  ${email}: ${count}`));
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

function refresh() {
  document.getElementById('output').textContent = 'Loading...';
  chrome.runtime.sendMessage({ type: 'get_stats' }, response => {
    if (response.error) {
      document.getElementById('output').textContent = 'Error: ' + response.error;
      return;
    }
    renderStats(response.stats);
  });
}

document.getElementById('refresh').addEventListener('click', refresh);
document.addEventListener('DOMContentLoaded', refresh);
