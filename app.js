/* Family Bracket 2026 */

const API = "__PORT_8001__".startsWith("__") ? (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:8001' : '') : "__PORT_8001__";

// ===== BRACKET DATA =====
const BRACKET_DATA = {
  East: {
    teams: [
      { seed: 1, name: "Duke" }, { seed: 16, name: "Siena" },
      { seed: 8, name: "Ohio St." }, { seed: 9, name: "TCU" },
      { seed: 5, name: "St. John's" }, { seed: 12, name: "Northern Iowa" },
      { seed: 4, name: "Kansas" }, { seed: 13, name: "Cal Baptist" },
      { seed: 6, name: "Louisville" }, { seed: 11, name: "South Florida" },
      { seed: 3, name: "Michigan St." }, { seed: 14, name: "N. Dakota St." },
      { seed: 7, name: "UCLA" }, { seed: 10, name: "UCF" },
      { seed: 2, name: "UConn" }, { seed: 15, name: "Furman" },
    ],
  },
  West: {
    teams: [
      { seed: 1, name: "Arizona" }, { seed: 16, name: "Long Island" },
      { seed: 8, name: "Villanova" }, { seed: 9, name: "Utah St." },
      { seed: 5, name: "Wisconsin" }, { seed: 12, name: "High Point" },
      { seed: 4, name: "Arkansas" }, { seed: 13, name: "Hawaii" },
      { seed: 6, name: "BYU" }, { seed: 11, name: "NC State/Texas" },
      { seed: 3, name: "Gonzaga" }, { seed: 14, name: "Kennesaw St." },
      { seed: 7, name: "Miami (FL)" }, { seed: 10, name: "Missouri" },
      { seed: 2, name: "Purdue" }, { seed: 15, name: "Queens (NC)" },
    ],
  },
  South: {
    teams: [
      { seed: 1, name: "Florida" }, { seed: 16, name: "Lehigh/PVAMU" },
      { seed: 8, name: "Clemson" }, { seed: 9, name: "Iowa" },
      { seed: 5, name: "Vanderbilt" }, { seed: 12, name: "McNeese" },
      { seed: 4, name: "Nebraska" }, { seed: 13, name: "Troy" },
      { seed: 6, name: "North Carolina" }, { seed: 11, name: "VCU" },
      { seed: 3, name: "Illinois" }, { seed: 14, name: "Penn" },
      { seed: 7, name: "Saint Mary's" }, { seed: 10, name: "Texas A&M" },
      { seed: 2, name: "Houston" }, { seed: 15, name: "Idaho" },
    ],
  },
  Midwest: {
    teams: [
      { seed: 1, name: "Michigan" }, { seed: 16, name: "Howard/UMBC" },
      { seed: 8, name: "Georgia" }, { seed: 9, name: "Saint Louis" },
      { seed: 5, name: "Texas Tech" }, { seed: 12, name: "Akron" },
      { seed: 4, name: "Alabama" }, { seed: 13, name: "Hofstra" },
      { seed: 6, name: "Tennessee" }, { seed: 11, name: "SMU/Miami (OH)" },
      { seed: 3, name: "Virginia" }, { seed: 14, name: "Wright St." },
      { seed: 7, name: "Kentucky" }, { seed: 10, name: "Santa Clara" },
      { seed: 2, name: "Iowa St." }, { seed: 15, name: "Tennessee St." },
    ],
  },
};

const REGIONS = ["East", "West", "South", "Midwest"];
const ROUND_NAMES = ["Round of 64", "Round of 32", "Sweet 16", "Elite 8"];
const FINAL_FOUR_MATCHUPS = [
  { label: "Semifinal 1", regions: ["East", "West"] },
  { label: "Semifinal 2", regions: ["South", "Midwest"] },
];

// ===== STATE =====
let currentMember = null;
let currentView = "home";
let allBrackets = [];
let currentBracketId = null;
let currentPicks = {};
let currentTiebreaker = null;
let currentRegion = "East";
let leaderboardData = [];
let isAdmin = false;
let memberList = [];  // loaded from /api/members
let loginError = "";
let showAdminInput = false;
let adminError = "";
let toastMessage = "";
let toastTimeout = null;
let pendingConfirm = null; // { message, onConfirm }
let tournamentResults = [];  // from /api/tournament/results
let liveSchedule = { games: [] };  // from /api/tournament/schedule
let expandedScheduleDays = {}; // track which day sections are expanded

// ===== API HELPERS =====
async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ===== TEAM HELPERS (matching friends-pool format) =====
function teamStr(team) {
  if (!team) return "";
  return `${team.seed} ${team.name}`;
}

function parseTeamStr(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)\s+(.+)$/);
  if (match) return { seed: parseInt(match[1]), name: match[2] };
  return { seed: 0, name: str };
}

