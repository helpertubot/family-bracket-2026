#!/usr/bin/env python3
"""Family Bracket 2026 — Simple March Madness bracket app with Neon PostgreSQL."""
import json
import os
import sys
import time
import logging
import traceback

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO, stream=sys.stdout,
                    format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://neondb_owner:npg_bkNlfWGCVD95@ep-dawn-lake-am5wefih-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
)

FAMILY_MEMBERS = {
    "John": "march1",
    "Barb": "march2",
    "Paul": "march3",
    "John C": "march4",
    "Will": "march5",
    "Nicole": "march6",
    "MJB": "march9",
}
ADMIN_PASSWORD = "admin"

# ESPN Standard Scoring
ROUND_POINTS = {1: 10, 2: 20, 3: 40, 4: 80, 5: 160, 6: 320}

db = None

def ensure_db():
    """Get or create a DB connection with retry logic."""
    global db
    for attempt in range(5):
        try:
            if db and not db.closed:
                # Test the connection
                cur = db.cursor()
                cur.execute("SELECT 1")
                cur.close()
                return db
        except Exception:
            db = None
        try:
            logger.info(f"Connecting to PostgreSQL (attempt {attempt + 1})...")
            db = psycopg2.connect(DATABASE_URL, connect_timeout=30)
            db.autocommit = False
            logger.info("Connected to PostgreSQL")
            return db
        except Exception as e:
            logger.error(f"Connection attempt {attempt + 1} failed: {e}")
            if attempt < 4:
                time.sleep(2 ** attempt)
    logger.error("All DB connection attempts failed")
    return None

def get_cursor():
    conn = ensure_db()
    if not conn:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def fetchall_dict(cur):
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall()
    return [dict(r) for r in rows]

def fetchone_dict(cur):
    row = cur.fetchone()
    return dict(row) if row else None

