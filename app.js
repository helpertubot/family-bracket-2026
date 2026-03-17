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
  const submittedCount = myBrackets.filter(b => b.submitted).length;

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
  const pickCount = Object.keys(currentPicks).length;

  let regionTabs = REGIONS.map(r =>
    `<button class="region-tab ${currentRegion === r ? 'active' : ''}" onclick="switchRegion('${r}')">${r}</button>`
  ).join("");
  regionTabs += `<button class="region-tab ff ${currentRegion === 'FF' ? 'active' : ''}" onclick="switchRegion('FF')">Final Four</button>`;

  let matchups = "";
  if (currentRegion === "FF") {
    matchups = renderFinalFour(isLocked, isOwner);
  } else {
    matchups = renderRegionMatchups(currentRegion, isLocked, isOwner);
  }

  return `
    <button class="btn-back" onclick="navigate('home')">← Back</button>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <h2 class="section-title" style="margin-bottom:0;">${isOwner ? 'My' : escapeHtml(bracket.member_name) + "'s"} Bracket</h2>
      ${isLocked ? '<span class="bracket-status submitted" style="font-size:13px;">Locked</span>' : ''}
    </div>

    <div class="pick-count">${pickCount}/63 picks</div>
    <div class="region-tabs">${regionTabs}</div>
    ${matchups}

    ${currentRegion === 'FF' ? `
      <div class="tiebreaker-section">
        <label>Tiebreaker: Total combined score of championship game</label>
        <input type="number" id="tiebreaker-input" value="${currentTiebreaker || ''}" placeholder="e.g. 145" ${isLocked || !isOwner ? 'disabled' : ''} onchange="updateTiebreaker()">
      </div>
    ` : ''}

    ${!isLocked && isOwner ? `
      <div class="bracket-actions">
        <button class="btn-primary" onclick="saveBracket()">Save</button>
        <button class="btn-primary btn-submit" onclick="submitBracket()" ${pickCount < 63 ? 'disabled' : ''}>Lock It In</button>
      </div>
    ` : ''}
  `;
}

function renderRegionMatchups(region, isLocked, isOwner) {
  const teams = BRACKET_DATA[region].teams;
  let html = "";

  // Round 1 — 8 matchups
  html += `<div style="font-size:13px;font-weight:700;color:var(--navy-700);margin-bottom:10px;">Round of 64</div>`;
  for (let i = 0; i < 16; i += 2) {
    const gKey = `${region[0]}_R1_G${(i / 2) + 1}`;
    html += renderMatchup(gKey, teams[i], teams[i + 1], isLocked, isOwner);
  }

  // Round 2 — 4 matchups
  html += `<div style="font-size:13px;font-weight:700;color:var(--navy-700);margin:18px 0 10px;">Round of 32</div>`;
  for (let i = 0; i < 8; i += 2) {
    const gKey = `${region[0]}_R2_G${(i / 2) + 1}`;
    const prev1 = `${region[0]}_R1_G${i + 1}`;
    const prev2 = `${region[0]}_R1_G${i + 2}`;
    const t1 = getPickedTeam(prev1);
    const t2 = getPickedTeam(prev2);
    html += renderMatchup(gKey, t1, t2, isLocked, isOwner);
  }

  // Sweet 16 — 2 matchups
  html += `<div style="font-size:13px;font-weight:700;color:var(--navy-700);margin:18px 0 10px;">Sweet 16</div>`;
  for (let i = 0; i < 4; i += 2) {
    const gKey = `${region[0]}_R3_G${(i / 2) + 1}`;
    const prev1 = `${region[0]}_R2_G${i + 1}`;
    const prev2 = `${region[0]}_R2_G${i + 2}`;
    const t1 = getPickedTeam(prev1);
    const t2 = getPickedTeam(prev2);
    html += renderMatchup(gKey, t1, t2, isLocked, isOwner);
  }

  // Elite 8 — 1 matchup
  html += `<div style="font-size:13px;font-weight:700;color:var(--navy-700);margin:18px 0 10px;">Elite 8</div>`;
  const gKey = `${region[0]}_R4_G1`;
  const prev1 = `${region[0]}_R3_G1`;
  const prev2 = `${region[0]}_R3_G2`;
  const t1 = getPickedTeam(prev1);
  const t2 = getPickedTeam(prev2);
  html += renderMatchup(gKey, t1, t2, isLocked, isOwner);

  return html;
}