function getMatchupTeams(region, round, matchIndex, teams, picks) {
  if (round === 0) {
    return { team1: teams[matchIndex * 2], team2: teams[matchIndex * 2 + 1] };
  }
  const prevKey1 = `${region}-R${round - 1}-M${matchIndex * 2}`;
  const prevKey2 = `${region}-R${round - 1}-M${matchIndex * 2 + 1}`;
  return {
    team1: picks[prevKey1] ? parseTeamStr(picks[prevKey1]) : null,
    team2: picks[prevKey2] ? parseTeamStr(picks[prevKey2]) : null,
  };
}

// ===== RENDERING =====
function render() {
  const app = document.getElementById("app");
  let html = `
    <div class="app-header">
      <h1>Family Bracket 2026</h1>
      <div class="subtitle">March Madness</div>
    </div>
  `;

  if (!currentMember) {
    html += renderNameSelect();
  } else {
    html += renderUserHeader();
    if (currentView === "home") html += renderHome();
    else if (currentView === "bracket") html += renderBracketEditor();
    else if (currentView === "leaderboard") html += renderLeaderboard();
    html += renderBottomNav();
  }

  html += `<div class="app-footer"><a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer">Created with Perplexity Computer</a></div>`;

  // Toast
  if (toastMessage) {
    html += `<div class="toast-bar">${escapeHtml(toastMessage)}</div>`;
  }

  // Confirm modal
  if (pendingConfirm) {
    html += `
      <div class="confirm-overlay" onclick="confirmNo()">
        <div class="confirm-box" onclick="event.stopPropagation()">
          <div class="confirm-msg">${escapeHtml(pendingConfirm.message)}</div>
          <div class="confirm-btns">
            <button class="confirm-yes" onclick="confirmYes()">Yes</button>
            <button class="confirm-no" onclick="confirmNo()">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  app.innerHTML = html;
}

function renderNameSelect() {
  return `
    <div class="welcome-card">
      <h2>Welcome!</h2>
      <p>Select your name and enter your password</p>
      <form class="login-form" onsubmit="handleLogin(event)">
        <div class="login-field">
          <label for="login-name">Name</label>
          <select id="login-name" class="login-select" required>
            <option value="">Choose your name...</option>
            ${memberList.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}
          </select>
        </div>
        <div class="login-field">
          <label for="login-password">Password</label>
          <input type="password" id="login-password" class="login-input" placeholder="Enter password" required />
        </div>
        ${loginError ? `<div class="login-error">${escapeHtml(loginError)}</div>` : ''}
        <button type="submit" class="btn-primary" style="width:100%;margin-top:4px;">Log In</button>
      </form>
    </div>
  `;
}

function renderUserHeader() {
  let adminSection = '';
  if (currentMember === 'Paul' && !isAdmin && !showAdminInput) {
    adminSection = `<button class="switch-btn" style="color:var(--orange-500);" onclick="toggleAdminInput()">Admin</button>`;
  } else if (showAdminInput && !isAdmin) {
    adminSection = `
      <div class="admin-inline">
        <input type="password" id="admin-pw" class="admin-pw-input" placeholder="Admin password" />
        <button class="admin-go-btn" onclick="submitAdminPw()">Go</button>
        <button class="admin-cancel-btn" onclick="cancelAdminInput()">✕</button>
      </div>
      ${adminError ? `<div style="font-size:11px;color:var(--red-500);margin-top:2px;">${escapeHtml(adminError)}</div>` : ''}
    `;
  } else if (isAdmin) {
    adminSection = `<button class="switch-btn" style="color:var(--orange-500);" onclick="exitAdmin()">Exit Admin</button>`;
  }

  return `
    <div class="user-header">
      <span class="greeting">Hey, ${escapeHtml(currentMember)} ${isAdmin ? '<span style="font-size:11px;color:var(--orange-500);font-weight:700;">ADMIN</span>' : ''}</span>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        ${adminSection}
        <button class="switch-btn" onclick="switchUser()">Switch</button>
      </div>
    </div>
  `;
}

function renderBottomNav() {
  return `
    <div class="bottom-nav">
      <button class="${currentView === 'home' ? 'active' : ''}" onclick="navigate('home')">
        <span class="nav-icon">🏠</span> Home
      </button>
      <button class="${currentView === 'leaderboard' ? 'active' : ''}" onclick="navigate('leaderboard')">
        <span class="nav-icon">🏆</span> Board
      </button>
    </div>
  `;
}

// ===== LIVE SCORES =====
const VEGAS_TZ = 'America/Los_Angeles';

function formatGameTime(datetimeStr) {
  if (!datetimeStr) return '';
  try {
    const d = new Date(datetimeStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: VEGAS_TZ });
  } catch (e) { return ''; }
}

function getVegasDate(datetimeStr) {
  if (!datetimeStr) return '';
  try {
    const d = new Date(datetimeStr);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: VEGAS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (e) { return ''; }
}

function formatGameDay(dateStr) {
  if (!dateStr) return 'Upcoming';
  try {
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${dt.getDate()}`;
  } catch (e) { return dateStr; }
}

