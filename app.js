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
  app.innerHTML = html;
}

function renderNameSelect() {
  const members = ["John", "Barb", "Paul", "John C", "Will", "Nicole"];
  return `
    <div class="welcome-card">
      <h2>Welcome!</h2>
      <p>Pick your name to get started</p>
      <div class="name-grid">
        ${members.map(m => `<button class="name-btn" onclick="selectMember('${escapeHtml(m)}')">${escapeHtml(m)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderUserHeader() {
  return `
    <div class="user-header">
      <span class="greeting">Hey, ${escapeHtml(currentMember)}</span>
      <button class="switch-btn" onclick="switchUser()">Switch</button>
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

// ===== HOME =====
function renderHome() {
  const myBrackets = allBrackets.filter(b => b.member_name === currentMember);

  return `
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

    <h2 class="section-title">My Brackets</h2>

    ${myBrackets.length > 0 ? `
      <div class="card">
        ${myBrackets.map(b => `
          <div class="bracket-item">
            <div>
              <div style="font-weight:600;font-size:15px;">Bracket ${myBrackets.indexOf(b) + 1}</div>
              <div style="font-size:12px;color:var(--text-muted);">${Object.keys(b.picks).length}/63 picks</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="bracket-status ${b.submitted ? 'submitted' : 'draft'}">${b.submitted ? 'Locked' : 'Draft'}</span>
              <button class="btn-secondary" onclick="editBracket(${b.id})" style="padding:6px 12px;font-size:12px;">${b.submitted ? 'View' : 'Edit'}</button>
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
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="bracket-status ${b.submitted ? 'submitted' : 'draft'}">${b.submitted ? 'Locked' : 'In Progress'}</span>
              ${b.submitted ? `<button class="btn-secondary" onclick="editBracket(${b.id})" style="padding:6px 12px;font-size:12px;">View</button>` : ''}
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
  const picks = isLocked ? bracket.picks : currentPicks;
  const pickCount = Object.keys(picks).length;

  return `
    <button class="btn-back" onclick="navigate('home')">← Back</button>
    <div class="bracket-header">
      <h2>${isOwner ? 'My' : escapeHtml(bracket.member_name) + "'s"} Bracket <span style="font-weight:400;font-size:14px;color:var(--text-muted)">(${pickCount}/63 picks)</span></h2>
      <div class="bracket-actions">
        ${isLocked
          ? '<span class="locked-badge">🔒 Locked</span>'
          : (isOwner ? `<button class="btn-save-draft" onclick="saveBracket()">Save Draft</button>
             <button class="btn-submit-bracket" onclick="submitBracket()"${pickCount < 63 ? ' disabled' : ''}>Lock It In</button>` : '')
        }
      </div>
    </div>
    <div class="tiebreaker-row">
      <label class="tiebreaker-label">Championship Tiebreaker:</label>
      <span style="font-size:12px; color:var(--text-muted);">Predicted total combined score</span>
      ${isLocked
        ? `<span class="tiebreaker-value">${bracket.tiebreaker !== null ? bracket.tiebreaker : 'Not set'}</span>`
        : (isOwner ? `<input type="number" id="tiebreaker-input" class="tiebreaker-input" placeholder="e.g. 145" min="0" max="500" value="${currentTiebreaker || ''}" onchange="currentTiebreaker = this.value ? parseInt(this.value) : null">` : '')
      }
    </div>
    <div class="region-tabs">
      ${REGIONS.map(r => `
        <button class="${currentRegion === r ? 'active' : ''}" onclick="switchRegion('${r}')">${r}</button>
      `).join("")}
      <button class="${currentRegion === 'Final Four' ? 'active' : ''}" onclick="switchRegion('Final Four')">Final Four</button>
    </div>
    <div id="bracket-container">
      ${currentRegion === 'Final Four' ? renderFinalFour(picks, isLocked || !isOwner) : renderRegion(currentRegion, picks, isLocked || !isOwner)}
    </div>
  `;
}

function renderRegion(region, picks, locked) {
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

      html += `
        <div class="matchup-wrapper" style="grid-column:${col}; grid-row:${rowStart}/${rowEnd};">
          <div class="matchup-pair">
            ${renderTeamSlot(team1, matchKey, selected, locked)}
            ${renderTeamSlot(team2, matchKey, selected, locked)}
          </div>
        </div>
      `;
    }
  }

  html += `</div>`;
  return html;
}

function renderTeamSlot(team, matchKey, selected, locked) {
  if (!team) {
    return `<div class="team-slot empty ${locked ? 'locked' : ''}"><span class="seed">-</span><span class="team-name">TBD</span></div>`;
  }
  const ts = teamStr(team);
  const isSelected = selected === ts;
  const clickHandler = locked ? "" : `onclick="makePick('${matchKey}', '${ts.replace(/'/g, "\\\\'")}')"`;
  return `
    <div class="team-slot ${isSelected ? 'selected' : ''} ${locked ? 'locked' : ''}" ${clickHandler}>
      <span class="seed">${team.seed}</span>
      <span class="team-name">${team.name}</span>
      ${isSelected ? '<span class="pick-dot"></span>' : ''}
    </div>
  `;
}

function renderFinalFour(picks, locked) {
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
            ${renderTeamSlot(parseTeamStr(e8East), sf1Key, sf1Pick, locked)}
            ${renderTeamSlot(parseTeamStr(e8West), sf1Key, sf1Pick, locked)}
          </div>
        </div>

        <div class="ff-championship">
          <div class="ff-label">Championship</div>
          <div class="matchup-pair ff-matchup champ-matchup">
            ${renderTeamSlot(sf1Winner, champKey, champPick, locked)}
            ${renderTeamSlot(sf2Winner, champKey, champPick, locked)}
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
            ${renderTeamSlot(parseTeamStr(e8South), sf2Key, sf2Pick, locked)}
            ${renderTeamSlot(parseTeamStr(e8Midwest), sf2Key, sf2Pick, locked)}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ===== LEADERBOARD =====
function renderLeaderboard() {
  return `
    <h2 class="section-title">Leaderboard</h2>
    ${leaderboardData.length > 0 ? `
      <div class="card" style="padding:0;overflow:hidden;">
        ${leaderboardData.map((entry, i) => `
          <div class="leaderboard-row">
            <div class="lb-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</div>
            <div class="lb-name">${escapeHtml(entry.member_name)}
              ${entry.tiebreaker ? `<div class="lb-tiebreaker">TB: ${entry.tiebreaker}</div>` : ''}
            </div>
            <div class="lb-score">${entry.score}</div>
          </div>
        `).join("")}
      </div>
    ` : `
      <div class="card">
        <div class="empty-state">Leaderboard goes live once the tournament starts and brackets are scored.</div>
      </div>
    `}
  `;
}

// ===== ACTIONS =====
function selectMember(name) {
  currentMember = name;
  loadData();
}

function switchUser() {
  currentMember = null;
  currentView = "home";
  currentBracketId = null;
  render();
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
    alert(e.message);
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
    await apiPut(`/api/brackets/${currentBracketId}`, { picks: currentPicks, tiebreaker: currentTiebreaker });
    await loadData();
    alert("Bracket saved!");
  } catch (e) {
    alert(e.message);
  }
}

async function submitBracket() {
  if (Object.keys(currentPicks).length < 63) {
    alert("You need all 63 picks to lock in your bracket.");
    return;
  }
  if (!confirm("Lock in your bracket? You won't be able to edit it after this.")) return;
  try {
    await apiPost(`/api/brackets/${currentBracketId}/submit`, { picks: currentPicks, tiebreaker: currentTiebreaker });
    await loadData();
    alert("Bracket locked in!");
    navigate("home");
  } catch (e) {
    alert(e.message);
  }
}

// ===== DATA LOADING =====
async function loadData() {
  try {
    const [bracketsRes, lbRes] = await Promise.all([
      apiGet("/api/brackets"),
      apiGet("/api/leaderboard"),
    ]);
    allBrackets = bracketsRes.brackets;
    leaderboardData = lbRes.leaderboard;
  } catch (e) {
    console.error("Load failed:", e);
  }
  render();
}

// ===== INIT =====
function init() {
  render();
}

init();