function renderFinalFour(isLocked, isOwner) {
  let html = `<div style="font-size:13px;font-weight:700;color:var(--navy-700);margin-bottom:10px;">Final Four</div>`;

  // Semifinal 1: East winner vs West winner
  const eastWinner = getPickedTeam("E_R4_G1");
  const westWinner = getPickedTeam("W_R4_G1");
  html += renderMatchup("FF_G1", eastWinner, westWinner, isLocked, isOwner, "East vs West");

  // Semifinal 2: South winner vs Midwest winner
  const southWinner = getPickedTeam("S_R4_G1");
  const midwestWinner = getPickedTeam("M_R4_G1");
  html += renderMatchup("FF_G2", southWinner, midwestWinner, isLocked, isOwner, "South vs Midwest");

  // Championship
  html += `<div style="font-size:13px;font-weight:700;color:var(--orange-600);margin:18px 0 10px;">Championship</div>`;
  const ff1Winner = getPickedTeam("FF_G1");
  const ff2Winner = getPickedTeam("FF_G2");
  html += renderMatchup("CHAMP", ff1Winner, ff2Winner, isLocked, isOwner, "Title Game");

  return html;
}

function renderMatchup(gameKey, team1, team2, isLocked, isOwner, label) {
  const picked = currentPicks[gameKey];
  const canPick = !isLocked && isOwner;

  const t1Name = team1 ? (typeof team1 === 'object' ? team1.name : team1) : "TBD";
  const t2Name = team2 ? (typeof team2 === 'object' ? team2.name : team2) : "TBD";
  const t1Seed = team1 && typeof team1 === 'object' ? team1.seed : null;
  const t2Seed = team2 && typeof team2 === 'object' ? team2.seed : null;

  const t1Disabled = t1Name === "TBD" || !canPick;
  const t2Disabled = t2Name === "TBD" || !canPick;

  return `
    <div class="matchup">
      ${label ? `<div class="matchup-label">${label}</div>` : ''}
      <button class="team-btn ${picked === t1Name ? 'selected' : ''} ${t1Disabled ? 'locked' : ''}"
        onclick="${t1Disabled ? '' : `pickTeam('${gameKey}', '${escapeHtml(t1Name)}')`}"
        ${t1Disabled ? 'disabled' : ''}>
        ${t1Seed ? `<span class="seed">(${t1Seed})</span>` : ''}
        ${escapeHtml(t1Name)}
      </button>
      <button class="team-btn ${picked === t2Name ? 'selected' : ''} ${t2Disabled ? 'locked' : ''}"
        onclick="${t2Disabled ? '' : `pickTeam('${gameKey}', '${escapeHtml(t2Name)}')`}"
        ${t2Disabled ? 'disabled' : ''}>
        ${t2Seed ? `<span class="seed">(${t2Seed})</span>` : ''}
        ${escapeHtml(t2Name)}
      </button>
    </div>
  `;
}

function getPickedTeam(gameKey) {
  const picked = currentPicks[gameKey];
  if (!picked) return null;
  // Try to find the team object with seed info
  for (const region of REGIONS) {
    const found = BRACKET_DATA[region].teams.find(t => t.name === picked);
    if (found) return found;
  }
  return picked; // Return just the name
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

function pickTeam(gameKey, teamName) {
  // Clear downstream picks if this pick changed
  const old = currentPicks[gameKey];
  currentPicks[gameKey] = teamName;
  if (old && old !== teamName) {
    clearDownstream(gameKey, old);
  }
  render();
}

function clearDownstream(gameKey, oldTeam) {
  // Find all games that could be affected by this pick change
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
  // Simple heuristic: later rounds are downstream
  const sourceRound = getRoundNum(sourceKey);
  const targetRound = getRoundNum(targetKey);
  return targetRound > sourceRound;
}

function getRoundNum(key) {
  if (key.includes("R1")) return 1;
  if (key.includes("R2")) return 2;
  if (key.includes("R3")) return 3;
  if (key.includes("R4")) return 4;
  if (key.startsWith("FF")) return 5;
  if (key === "CHAMP") return 6;
  return 0;
}

function updateTiebreaker() {
  const val = document.getElementById("tiebreaker-input")?.value;
  currentTiebreaker = val ? parseInt(val) : null;
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