function toggleScheduleDay(day) {
  expandedScheduleDays[day] = !expandedScheduleDays[day];
  render();
}

function renderLiveScores() {
  const games = liveSchedule.games || [];
  if (games.length === 0) return '';

  const sorted = [...games].sort((a, b) => {
    const order = { 'in': 0, 'pre': 1, 'final': 2 };
    if (order[a.game_state] !== order[b.game_state]) return order[a.game_state] - order[b.game_state];
    return (a.game_datetime || '').localeCompare(b.game_datetime || '');
  });

  const grouped = {};
  for (const g of sorted) {
    const day = (g.game_datetime ? getVegasDate(g.game_datetime) : g.game_date) || 'Unknown';
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(g);
  }

  const todayStr = getVegasDate(new Date().toISOString());
  const dayKeys = Object.keys(grouped);
  let activeDay = dayKeys[0] || '';
  if (grouped[todayStr]) {
    activeDay = todayStr;
  } else {
    for (const dk of dayKeys) {
      const hasLiveOrUpcoming = grouped[dk].some(g => g.game_state === 'in' || g.game_state === 'pre');
      if (hasLiveOrUpcoming) { activeDay = dk; break; }
    }
  }

  for (const dk of dayKeys) {
    if (expandedScheduleDays[dk] === undefined) {
      expandedScheduleDays[dk] = (dk === activeDay);
    }
  }

  const inProgress = games.filter(g => g.game_state === 'in');

  let html = `<div class="live-scores-section">
    <h3 class="section-title" style="display:flex;align-items:center;gap:8px;">
      Tournament Games
      ${inProgress.length > 0 ? '<span class="live-dot"></span> <span style="font-size:12px;color:#e53e3e;font-weight:600;">LIVE</span>' : ''}
    </h3>`;

  for (const [day, dayGames] of Object.entries(grouped)) {
    const roundLabel = dayGames[0]?.round_name || '';
    const isExpanded = expandedScheduleDays[day];
    const liveCount = dayGames.filter(g => g.game_state === 'in').length;
    const gameCount = dayGames.length;
    const isToday = day === todayStr;
    const liveIndicator = liveCount > 0 ? ' <span class="live-dot" style="display:inline-block;"></span>' : '';
    const countBadge = `<span style="font-size:11px;font-weight:500;color:var(--text-muted);margin-left:6px;">(${gameCount} games)</span>`;

    html += `
      <div class="live-day-header" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none;" onclick="toggleScheduleDay('${day}')">
        <span>${formatGameDay(day)}${roundLabel ? ' &mdash; ' + roundLabel : ''}${liveIndicator}${isToday ? ' <span style="font-size:10px;background:var(--orange-500);color:#fff;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:600;">TODAY</span>' : ''} ${countBadge}</span>
        <span style="font-size:18px;color:var(--text-muted);transition:transform 0.2s;transform:rotate(${isExpanded ? '180' : '0'}deg);">&blacktriangledown;</span>
      </div>`;

    if (isExpanded) {
      html += `<div class="live-scores-grid">`;
      for (const g of dayGames) {
        const stateClass = g.game_state === 'in' ? 'live-game-active' : g.game_state === 'final' ? 'live-game-final' : 'live-game-pre';
        let stateLabel = '';
        if (g.game_state === 'in') {
          stateLabel = g.status_detail || 'LIVE';
        } else if (g.game_state === 'final') {
          stateLabel = 'FINAL';
        } else {
          stateLabel = formatGameTime(g.game_datetime) || g.round_name || 'TBD';
        }
        html += `
          <div class="live-game-card ${stateClass}">
            <div class="live-game-status">${stateLabel}</div>
            <div class="live-game-teams">
              <div class="live-team ${g.game_state === 'final' && g.winner_name === g.team1_name ? 'live-winner' : ''}">
                <span class="live-seed">${g.team1_seed || ''}</span>
                <span class="live-name">${g.team1_name}</span>
                <span class="live-score-num">${g.game_state !== 'pre' ? g.team1_score : ''}</span>
              </div>
              <div class="live-team ${g.game_state === 'final' && g.winner_name === g.team2_name ? 'live-winner' : ''}">
                <span class="live-seed">${g.team2_seed || ''}</span>
                <span class="live-name">${g.team2_name}</span>
                <span class="live-score-num">${g.game_state !== 'pre' ? g.team2_score : ''}</span>
              </div>
            </div>
          </div>`;
      }
      html += `</div>`;
    }
  }

  html += `</div>`;
  return html;
}

