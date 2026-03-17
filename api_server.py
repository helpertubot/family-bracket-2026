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

@app.get("/api/leaderboard")
def leaderboard():
    cur = get_cursor()
    cur.execute("SELECT * FROM family_brackets WHERE submitted = TRUE")
    brackets = fetchall_dict(cur)
    cur.execute("SELECT * FROM family_results ORDER BY id DESC LIMIT 1")
    res_row = fetchone_dict(cur)
    cur.close()
    results = json.loads(res_row["results"]) if res_row and isinstance(res_row["results"], str) else (res_row["results"] if res_row else {})

    board = []
    for b in brackets:
        picks = json.loads(b["picks"]) if isinstance(b["picks"], str) else b["picks"]
        score = 0
        for game_key, picked_team in picks.items():
            if game_key in results and results[game_key] == picked_team:
                rnd = get_round(game_key)
                score += ROUND_POINTS.get(rnd, 0)
        board.append({
            "id": b["id"],
            "member_name": b["member_name"],
            "score": score,
            "tiebreaker": b["tiebreaker"],
        })
    board.sort(key=lambda x: (-x["score"], x["tiebreaker"] or 999))
    return {"leaderboard": board, "results_count": len(results)}

def get_round(game_key: str) -> int:
    """Game keys: Region-R0-M0 through Region-R3-M0, FF-SF1, FF-SF2, FF-CHAMP"""
    import re
    m = re.search(r'-R(\d+)-', game_key)
    if m:
        return int(m.group(1)) + 1  # R0=round1(10pts), R1=round2(20pts), etc.
    if game_key.startswith("FF-SF"):
        return 5  # Final Four = 160 pts
    if game_key == "FF-CHAMP":
        return 6  # Championship = 320 pts
    return 0

# ---- Static Files ----
@app.get("/")
def serve_index():
    return FileResponse("index.html")

app.mount("/", StaticFiles(directory="."), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