def init_db():
    conn = ensure_db()
    if not conn:
        logger.error("Cannot init DB — no connection")
        return
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS family_brackets (
            id SERIAL PRIMARY KEY,
            member_name TEXT NOT NULL,
            picks TEXT NOT NULL DEFAULT '{}',
            tiebreaker INTEGER,
            submitted BOOLEAN NOT NULL DEFAULT FALSE,
            created_at DOUBLE PRECISION NOT NULL,
            updated_at DOUBLE PRECISION NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS family_results (
            id SERIAL PRIMARY KEY,
            results TEXT NOT NULL DEFAULT '{}',
            updated_at DOUBLE PRECISION NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS family_tournament_results (
            game_key TEXT PRIMARY KEY,
            espn_game_id TEXT,
            round INTEGER,
            round_name TEXT,
            region TEXT,
            team1_name TEXT,
            team1_seed INTEGER,
            team1_score INTEGER,
            team2_name TEXT,
            team2_seed INTEGER,
            team2_score INTEGER,
            winner_name TEXT,
            winner_seed INTEGER,
            game_state TEXT DEFAULT 'pre',
            game_date TEXT,
            status_detail TEXT DEFAULT '',
            game_datetime TEXT DEFAULT '',
            updated_at DOUBLE PRECISION
        )
    """)
    cur.execute("SELECT COUNT(*) as c FROM family_results")
    count = cur.fetchone()[0]
    if count == 0:
        cur.execute("INSERT INTO family_results (results, updated_at) VALUES ('{}', %s)", (time.time(),))
    conn.commit()
    cur.close()
    logger.info("Family bracket DB initialized")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Init DB on startup (non-fatal)
try:
    init_db()
except Exception as e:
    logger.error(f"DB init failed (non-fatal): {e}")

# ---- Models ----
class LoginRequest(BaseModel):
    name: str
    password: str

class SaveBracketRequest(BaseModel):
    picks: dict
    tiebreaker: Optional[int] = None

class SubmitBracketRequest(BaseModel):
    picks: dict
    tiebreaker: Optional[int] = None

class UpdateResultsRequest(BaseModel):
    results: dict

# ---- Routes ----

@app.get("/api/members")
def list_members():
    """Return member names only — never expose passwords."""
    return {"members": list(FAMILY_MEMBERS.keys())}

@app.post("/api/login")
def login(req: LoginRequest):
    """Validate name + password. Returns the member name on success."""
    stored_pw = FAMILY_MEMBERS.get(req.name)
    if stored_pw is None:
        raise HTTPException(status_code=401, detail="Unknown member")
    if req.password != stored_pw:
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"ok": True, "member": req.name}

@app.get("/api/brackets")
def list_brackets():
    cur = get_cursor()
    cur.execute("SELECT * FROM family_brackets ORDER BY created_at DESC")
    rows = fetchall_dict(cur)
    cur.close()
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "member_name": r["member_name"],
            "picks": json.loads(r["picks"]) if isinstance(r["picks"], str) else r["picks"],
            "tiebreaker": r["tiebreaker"],
            "submitted": bool(r["submitted"]),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
        })
    return {"brackets": result}

@app.post("/api/brackets")
def create_bracket(member_name: str):
    if member_name not in FAMILY_MEMBERS:
        raise HTTPException(status_code=400, detail="Not a family member")
    now = time.time()
    cur = get_cursor()
    cur.execute(
        "INSERT INTO family_brackets (member_name, picks, tiebreaker, submitted, created_at, updated_at) VALUES (%s, '{}', NULL, FALSE, %s, %s) RETURNING id",
        (member_name, now, now)
    )
    bracket_id = cur.fetchone()["id"]
    db.commit()
    cur.close()
    return {"id": bracket_id}

@app.put("/api/brackets/{bracket_id}")
def save_bracket(bracket_id: int, req: SaveBracketRequest, admin: str = ""):
    cur = get_cursor()
    cur.execute("SELECT * FROM family_brackets WHERE id = %s", (bracket_id,))
    row = fetchone_dict(cur)
    if not row:
        cur.close()
        raise HTTPException(status_code=404, detail="Bracket not found")
    is_admin = admin == ADMIN_PASSWORD
    if row["submitted"] and not is_admin:
        cur.close()
        raise HTTPException(status_code=400, detail="Bracket already locked")
    now = time.time()
    cur.execute(
        "UPDATE family_brackets SET picks = %s, tiebreaker = %s, updated_at = %s WHERE id = %s",
        (json.dumps(req.picks), req.tiebreaker, now, bracket_id)
    )
    db.commit()
    cur.close()
    return {"ok": True}

@app.post("/api/brackets/{bracket_id}/submit")
def submit_bracket(bracket_id: int, req: SubmitBracketRequest):
    cur = get_cursor()
    cur.execute("SELECT * FROM family_brackets WHERE id = %s", (bracket_id,))
    row = fetchone_dict(cur)
    if not row:
        cur.close()
        raise HTTPException(status_code=404, detail="Bracket not found")
    if row["submitted"]:
        cur.close()
        raise HTTPException(status_code=400, detail="Already locked")
    if len(req.picks) < 63:
        cur.close()
        raise HTTPException(status_code=400, detail=f"Need all 63 picks to lock (have {len(req.picks)})")
    now = time.time()
    cur.execute(
        "UPDATE family_brackets SET picks = %s, tiebreaker = %s, submitted = TRUE, updated_at = %s WHERE id = %s",
        (json.dumps(req.picks), req.tiebreaker, now, bracket_id)
    )
    db.commit()
    cur.close()
    return {"ok": True}

@app.delete("/api/brackets/{bracket_id}")
def delete_bracket(bracket_id: int, admin: str = ""):
    if admin != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Admin password required")
    cur = get_cursor()
    cur.execute("DELETE FROM family_brackets WHERE id = %s", (bracket_id,))
    db.commit()
    cur.close()
    return {"ok": True}

@app.post("/api/brackets/{bracket_id}/unlock")
def unlock_bracket(bracket_id: int, admin: str = ""):
    """Admin: unlock a submitted bracket so the owner can edit it again."""
    if admin != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Admin password required")
    cur = get_cursor()
    cur.execute("SELECT * FROM family_brackets WHERE id = %s", (bracket_id,))
    row = fetchone_dict(cur)
    if not row:
        cur.close()
        raise HTTPException(status_code=404, detail="Bracket not found")
    cur.execute("UPDATE family_brackets SET submitted = FALSE, updated_at = %s WHERE id = %s", (time.time(), bracket_id))
    db.commit()
    cur.close()
    return {"ok": True}

# ---- Results & Scoring ----

@app.get("/api/results")
def get_results():
    cur = get_cursor()
    cur.execute("SELECT * FROM family_results ORDER BY id DESC LIMIT 1")
    row = fetchone_dict(cur)
    cur.close()
    results = json.loads(row["results"]) if row and isinstance(row["results"], str) else (row["results"] if row else {})
    return {"results": results}

@app.post("/api/results")
def update_results(req: UpdateResultsRequest, admin: str = ""):
    if admin != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Only Paul can update results")
    cur = get_cursor()
    cur.execute("UPDATE family_results SET results = %s, updated_at = %s", (json.dumps(req.results), time.time()))
    db.commit()
    cur.close()
    return {"ok": True}

# ---- Tournament / ESPN ----
from urllib.request import urlopen, Request as UrlRequest

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
TOURNAMENT_DATES = [
    "20260319", "20260320",  # R1
    "20260321", "20260322",  # R2
    "20260327", "20260328",  # Sweet 16
    "20260329", "20260330",  # Elite 8
    "20260404",              # Final Four
    "20260406",              # Championship
]

ROUND_NAME_MAP = {
    "1st Round": 1,
    "2nd Round": 2,
    "Sweet 16": 3,
    "Elite Eight": 4,
    "Final Four": 5,
    "National Championship": 6,
}

_schedule_cache = {"data": None, "ts": 0}

def fetch_espn_scoreboard(date_str):
    url = f"{ESPN_BASE}?dates={date_str}&groups=100&limit=50"
    try:
        req = UrlRequest(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.error(f"ESPN fetch error for {date_str}: {e}")
        return None

def parse_espn_games(data):
    if not data or "events" not in data:
        return []
    games = []
    for event in data["events"]:
        competitions = event.get("competitions", [])
        if not competitions:
            continue
        comp = competitions[0]
        notes = ""
        for note in comp.get("notes", []):
            notes += note.get("headline", "") + " "
        if "NCAA" not in notes and "NCAA" not in event.get("name", ""):
            continue
        round_num = 0
        round_name = ""
        for rn, rnum in ROUND_NAME_MAP.items():
            if rn.lower() in notes.lower():
                round_num = rnum
                round_name = rn
                break
        if round_num == 0:
            continue
        region = ""
        for reg in ["East", "West", "South", "Midwest"]:
            if reg.lower() in notes.lower():
                region = reg
                break
        competitors = comp.get("competitors", [])
        if len(competitors) < 2:
            continue
        def parse_comp(c):
            team = c.get("team", {})
            name = team.get("shortDisplayName", team.get("displayName", "Unknown"))
            seed = 0
            if "curatedRank" in c and "current" in c["curatedRank"]:
                seed = c["curatedRank"]["current"]
                if seed == 99:
                    seed = 0
            score = int(c.get("score", 0) or 0)
            return name, seed, score
        name1, seed1, score1 = parse_comp(competitors[0])
        name2, seed2, score2 = parse_comp(competitors[1])
        status = comp.get("status", {}).get("type", {})
        state_desc = status.get("description", "Scheduled")
        completed = status.get("completed", False)
        game_state = "final" if completed else ("in" if state_desc == "In Progress" else "pre")
        winner_name = ""
        winner_seed = 0
        if completed:
            if score1 > score2:
                winner_name, winner_seed = name1, seed1
            elif score2 > score1:
                winner_name, winner_seed = name2, seed2
        espn_id = str(event.get("id", ""))
        game_datetime = comp.get("date", "")
        game_date = game_datetime[:10] if game_datetime else ""
        status_detail = comp.get("status", {}).get("type", {}).get("shortDetail", "")
        game_key = f"espn_{espn_id}"
        games.append({
            "game_key": game_key, "espn_game_id": espn_id,
            "round": round_num, "round_name": round_name, "region": region,
            "team1_name": name1, "team1_seed": seed1, "team1_score": score1,
            "team2_name": name2, "team2_seed": seed2, "team2_score": score2,
            "winner_name": winner_name, "winner_seed": winner_seed,
            "game_state": game_state, "game_date": game_date,
            "game_datetime": game_datetime, "status_detail": status_detail,
        })
    return games

@app.get("/api/tournament/results")
def get_tournament_results():
    try:
        cur = get_cursor()
        cur.execute("SELECT * FROM family_tournament_results ORDER BY round, region, game_key")
        rows = fetchall_dict(cur)
        cur.close()
        return {"results": rows}
    except Exception as e:
        logger.error(f"TOURNAMENT_RESULTS ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/admin/tournament/refresh")
def refresh_tournament(admin: str = ""):
    if admin != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        all_games = []
        for date_str in TOURNAMENT_DATES:
            data = fetch_espn_scoreboard(date_str)
            if data:
                games = parse_espn_games(data)
                all_games.extend(games)
        cur = get_cursor()
        now = time.time()
        upserted = 0
        for g in all_games:
            cur.execute("""
                INSERT INTO family_tournament_results
                    (game_key, espn_game_id, round, round_name, region,
                     team1_name, team1_seed, team1_score,
                     team2_name, team2_seed, team2_score,
                     winner_name, winner_seed, game_state, game_date,
                     status_detail, game_datetime, updated_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (game_key) DO UPDATE SET
                    team1_score = EXCLUDED.team1_score,
                    team2_score = EXCLUDED.team2_score,
                    winner_name = EXCLUDED.winner_name,
                    winner_seed = EXCLUDED.winner_seed,
                    game_state = EXCLUDED.game_state,
                    status_detail = EXCLUDED.status_detail,
                    updated_at = EXCLUDED.updated_at
            """, (
                g["game_key"], g["espn_game_id"], g["round"], g["round_name"], g["region"],
                g["team1_name"], g["team1_seed"], g["team1_score"],
                g["team2_name"], g["team2_seed"], g["team2_score"],
                g["winner_name"], g["winner_seed"], g["game_state"], g["game_date"],
                g["status_detail"], g["game_datetime"], now,
            ))
            upserted += 1
        db.commit()
        cur.close()
        logger.info(f"Family tournament refresh: {upserted} games upserted")
        return {"ok": True, "games_upserted": upserted}
    except Exception as e:
        logger.error(f"TOURNAMENT_REFRESH ERROR: {e}")
        try: db.rollback()
        except: pass
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tournament/schedule")
def get_tournament_schedule():
    global _schedule_cache
    now = time.time()
    if _schedule_cache["data"] is not None and now - _schedule_cache["ts"] < 60:
        return _schedule_cache["data"]
    try:
        import datetime
        today = datetime.date.today()
        dates_to_check = []
        for ds in TOURNAMENT_DATES:
            d = datetime.date(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
            if d >= today or d == today - datetime.timedelta(days=1):
                dates_to_check.append(ds)
        today_str = today.strftime("%Y%m%d")
        if today_str not in dates_to_check:
            dates_to_check.insert(0, today_str)
        all_games = []
        for ds in dates_to_check[:3]:
            data = fetch_espn_scoreboard(ds)
            if data:
                games = parse_espn_games(data)
                all_games.extend(games)
        result = {"games": all_games, "fetched_at": now}
        _schedule_cache = {"data": result, "ts": now}
        return result
    except Exception as e:
        logger.error(f"SCHEDULE ERROR: {e}")
        return {"games": [], "fetched_at": now, "error": str(e)}


def score_bracket(picks, all_results):
    """Score a bracket's picks against ESPN tournament results."""
    import re
    bracket_round_to_scoring = {0: 1, 1: 2, 2: 3, 3: 4}
    total = 0
    round_scores = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
    correct_picks = []
    wrong_picks = []
    pending_picks = []
    winners_by_round = {}
    losers_by_round = {}
    for r in all_results:
        rn = r["round"]
        if rn not in winners_by_round:
            winners_by_round[rn] = set()
            losers_by_round[rn] = set()
        if r["winner_name"]:
            winners_by_round[rn].add(r["winner_name"])
            if r["team1_name"] != r["winner_name"]:
                losers_by_round[rn].add(r["team1_name"])
            if r["team2_name"] != r["winner_name"]:
                losers_by_round[rn].add(r["team2_name"])
    for key, pick_str in picks.items():
        if not pick_str:
            continue
        m = re.match(r'^(\d+)\s+(.+)$', pick_str)
        picked_name = m.group(2) if m else pick_str
        scoring_round = 0
        if key.startswith("FF-CHAMP"):
            scoring_round = 6
        elif key.startswith("FF-SF"):
            scoring_round = 5
        else:
            parts = re.match(r'^(.+)-R(\d+)-M(\d+)$', key)
            if parts:
                r_idx = int(parts.group(2))
                scoring_round = bracket_round_to_scoring.get(r_idx, 0)
        if scoring_round == 0:
            continue
        pts = ROUND_POINTS.get(scoring_round, 0)
        round_winners = winners_by_round.get(scoring_round, set())
        round_losers = losers_by_round.get(scoring_round, set())
        if picked_name in round_winners:
            total += pts
            round_scores[scoring_round] += pts
            correct_picks.append(key)
        elif picked_name in round_losers:
            wrong_picks.append(key)
        else:
            pending_picks.append(key)
    return {"total": total, "round_scores": round_scores, "correct_picks": correct_picks, "wrong_picks": wrong_picks, "pending_picks": pending_picks}


@app.get("/api/leaderboard")
def leaderboard():
    """Score all submitted brackets against ESPN results."""
    try:
        cur = get_cursor()
        cur.execute("SELECT * FROM family_brackets WHERE submitted = TRUE")
        brackets = fetchall_dict(cur)
        cur.execute("SELECT * FROM family_tournament_results WHERE game_state = 'final'")
        results = fetchall_dict(cur)
        cur.close()
        champ_combined = None
        for r in results:
            if r["round"] == 6 and r["game_state"] == "final":
                champ_combined = (r["team1_score"] or 0) + (r["team2_score"] or 0)
                break
        entries = []
        for b in brackets:
            picks = json.loads(b["picks"]) if isinstance(b["picks"], str) else b["picks"]
            scored = score_bracket(picks, results)
            tb = b["tiebreaker"]
            tb_diff = abs(tb - champ_combined) if (tb is not None and champ_combined is not None) else None
            entries.append({
                "id": b["id"],
                "member_name": b["member_name"],
                "score": scored["total"],
                "round_scores": scored["round_scores"],
                "tiebreaker": tb,
                "tiebreaker_diff": tb_diff,
                "correct_picks": scored["correct_picks"],
                "wrong_picks": scored["wrong_picks"],
                "pending_picks": scored["pending_picks"],
            })
        entries.sort(key=lambda e: (-e["score"], e["tiebreaker_diff"] if e["tiebreaker_diff"] is not None else 99999))
        for i, e in enumerate(entries):
            e["rank"] = i + 1
        return {
            "leaderboard": entries,
            "championship_combined": champ_combined,
            "games_completed": len(results),
        }
    except Exception as e:
        logger.error(f"LEADERBOARD ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---- Static Files ----
@app.get("/")
def serve_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