// ===== HOME =====
function renderHome() {
  const myBrackets = allBrackets.filter(b => b.member_name === currentMember);

  return `
    ${renderLiveScores()}

    <div class="scoring-card">
      <h3>ESPN Scoring</h3>
      <div class="scoring-grid">
        <div>Round of 64: <span>10 pts</span></div>
        <div>Round of 32: <span>20 pts</span></div>
        <div>Sweet 16: <span>40 pts</span></div>
        <div>Elite 8: <span>80 pts</span></div>
        <div>Final Four: <span>160 pts</span></div>
        <div>Championship: <span>320 pts</span></div>
      </div>
    </div>

    ${isAdmin ? `
      <div class="admin-section">
        <h3 style="font-family:var(--font-display);font-weight:700;font-size:15px;color:var(--orange-500);margin-bottom:8px;">Admin: Tournament</h3>
        <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Fetch latest game results from ESPN and update bracket scores.</p>
        <button class="btn-primary" style="width:auto;padding:10px 20px;font-size:13px;background:var(--orange-500);" onclick="refreshTournamentResults()">Refresh Results from ESPN</button>
        <span id="refresh-status" style="font-size:12px;color:var(--text-muted);margin-left:12px;"></span>
      </div>
    ` : ''}

    <h2 class="section-title">My Brackets</h2>

    ${myBrackets.length > 0 ? `
      <div class="card">
        ${myBrackets.map(b => `
          <div class="bracket-item">
            <div>
              <div style="font-weight:600;font-size:15px;">Bracket ${myBrackets.indexOf(b) + 1}</div>
              <div style="font-size:12px;color:var(--text-muted);">${Object.keys(b.picks).length}/63 picks</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="bracket-status ${b.submitted ? 'submitted' : 'draft'}">${b.submitted ? 'Locked' : 'Draft'}</span>
              <button class="btn-secondary" onclick="editBracket(${b.id})" style="padding:6px 12px;font-size:12px;">${b.submitted && !isAdmin ? 'View' : 'Edit'}</button>
              ${isAdmin ? `
                ${b.submitted ? `<button class="btn-secondary" onclick="adminUnlock(${b.id})" style="padding:6px 10px;font-size:11px;color:var(--blue-600);border-color:var(--blue-600);">Unlock</button>` : ''}
                <button class="btn-secondary btn-danger" onclick="adminDelete(${b.id})" style="padding:6px 10px;font-size:11px;">Delete</button>
              ` : ''}
            </div>
          </div>
        `).join("")}
      </div>
    ` : '<div class="empty-state">No brackets yet. Create one below.</div>'}

    <button class="btn-primary" onclick="createBracket()" style="width:100%;margin-top:8px;">+ New Bracket</button>

    ${allBrackets.filter(b => b.member_name !== currentMember).length > 0 ? `
      <h2 class="section-title" style="margin-top:28px;">Everyone's Brackets</h2>
      <div class="card">
        ${allBrackets.filter(b => b.member_name !== currentMember).map(b => `
          <div class="bracket-item">
            <div>
              <div style="font-weight:600;font-size:14px;">${escapeHtml(b.member_name)}</div>
              <div style="font-size:12px;color:var(--text-muted);">${Object.keys(b.picks).length}/63 picks</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="bracket-status ${b.submitted ? 'submitted' : 'draft'}">${b.submitted ? 'Locked' : 'In Progress'}</span>
              ${b.submitted ? `<button class="btn-secondary" onclick="editBracket(${b.id})" style="padding:6px 12px;font-size:12px;">View</button>` : ''}
              ${isAdmin ? `
                <button class="btn-secondary" onclick="editBracket(${b.id})" style="padding:6px 10px;font-size:11px;color:var(--orange-500);border-color:var(--orange-500);">Edit</button>
                ${b.submitted ? `<button class="btn-secondary" onclick="adminUnlock(${b.id})" style="padding:6px 10px;font-size:11px;color:var(--blue-600);border-color:var(--blue-600);">Unlock</button>` : ''}
                <button class="btn-secondary btn-danger" onclick="adminDelete(${b.id})" style="padding:6px 10px;font-size:11px;">Delete</button>
              ` : ''}
            </div>
          </div>
        `).join("")}
      </div>
    ` : ''}
  `;
}

// ===== BRACKET EDITOR =====
function renderBracketEditor() {
  const bracket = allBrackets.find(b => b.id === currentBracketId);
  if (!bracket) return `<div class="empty-state">Bracket not found</div>`;
  const isLocked = bracket.submitted;
  const isOwner = bracket.member_name === currentMember;
  const canEdit = isOwner && !isLocked || isAdmin;
  const picks = canEdit ? currentPicks : bracket.picks;
  const pickCount = Object.keys(picks).length;

  // Build pickStatus from leaderboard data for this bracket
  const pickStatus = {};
  const lbEntry = (leaderboardData.leaderboard || leaderboardData || []).find(e => e.id === bracket.id);
  if (lbEntry) {
    (lbEntry.correct_picks || []).forEach(k => pickStatus[k] = 'correct');
    (lbEntry.wrong_picks || []).forEach(k => pickStatus[k] = 'wrong');
    (lbEntry.pending_picks || []).forEach(k => pickStatus[k] = 'pending');
  }
  const scoreDisplay = lbEntry ? `<span style="font-size:14px;font-weight:700;color:var(--blue-600);">${lbEntry.score} pts</span>` : '';

  return `
    <button class="btn-back" onclick="navigate('home')">← Back</button>
    <div class="bracket-header">
      <h2>${isOwner ? 'My' : escapeHtml(bracket.member_name) + "'s"} Bracket <span style="font-weight:400;font-size:14px;color:var(--text-muted)">(${pickCount}/63 picks)</span></h2>
      <div class="bracket-actions">
        ${scoreDisplay}
        ${isLocked && !isAdmin ? '<span class="locked-badge">🔒 Locked</span>' : ''}
        ${isAdmin && isLocked ? '<span style="font-size:11px;color:var(--orange-500);font-weight:600;">Admin Edit Mode</span>' : ''}
        ${canEdit ? `<button class="btn-save-draft" onclick="saveBracket()">Save${isAdmin ? ' (Admin)' : ' Draft'}</button>` : ''}
        ${isOwner && !isLocked ? `<button class="btn-submit-bracket" onclick="submitBracket()"${pickCount < 63 ? ' disabled' : ''}>Lock It In</button>` : ''}
      </div>
    </div>
    <div class="tiebreaker-row">
      <label class="tiebreaker-label">Championship Tiebreaker:</label>
      <span style="font-size:12px; color:var(--text-muted);">Predicted total combined score</span>
      ${canEdit
        ? `<input type="number" id="tiebreaker-input" class="tiebreaker-input" placeholder="e.g. 145" min="0" max="500" value="${currentTiebreaker || ''}" onchange="currentTiebreaker = this.value ? parseInt(this.value) : null">`
        : `<span class="tiebreaker-value">${bracket.tiebreaker !== null ? bracket.tiebreaker : 'Not set'}</span>`
      }
    </div>
    <div class="region-tabs">
      ${REGIONS.map(r => `
        <button class="${currentRegion === r ? 'active' : ''}" onclick="switchRegion('${r}')">${r}</button>
      `).join("")}
      <button class="${currentRegion === 'Final Four' ? 'active' : ''}" onclick="switchRegion('Final Four')">Final Four</button>
    </div>
    <div id="bracket-container">
      ${currentRegion === 'Final Four' ? renderFinalFour(picks, !canEdit, pickStatus) : renderRegion(currentRegion, picks, !canEdit, pickStatus)}
    </div>
  `;
}

function renderRegion(region, picks, locked, pickStatus) {
  const teams = BRACKET_DATA[region].teams;
  const rounds = 4;

  let html = `<div class="bracket-round-headers">`;
  for (let r = 0; r < rounds; r++) {
    html += `<div class="bracket-round-label">${ROUND_NAMES[r]}</div>`;
  }
  html += `</div>`;

  html += `<div class="bracket-grid">`;

  for (let round = 0; round < rounds; round++) {
    const matchCount = 8 / Math.pow(2, round);
    const rowSpan = 2 * Math.pow(2, round);

    for (let m = 0; m < matchCount; m++) {
      const rowStart = m * rowSpan + 1;
      const rowEnd = rowStart + rowSpan;
      const col = round + 1;

      const { team1, team2 } = getMatchupTeams(region, round, m, teams, picks);
      const matchKey = `${region}-R${round}-M${m}`;
      const selected = picks[matchKey];
      const pickSt = pickStatus ? pickStatus[matchKey] : null;

      html += `
        <div class="matchup-wrapper" style="grid-column:${col}; grid-row:${rowStart}/${rowEnd};">
          <div class="matchup-pair">
            ${renderTeamSlot(team1, matchKey, selected, locked, pickSt)}
            ${renderTeamSlot(team2, matchKey, selected, locked, pickSt)}
          </div>
        </div>
      `;
    }
  }

  html += `</div>`;
  return html;
}

function renderTeamSlot(team, matchKey, selected, locked, pickSt) {
  if (!team) {
    return `<div class="team-slot empty ${locked ? 'locked' : ''}"><span class="seed">-</span><span class="team-name">TBD</span></div>`;
  }
  const ts = teamStr(team);
  const isSelected = selected === ts;
  const clickHandler = locked ? "" : `onclick="makePick('${matchKey}', '${ts.replace(/'/g, "\\\\'")}')"`;
  // Pick status coloring: only apply to the selected team
  let statusClass = '';
  if (isSelected && pickSt) {
    statusClass = pickSt === 'correct' ? 'pick-correct' : pickSt === 'wrong' ? 'pick-wrong' : '';
  }
  return `
    <div class="team-slot ${isSelected ? 'selected' : ''} ${locked ? 'locked' : ''} ${statusClass}" ${clickHandler}>
      <span class="seed">${team.seed}</span>
      <span class="team-name">${team.name}</span>
      ${isSelected && !statusClass ? '<span class="pick-dot"></span>' : ''}
      ${statusClass === 'pick-correct' ? '<span class="pick-icon-correct">✓</span>' : ''}
      ${statusClass === 'pick-wrong' ? '<span class="pick-icon-wrong">✗</span>' : ''}
    </div>
  `;
}

function renderFinalFour(picks, locked, pickStatus) {
  const e8East = picks["East-R3-M0"];
  const e8West = picks["West-R3-M0"];
  const e8South = picks["South-R3-M0"];
  const e8Midwest = picks["Midwest-R3-M0"];
  const sf1Key = "FF-SF1";
  const sf2Key = "FF-SF2";
  const champKey = "FF-CHAMP";
  const sf1Pick = picks[sf1Key];
  const sf2Pick = picks[sf2Key];
  const champPick = picks[champKey];
  const sf1Winner = parseTeamStr(sf1Pick);
  const sf2Winner = parseTeamStr(sf2Pick);
  const champion = parseTeamStr(champPick);

  return `
    <div class="ff-container">
      <div class="ff-grid">
        <div class="ff-semifinal">
          <div class="ff-label">Semifinal 1</div>
          <div class="ff-sub">East vs West</div>
          <div class="matchup-pair ff-matchup">
            ${renderTeamSlot(parseTeamStr(e8East), sf1Key, sf1Pick, locked, pickStatus ? pickStatus[sf1Key] : null)}
            ${renderTeamSlot(parseTeamStr(e8West), sf1Key, sf1Pick, locked, pickStatus ? pickStatus[sf1Key] : null)}
          </div>
        </div>

        <div class="ff-championship">
          <div class="ff-label">Championship</div>
          <div class="matchup-pair ff-matchup champ-matchup">
            ${renderTeamSlot(sf1Winner, champKey, champPick, locked, pickStatus ? pickStatus[champKey] : null)}
            ${renderTeamSlot(sf2Winner, champKey, champPick, locked, pickStatus ? pickStatus[champKey] : null)}
          </div>
          <div class="ff-champion-box ${champion ? '' : 'empty'}">
            <div class="ff-champion-label">🏆 Champion</div>
            <div class="ff-champion-name">${champion ? champion.name : 'TBD'}</div>
          </div>
        </div>

        <div class="ff-semifinal">
          <div class="ff-label">Semifinal 2</div>
          <div class="ff-sub">South vs Midwest</div>
          <div class="matchup-pair ff-matchup">
            ${renderTeamSlot(parseTeamStr(e8South), sf2Key, sf2Pick, locked, pickStatus ? pickStatus[sf2Key] : null)}
            ${renderTeamSlot(parseTeamStr(e8Midwest), sf2Key, sf2Pick, locked, pickStatus ? pickStatus[sf2Key] : null)}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== LEADERBOARD =====
function renderLeaderboard() {
  const lb = leaderboardData.leaderboard || leaderboardData || [];
  const entries = Array.isArray(lb) ? lb : [];
  const gamesCompleted = leaderboardData.games_completed || 0;
  const champCombined = leaderboardData.championship_combined;

  return `
    <h2 class="section-title">Leaderboard</h2>
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
      <span style="font-size:13px; color:var(--text-muted);">${gamesCompleted} games completed</span>
      ${champCombined !== null && champCombined !== undefined ? `<span style="font-size:13px; color:var(--text-muted);">Championship total: ${champCombined}</span>` : ''}
      <button class="btn-secondary" onclick="refreshLeaderboard()" style="margin-left:auto; font-size:12px; padding:6px 12px;">Refresh</button>
    </div>
    ${entries.length > 0 ? `
      <div class="leaderboard-table-wrap">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Score</th>
              <th>TB</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map((e, i) => {
              const isMe = e.member_name === currentMember;
              const correctCount = (e.correct_picks || []).length;
              const wrongCount = (e.wrong_picks || []).length;
              const pendingCount = (e.pending_picks || []).length;
              return `
                <tr class="${isMe ? 'lb-me' : ''}" onclick="viewBracketFromLb(${e.id})" style="cursor:pointer;">
                  <td class="lb-rank">${e.rank || (i + 1)}</td>
                  <td class="lb-name-cell">
                    <div style="font-weight:600;">${escapeHtml(e.member_name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">
                      <span style="color:var(--green-600);">${correctCount}✓</span>
                      <span style="color:var(--red-500);margin-left:4px;">${wrongCount}✗</span>
                      <span style="margin-left:4px;">${pendingCount} pending</span>
                    </div>
                  </td>
                  <td class="lb-score">${e.score}</td>
                  <td class="lb-tb">${e.tiebreaker !== null && e.tiebreaker !== undefined ? e.tiebreaker : '-'}${e.tiebreaker_diff !== null && e.tiebreaker_diff !== undefined ? ` <span style="font-size:11px;color:var(--text-faint);">(${e.tiebreaker_diff > 0 ? '+' : ''}${e.tiebreaker_diff})</span>` : ''}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    ` : `
      <div class="card">
        <div class="empty-state">Leaderboard goes live once the tournament starts and brackets are scored.</div>
      </div>
    `}
  `;
}

function viewBracketFromLb(bracketId) {
  editBracket(bracketId);
}

async function refreshLeaderboard() {
  try {
    await loadTournamentData();
    render();
    showToast("Leaderboard refreshed");
  } catch (e) {
    showToast("Failed to refresh");
  }
}

// ===== ACTIONS =====
async function handleLogin(e) {
  e.preventDefault();
  const name = document.getElementById('login-name').value;
  const password = document.getElementById('login-password').value;
  if (!name || !password) return;
  loginError = "";
  try {
    await apiPost('/api/login', { name, password });
    currentMember = name;
    isAdmin = false;
    loginError = "";
    await loadData();
  } catch (err) {
    loginError = err.message || "Login failed";
    render();
  }
}

function switchUser() {
  currentMember = null;
  currentView = "home";
  currentBracketId = null;
  isAdmin = false;
  loginError = "";
  render();
}

function toggleAdminInput() {
  showAdminInput = true;
  adminError = "";
  render();
  setTimeout(() => { const el = document.getElementById('admin-pw'); if (el) el.focus(); }, 50);
}

function cancelAdminInput() {
  showAdminInput = false;
  adminError = "";
  render();
}

function submitAdminPw() {
  const el = document.getElementById('admin-pw');
  const pw = el ? el.value : '';
  if (pw === 'admin') {
    isAdmin = true;
    showAdminInput = false;
    adminError = "";
    render();
  } else {
    adminError = "Wrong password";
    render();
  }
}

function exitAdmin() {
  isAdmin = false;
  render();
}

// --- Toast (replaces alert) ---
function showToast(msg) {
  toastMessage = msg;
  render();
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toastMessage = ''; render(); }, 3000);
}

// --- Confirm modal (replaces confirm) ---
function showConfirm(message, onConfirm) {
  pendingConfirm = { message, onConfirm };
  render();
}

function confirmYes() {
  if (pendingConfirm && pendingConfirm.onConfirm) pendingConfirm.onConfirm();
  pendingConfirm = null;
  render();
}

function confirmNo() {
  pendingConfirm = null;
  render();
}

async function adminUnlock(bracketId) {
  showConfirm("Unlock this bracket so it can be edited again?", async () => {
    try {
      await apiPost(`/api/brackets/${bracketId}/unlock?admin=admin`, {});
      await loadData();
      showToast("Bracket unlocked");
    } catch (e) {
      showToast(e.message);
    }
  });
}

async function adminDelete(bracketId) {
  showConfirm("Delete this bracket? This cannot be undone.", async () => {
    try {
      await apiDelete(`/api/brackets/${bracketId}?admin=admin`);
      await loadData();
      showToast("Bracket deleted");
    } catch (e) {
      showToast(e.message);
    }
  });
}

function navigate(view) {
  currentView = view;
  currentBracketId = null;
  window.scrollTo(0, 0);
  render();
}

function switchRegion(region) {
  currentRegion = region;
  render();
}

async function createBracket() {
  try {
    const res = await apiPost(`/api/brackets?member_name=${encodeURIComponent(currentMember)}`, {});
    currentBracketId = res.id;
    currentPicks = {};
    currentTiebreaker = null;
    currentRegion = "East";
    currentView = "bracket";
    await loadData();
  } catch (e) {
    showToast(e.message);
  }
}

function editBracket(id) {
  const bracket = allBrackets.find(b => b.id === id);
  if (!bracket) return;
  currentBracketId = id;
  currentPicks = { ...bracket.picks };
  currentTiebreaker = bracket.tiebreaker;
  currentRegion = "East";
  currentView = "bracket";
  window.scrollTo(0, 0);
  render();
}

function makePick(matchKey, ts) {
  const old = currentPicks[matchKey];
  currentPicks[matchKey] = ts;
  if (old && old !== ts) {
    clearDownstream(matchKey, old);
  }
  render();
}

function clearDownstream(gameKey, oldTeam) {
  const allKeys = Object.keys(currentPicks);
  for (const key of allKeys) {
    if (key === gameKey) continue;
    if (currentPicks[key] === oldTeam && isDownstream(gameKey, key)) {
      const removed = currentPicks[key];
      delete currentPicks[key];
      clearDownstream(key, removed);
    }
  }
}

function isDownstream(sourceKey, targetKey) {
  return getRoundNum(targetKey) > getRoundNum(sourceKey);
}

function getRoundNum(key) {
  const m = key.match(/-R(\d+)-/);
  if (m) return parseInt(m[1]);
  if (key.startsWith("FF-SF")) return 4;
  if (key === "FF-CHAMP") return 5;
  return 0;
}

async function saveBracket() {
  try {
    const adminParam = isAdmin ? '?admin=admin' : '';
    await apiPut(`/api/brackets/${currentBracketId}${adminParam}`, { picks: currentPicks, tiebreaker: currentTiebreaker });
    await loadData();
    showToast("Bracket saved!");
  } catch (e) {
    showToast(e.message);
  }
}

async function submitBracket() {
  if (Object.keys(currentPicks).length < 63) {
    showToast("You need all 63 picks to lock in your bracket.");
    return;
  }
  showConfirm("Lock in your bracket? You won't be able to edit it after this.", async () => {
    try {
      await apiPost(`/api/brackets/${currentBracketId}/submit`, { picks: currentPicks, tiebreaker: currentTiebreaker });
      await loadData();
      showToast("Bracket locked in!");
      navigate("home");
    } catch (e) {
      showToast(e.message);
    }
  });
}

// ===== DATA LOADING =====
async function loadData() {
  try {
    const [bracketsRes, lbRes] = await Promise.all([
      apiGet("/api/brackets"),
      apiGet("/api/leaderboard"),
    ]);
    allBrackets = bracketsRes.brackets;
    leaderboardData = lbRes;
  } catch (e) {
    console.error("Load failed:", e);
  }
  // Load tournament data in background (non-blocking)
  loadTournamentData();
  render();
}

async function loadTournamentData() {
  try {
    const [schedRes, lbRes] = await Promise.all([
      apiGet("/api/tournament/schedule"),
      apiGet("/api/leaderboard"),
    ]);
    liveSchedule = schedRes;
    leaderboardData = lbRes;
    render();
  } catch (e) {
    // Tournament endpoints may not have data yet, ignore
  }
}

async function refreshTournamentResults() {
  const statusEl = document.getElementById("refresh-status");
  if (statusEl) statusEl.textContent = "Refreshing...";
  try {
    const res = await apiPost("/api/admin/tournament/refresh?admin=admin", {});
    showToast(`Tournament refreshed: ${res.games_upserted} games updated`);
    if (statusEl) statusEl.textContent = `${res.games_upserted} games updated`;
    await loadTournamentData();
  } catch (err) {
    showToast("Error: " + err.message);
    if (statusEl) statusEl.textContent = "Error: " + err.message;
  }
}

// ===== INIT =====
async function init() {
  try {
    const res = await apiGet('/api/members');
    memberList = res.members;
  } catch (e) {
    console.error('Failed to load members:', e);
    memberList = ["John", "Barb", "Paul", "John C", "Will", "Nicole"]; // fallback
  }
  render();
}

init();
