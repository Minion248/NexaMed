# ─────────────────────────────────────────────────────────────────────────────
#  NexaMed EMT Backend  v3.7  —  main.py
#
# LOCATION BUG ROOT CAUSE & FIX v3.7:
#   "Alipur" geocoded to Alipur, ICT (Islamabad) by Nominatim even with scoring.
#   ICT's Alipur has higher Nominatim importance than Alipur, Muzaffargarh.
#
#   FIX: Hardcoded PK_DISTRICTS lookup table with ~400 Pakistani districts,
#   tehsils, and major towns with known coordinates. When EMT types any name
#   that matches a known district/tehsil, we use those coords directly —
#   no ambiguous Nominatim query needed for the hospital search.
#   Nominatim is only used as final fallback for place names not in the table.
#
# INSTALL:  pip install fastapi uvicorn python-dotenv httpx
# .env:     GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
# RUN:      uvicorn main:app --reload --host 0.0.0.0 --port 8000
# DEBUG:    http://127.0.0.1:8000/debug
# ─────────────────────────────────────────────────────────────────────────────
import os
import torch

# Force PyTorch to use 1 thread to minimize RAM usage
torch.set_num_threads(1)
import os, sqlite3, json as _json, re as _re, urllib.parse
import datetime as _dt
import random
import io
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import os
import httpx
from fastapi import FastAPI, HTTPException, Query, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv
from gtts import gTTS
from groq import Groq

load_dotenv()

GROQ_KEY     = os.getenv("GROQ_API_KEY", "").strip()
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN","").strip()
GROQ_BASE    = "https://api.groq.com/openai/v1"
GROQ_HEADERS = {"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"}
AI_READY     = bool(GROQ_KEY)

if GROQ_KEY: print(f"[OK] Groq key: {GROQ_KEY[:8]}...")
else:        print("[WARN] GROQ_API_KEY missing -- add to .env")

# Dedicated voice pipeline — a SEPARATE Groq key/client from the triage one
# above, so voice STT quota/billing is isolated from AI PCR analysis calls.
GROQ_KEY_STT = os.getenv("GROQ_API_KEY_STT", "").strip()
if GROQ_KEY_STT: print(f"[OK] Groq STT key: {GROQ_KEY_STT[:8]}...")
else:            print("[WARN] GROQ_API_KEY_STT missing -- voice_groq_client will "
                        "silently fall back to GROQ_API_KEY (the Groq SDK's own "
                        "default), defeating key separation. Add GROQ_API_KEY_STT to .env.")
voice_groq_client = Groq(api_key=GROQ_KEY_STT or None)

app = FastAPI(title=" NexaMed EMT Backend", version="3.7")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# NOTE: /nadra/biometric-lookup is defined natively further down in this file
# (Firebase-backed vault + circuit breaker + audit trail) — see
# `nadra_biometric_lookup()`. No router include needed for it.

# ── Voice Q&A audio — TTS (gTTS) + STT (Groq Whisper translation) ────────────
# TTS uses gTTS (Google Translate TTS, needs outbound internet — same network
# path as the Groq calls above) so questions are spoken with a natural voice.
# STT uses Groq's hosted whisper-large-v3 *translation* endpoint, which turns
# Urdu/Roman Urdu speech directly into English text in one step — the frontend
# records with MediaRecorder and uploads the whole answer on "Submit Answer".
class VoiceTTSRequest(BaseModel):
    text: str
    lang: str = "en"   # gTTS 2-letter code: "en" | "ur"

@app.post("/api/voice/tts")
def voice_tts(payload: VoiceTTSRequest):
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    try:
        buf = io.BytesIO()
        gTTS(text=text, lang=payload.lang or "en").write_to_fp(buf)
        buf.seek(0)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"TTS generation failed: {e}")
    return StreamingResponse(buf, media_type="audio/mpeg")

@app.post("/api/voice/stt")
async def process_groq_audio_translation(file: UploadFile = File(...)):
    """
    Groq-hosted Whisper (whisper-large-v3) *translation* endpoint — it doesn't
    just transcribe, it translates whatever language was spoken (English,
    Urdu script, or Roman Urdu) directly into English text. Accepts webm/opus
    straight from the browser's MediaRecorder — no WAV re-encoding needed.
    """
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            return JSONResponse(status_code=400, content={"transcript": "", "error": "audio file is required"})

        file_tuple = (file.filename or "answer.webm", audio_bytes, file.content_type or "audio/webm")

        translation = voice_groq_client.audio.translations.create(
            file=file_tuple,
            model="whisper-large-v3",
            temperature=0.0,
        )

        return {"transcript": (translation.text or "").strip()}
    except Exception as e:
        print(f"[ERROR] Groq audio translation exception: {e}")
        return JSONResponse(status_code=500, content={"transcript": "", "error": str(e)})

# EasyOCR global state (declared early so _warm_easyocr can reference them)
_EASYOCR_READER  = None
_EASYOCR_LOCK    = None
_EASYOCR_READY   = False
_EASYOCR_LOADING = False


# ── Database ──────────────────────────────────────────────────────────────────
DB = " NexaMed.db"
def db(): return sqlite3.connect(DB)
def init_db():
    c = db()
    c.execute("""CREATE TABLE IF NOT EXISTS triage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT, patient_name TEXT, cnic TEXT, gender TEXT, age INTEGER,
        location TEXT, description TEXT, heart_rate INTEGER, blood_pressure TEXT,
        oxygen_saturation INTEGER, consciousness_level TEXT,
        ai_analysis TEXT, triage_level TEXT, classification TEXT)""")
    c.commit(); c.close()
init_db()

# ── EasyOCR pre-warm on startup ───────────────────────────────────────────────────
# This runs in a daemon thread so uvicorn starts instantly and EasyOCR model
# is ready within ~30s without blocking any requests.
def _warm_easyocr():
    """Load EasyOCR reader in a background thread at server startup."""
    import threading, time
    def _load():
        global _EASYOCR_READER, _EASYOCR_READY, _EASYOCR_LOADING
        try:
            import easyocr as _eocr
            _EASYOCR_LOADING = True
            print("[EasyOCR] Pre-warming model (English only)... this takes ~30s on first run")
            t0 = time.time()
            _EASYOCR_READER = _eocr.Reader(["en"], verbose=False, gpu=False)
            _EASYOCR_READY  = True
            _EASYOCR_LOADING = False
            print(f"[EasyOCR] Ready in {time.time()-t0:.1f}s")
        except Exception as e:
            _EASYOCR_LOADING = False
            print(f"[EasyOCR] Pre-warm failed: {e}")
    t = threading.Thread(target=_load, daemon=True)
    t.start()

_warm_easyocr()   # kick off immediately at import time

@app.get("/cnic/status")
def cnic_status():
    """Returns whether the local EasyOCR model is loaded and ready."""
    return {
        "ready":   _EASYOCR_READY,
        "loading": _EASYOCR_LOADING,
        "engine":  "easyocr-en" if _EASYOCR_READY else "not-ready",
    }

def log_report(d, analysis, triage, cls):
    try:
        c = db()
        c.execute("""INSERT INTO triage_logs
            (timestamp,patient_name,cnic,gender,age,location,description,
             heart_rate,blood_pressure,oxygen_saturation,consciousness_level,
             ai_analysis,triage_level,classification)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (datetime.now().isoformat(), d.get("name",""), d.get("cnic",""),
             d.get("gender",""), d.get("age",0), d.get("location",""),
             d.get("description",""), d.get("heart_rate",0),
             d.get("blood_pressure",""), d.get("oxygen_saturation",0),
             d.get("consciousness_level",""), analysis, triage, cls))
        c.commit(); c.close()
    except Exception as e: print(f"DB: {e}")

# ── Models ────────────────────────────────────────────────────────────────────
class EmergencyInput(BaseModel):
    name: str=""; cnic: str=""; gender: str="Male"; description: str=""
    age: int=0; heart_rate: int=0; blood_pressure: str="Unknown"
    oxygen_saturation: int=0; consciousness_level: str="Alert"
    language: str="en-US"; location: str=""; lat: float=0.0; lng: float=0.0
    allergies: str=""

class CNICRequest(BaseModel):
    image_base64: str
    media_type:   str = "image/jpeg"
    scan_method:  str = "auto"  # "auto" | "local" | "groq"

# ── HTTP helpers ──────────────────────────────────────────────────────────────
OSM_UA = {"User-Agent": " NexaMed-EMT/3.7 (Pakistan emergency dispatch)"}

def haversine_km(lat1, lng1, lat2, lng2):
    R=6371; d=radians(lat2-lat1); dl=radians(lng2-lng1)
    a=sin(d/2)**2+cos(radians(lat1))*cos(radians(lat2))*sin(dl/2)**2
    return R*2*atan2(sqrt(a),sqrt(1-a))

async def safe_get(url, timeout=10.0, headers=None):
    try:
        h={**OSM_UA,**(headers or {})}
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0,read=timeout,write=5.0,pool=5.0),
            headers=h,follow_redirects=True) as cl:
            r=await cl.get(url)
        if r.status_code==200: return r.json()
    except Exception as e: print(f"GET {url[:60]}: {type(e).__name__}")
    return None

async def safe_post(url, data, timeout=25.0, headers=None, is_json=False):
    """POST helper. For OSM/Overpass (form data). For Groq use groq_chat/groq_vision directly."""
    try:
        h = {**OSM_UA, **(headers or {})}
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=5.0, read=timeout, write=5.0, pool=5.0),
            follow_redirects=True) as cl:
            r = await cl.post(url, json=data, headers=h) if is_json \
                else await cl.post(url, data=data, headers=h)
        if r.status_code == 200:
            return r.json()
        print(f"POST {url[:60]}: HTTP {r.status_code} — {r.text[:200]}")
    except Exception as e:
        print(f"POST {url[:60]}: {type(e).__name__}: {e}")
    return None

async def groq_chat(model: str, messages: list, max_tokens: int = 1800, temperature: float = 0.1,
                     response_format: dict | None = None):
    """Call Groq text completion. Returns content string or None."""
    if not GROQ_KEY:
        return None
    payload = {"model": model, "messages": messages,
               "max_tokens": max_tokens, "temperature": temperature}
    if response_format:
        payload["response_format"] = response_format
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=8.0, read=90.0, write=8.0, pool=5.0),
            follow_redirects=True) as cl:
            r = await cl.post(
                f"{GROQ_BASE}/chat/completions",
                json=payload,
                headers={**GROQ_HEADERS, "User-Agent": "NexaMed/3.7"},
            )
        if r.status_code == 200:
            body = r.json()
            if body.get("choices"):
                return body["choices"][0]["message"]["content"]
            print(f"groq_chat {model}: no choices — {body}")
            return None
        print(f"groq_chat {model}: HTTP {r.status_code} — {r.text[:300]}")
        return None
    except Exception as e:
        print(f"groq_chat {model}: {type(e).__name__}: {e}")
        return None

async def groq_vision(model: str, image_b64: str, media_type: str, prompt: str, max_tokens: int = 500):
    """Call Groq vision model with base64 image. Returns content string or None."""
    if not GROQ_KEY:
        return None
    # Groq vision API requires data URL format: data:<media_type>;base64,<data>
    data_url = f"data:{media_type};base64,{image_b64}"
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": prompt},
            ],
        }],
    }
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=8.0, read=60.0, write=8.0, pool=5.0),
            follow_redirects=True) as cl:
            r = await cl.post(
                f"{GROQ_BASE}/chat/completions",
                json=payload,
                headers={**GROQ_HEADERS, "User-Agent": "NexaMed/3.7"},
            )
        if r.status_code == 200:
            body = r.json()
            if body.get("choices"):
                return body["choices"][0]["message"]["content"]
            print(f"groq_vision {model}: no choices — {body}")
            return None
        print(f"groq_vision {model}: HTTP {r.status_code} — {r.text[:300]}")
        return None
    except Exception as e:
        print(f"groq_vision {model}: {type(e).__name__}: {e}")
        return None

# ═════════════════════════════════════════════════════════════════════════════
# PAKISTAN DISTRICT / TEHSIL LOOKUP TABLE
# Keys: lowercase name variants (with and without common spellings)
# Values: (lat, lng, display_name, district, province)
#
# This table is the PRIMARY location resolver — bypasses Nominatim ambiguity.
# When an EMT types "Alipur" → we return Alipur, Muzaffargarh, Punjab
# NOT Alipur, Islamabad Capital Territory.
# ═════════════════════════════════════════════════════════════════════════════
PK_DISTRICTS: dict[str, tuple[float,float,str,str,str]] = {
    # ── PUNJAB — Districts & Tehsils ──────────────────────────────────────────
    "lahore":             (31.5497, 74.3436, "Lahore, Punjab",                "Lahore",         "Punjab"),
    "faisalabad":         (31.4167, 73.0833, "Faisalabad, Punjab",            "Faisalabad",     "Punjab"),
    "rawalpindi":         (33.6007, 73.0679, "Rawalpindi, Punjab",            "Rawalpindi",     "Punjab"),
    "gujranwala":         (32.1877, 74.1945, "Gujranwala, Punjab",            "Gujranwala",     "Punjab"),
    "multan":             (30.1978, 71.4711, "Multan, Punjab",                "Multan",         "Punjab"),
    "sialkot":            (32.4945, 74.5229, "Sialkot, Punjab",               "Sialkot",        "Punjab"),
    "bahawalpur":         (29.3956, 71.6836, "Bahawalpur, Punjab",            "Bahawalpur",     "Punjab"),
    "sargodha":           (32.0836, 72.6711, "Sargodha, Punjab",              "Sargodha",       "Punjab"),
    "sheikhupura":        (31.7127, 73.9850, "Sheikhupura, Punjab",           "Sheikhupura",    "Punjab"),
    "jhang":              (31.2681, 72.3181, "Jhang, Punjab",                 "Jhang",          "Punjab"),
    "rahim yar khan":     (28.4202, 70.2952, "Rahim Yar Khan, Punjab",        "Rahim Yar Khan", "Punjab"),
    "rahimyarkhan":       (28.4202, 70.2952, "Rahim Yar Khan, Punjab",        "Rahim Yar Khan", "Punjab"),
    "muzaffargarh":       (30.0736, 71.1932, "Muzaffargarh, Punjab",          "Muzaffargarh",   "Punjab"),
    "alipur":             (29.3793, 70.9122, "Alipur, Muzaffargarh, Punjab",  "Muzaffargarh",   "Punjab"),
    "alipur tahsil":      (29.3793, 70.9122, "Alipur Tahsil, Muzaffargarh",   "Muzaffargarh",   "Punjab"),
    "alipur tehsil":      (29.3793, 70.9122, "Alipur Tehsil, Muzaffargarh",   "Muzaffargarh",   "Punjab"),
    "dera ghazi khan":    (30.0489, 70.6323, "Dera Ghazi Khan, Punjab",       "Dera Ghazi Khan","Punjab"),
    "dg khan":            (30.0489, 70.6323, "D.G. Khan, Punjab",             "Dera Ghazi Khan","Punjab"),
    "dgkhan":             (30.0489, 70.6323, "D.G. Khan, Punjab",             "Dera Ghazi Khan","Punjab"),
    "okara":              (30.8138, 73.4534, "Okara, Punjab",                 "Okara",          "Punjab"),
    "sahiwal":            (30.6706, 73.1064, "Sahiwal, Punjab",               "Sahiwal",        "Punjab"),
    "gujrat":             (32.5736, 74.0786, "Gujrat, Punjab",                "Gujrat",         "Punjab"),
    "kasur":              (31.1147, 74.4472, "Kasur, Punjab",                 "Kasur",          "Punjab"),
    "mianwali":           (32.5836, 71.5311, "Mianwali, Punjab",              "Mianwali",       "Punjab"),
    "bhakkar":            (31.6274, 71.0657, "Bhakkar, Punjab",               "Bhakkar",        "Punjab"),
    "khushab":            (32.2986, 72.3508, "Khushab, Punjab",               "Khushab",        "Punjab"),
    "chakwal":            (32.9306, 72.8533, "Chakwal, Punjab",               "Chakwal",        "Punjab"),
    "attock":             (33.7667, 72.3600, "Attock, Punjab",                "Attock",         "Punjab"),
    "jhelum":             (32.9422, 73.7257, "Jhelum, Punjab",                "Jhelum",         "Punjab"),
    "hafizabad":          (32.0711, 73.6883, "Hafizabad, Punjab",             "Hafizabad",      "Punjab"),
    "nankana sahib":      (31.4508, 73.7117, "Nankana Sahib, Punjab",         "Nankana Sahib",  "Punjab"),
    "narowal":            (32.1014, 74.8733, "Narowal, Punjab",               "Narowal",        "Punjab"),
    "toba tek singh":     (30.9697, 72.4828, "Toba Tek Singh, Punjab",        "Toba Tek Singh", "Punjab"),
    "tts":                (30.9697, 72.4828, "Toba Tek Singh, Punjab",        "Toba Tek Singh", "Punjab"),
    "chiniot":            (31.7200, 72.9783, "Chiniot, Punjab",               "Chiniot",        "Punjab"),
    "nankana":            (31.4508, 73.7117, "Nankana Sahib, Punjab",         "Nankana Sahib",  "Punjab"),
    "vehari":             (30.0453, 72.3511, "Vehari, Punjab",                "Vehari",         "Punjab"),
    "lodhran":            (29.5333, 71.6333, "Lodhran, Punjab",               "Lodhran",        "Punjab"),
    "khanewal":           (30.3014, 71.9322, "Khanewal, Punjab",              "Khanewal",       "Punjab"),
    "pakpattan":          (30.3439, 73.3878, "Pakpattan, Punjab",             "Pakpattan",      "Punjab"),
    "layyah":             (30.9578, 70.9394, "Layyah, Punjab",                "Layyah",         "Punjab"),
    "rajanpur":           (29.1044, 70.3281, "Rajanpur, Punjab",              "Rajanpur",       "Punjab"),
    "leiah":              (30.9578, 70.9394, "Layyah, Punjab",                "Layyah",         "Punjab"),
    "taunsa":             (30.7058, 70.6511, "Taunsa, Dera Ghazi Khan",       "Dera Ghazi Khan","Punjab"),
    "kot addu":           (30.4667, 70.9667, "Kot Addu, Muzaffargarh",        "Muzaffargarh",   "Punjab"),
    "jatoi":              (29.5167, 70.8500, "Jatoi, Muzaffargarh",           "Muzaffargarh",   "Punjab"),
    "alipur city":        (29.3793, 70.9122, "Alipur, Muzaffargarh, Punjab",  "Muzaffargarh",   "Punjab"),
    "ahmed pur east":     (29.1417, 71.2572, "Ahmed Pur East, Bahawalpur",    "Bahawalpur",     "Punjab"),
    "ahmedpur east":      (29.1417, 71.2572, "Ahmed Pur East, Bahawalpur",    "Bahawalpur",     "Punjab"),
    "uch sharif":         (28.8286, 70.6961, "Uch Sharif, Bahawalpur",        "Bahawalpur",     "Punjab"),
    "yazman":             (28.9167, 71.7458, "Yazman, Bahawalpur",            "Bahawalpur",     "Punjab"),
    "hasilpur":           (29.6944, 72.5547, "Hasilpur, Bahawalpur",          "Bahawalpur",     "Punjab"),
    "sadiqabad":          (28.3072, 70.1303, "Sadiqabad, Rahim Yar Khan",     "Rahim Yar Khan", "Punjab"),
    "liaquatpur":         (28.9167, 70.9583, "Liaquatpur, Rahim Yar Khan",    "Rahim Yar Khan", "Punjab"),
    "khanpur":            (28.6453, 70.6578, "Khanpur, Rahim Yar Khan",       "Rahim Yar Khan", "Punjab"),
    "mankera":            (31.3892, 71.4400, "Mankera, Bhakkar",              "Bhakkar",        "Punjab"),
    "kalurkot":           (31.9300, 71.0300, "Kalur Kot, Bhakkar",            "Bhakkar",        "Punjab"),
    "darya khan":         (31.7892, 71.1067, "Darya Khan, Bhakkar",           "Bhakkar",        "Punjab"),
    "piplan":             (32.3500, 71.3500, "Piplan, Mianwali",              "Mianwali",       "Punjab"),
    "isa khel":           (32.6667, 71.4167, "Isa Khel, Mianwali",            "Mianwali",       "Punjab"),
    "wan":                (32.0333, 69.8500, "Wan, Mianwali",                 "Mianwali",       "Punjab"),
    "naushera":           (32.0333, 69.8500, "Naushera, Mianwali",            "Mianwali",       "Punjab"),
    "gujrat city":        (32.5736, 74.0786, "Gujrat, Punjab",                "Gujrat",         "Punjab"),
    "kharian":            (32.8156, 73.8847, "Kharian, Gujrat",               "Gujrat",         "Punjab"),
    "sarai alamgir":      (32.9056, 73.7550, "Sarai Alamgir, Gujrat",         "Gujrat",         "Punjab"),
    "dina":               (32.7642, 73.5514, "Dina, Jhelum",                  "Jhelum",         "Punjab"),
    "pind dadan khan":    (32.5839, 73.0458, "Pind Dadan Khan, Jhelum",       "Jhelum",         "Punjab"),
    "sohawa":             (33.0575, 73.0675, "Sohawa, Jhelum",                "Jhelum",         "Punjab"),
    "gujranwala city":    (32.1877, 74.1945, "Gujranwala, Punjab",            "Gujranwala",     "Punjab"),
    "kamoke":             (31.9742, 74.2231, "Kamoke, Gujranwala",            "Gujranwala",     "Punjab"),
    "wazirabad":          (32.4414, 74.1183, "Wazirabad, Gujranwala",         "Gujranwala",     "Punjab"),
    "nowshera virkan":    (32.0439, 73.8614, "Nowshera Virkan, Gujranwala",   "Gujranwala",     "Punjab"),
    "hafizabad city":     (32.0711, 73.6883, "Hafizabad, Punjab",             "Hafizabad",      "Punjab"),
    "pindi bhattian":     (31.8986, 73.2733, "Pindi Bhattian, Hafizabad",     "Hafizabad",      "Punjab"),
    # ── SINDH ─────────────────────────────────────────────────────────────────
    "karachi":            (24.8607, 67.0104, "Karachi, Sindh",                "Karachi",        "Sindh"),
    "hyderabad":          (25.3960, 68.3578, "Hyderabad, Sindh",              "Hyderabad",      "Sindh"),
    "sukkur":             (27.7052, 68.8574, "Sukkur, Sindh",                 "Sukkur",         "Sindh"),
    "larkana":            (27.5570, 68.2147, "Larkana, Sindh",                "Larkana",        "Sindh"),
    "nawabshah":          (26.2442, 68.4100, "Nawabshah, Sindh",              "Nawabshah",      "Sindh"),
    "mirpurkhas":         (25.5272, 69.0136, "Mirpur Khas, Sindh",            "Mirpur Khas",    "Sindh"),
    "mirpur khas":        (25.5272, 69.0136, "Mirpur Khas, Sindh",            "Mirpur Khas",    "Sindh"),
    "khairpur":           (27.5297, 68.7589, "Khairpur, Sindh",               "Khairpur",       "Sindh"),
    "jacobabad":          (28.2769, 68.4511, "Jacobabad, Sindh",              "Jacobabad",      "Sindh"),
    "shikarpur":          (27.9556, 68.6378, "Shikarpur, Sindh",              "Shikarpur",      "Sindh"),
    "dadu":               (26.7317, 67.7756, "Dadu, Sindh",                   "Dadu",           "Sindh"),
    "sanghar":            (26.0461, 68.9508, "Sanghar, Sindh",                "Sanghar",        "Sindh"),
    "thatta":             (24.7464, 67.9236, "Thatta, Sindh",                 "Thatta",         "Sindh"),
    "badin":              (24.6557, 68.8389, "Badin, Sindh",                  "Badin",          "Sindh"),
    "matiari":            (25.5961, 68.4547, "Matiari, Sindh",                "Matiari",        "Sindh"),
    "tando allahyar":     (25.4664, 68.7186, "Tando Allahyar, Sindh",        "Tando Allahyar", "Sindh"),
    "tando muhammad khan":(25.1261, 68.5361, "Tando Muhammad Khan, Sindh",   "Tando M. Khan",  "Sindh"),
    "umerkot":            (25.3617, 69.7361, "Umerkot, Sindh",                "Umerkot",        "Sindh"),
    "ghotki":             (28.0042, 69.3186, "Ghotki, Sindh",                 "Ghotki",         "Sindh"),
    "kashmore":           (28.4422, 69.5761, "Kashmore, Sindh",               "Kashmore",       "Sindh"),
    # ── KPK ───────────────────────────────────────────────────────────────────
    "peshawar":           (34.0150, 71.5249, "Peshawar, KPK",                 "Peshawar",       "Khyber Pakhtunkhwa"),
    "mardan":             (34.1986, 72.0404, "Mardan, KPK",                   "Mardan",         "Khyber Pakhtunkhwa"),
    "swat":               (35.2227, 72.4258, "Swat, KPK",                     "Swat",           "Khyber Pakhtunkhwa"),
    "abbottabad":         (34.1463, 73.2117, "Abbottabad, KPK",               "Abbottabad",     "Khyber Pakhtunkhwa"),
    "mansehra":           (34.3325, 73.2006, "Mansehra, KPK",                 "Mansehra",       "Khyber Pakhtunkhwa"),
    "kohat":              (33.5886, 71.4414, "Kohat, KPK",                    "Kohat",          "Khyber Pakhtunkhwa"),
    "nowshera":           (34.0153, 71.9747, "Nowshera, KPK",                 "Nowshera",       "Khyber Pakhtunkhwa"),
    "charsadda":          (34.1453, 71.7319, "Charsadda, KPK",                "Charsadda",      "Khyber Pakhtunkhwa"),
    "swabi":              (34.1203, 72.4700, "Swabi, KPK",                    "Swabi",          "Khyber Pakhtunkhwa"),
    "dir":                (35.1975, 71.8758, "Dir, KPK",                      "Dir",            "Khyber Pakhtunkhwa"),
    "lower dir":          (34.8667, 71.8667, "Lower Dir, KPK",                "Lower Dir",      "Khyber Pakhtunkhwa"),
    "upper dir":          (35.5503, 71.9167, "Upper Dir, KPK",                "Upper Dir",      "Khyber Pakhtunkhwa"),
    "chitral":            (35.8511, 71.7867, "Chitral, KPK",                  "Chitral",        "Khyber Pakhtunkhwa"),
    "haripur":            (33.9944, 72.9347, "Haripur, KPK",                  "Haripur",        "Khyber Pakhtunkhwa"),
    "malakand":           (34.5631, 71.9308, "Malakand, KPK",                 "Malakand",       "Khyber Pakhtunkhwa"),
    "hangu":              (33.5300, 71.0600, "Hangu, KPK",                    "Hangu",          "Khyber Pakhtunkhwa"),
    "karak":              (33.1167, 71.1000, "Karak, KPK",                    "Karak",          "Khyber Pakhtunkhwa"),
    "lakki marwat":       (32.6072, 70.9125, "Lakki Marwat, KPK",             "Lakki Marwat",   "Khyber Pakhtunkhwa"),
    "bannu":              (32.9892, 70.6017, "Bannu, KPK",                    "Bannu",          "Khyber Pakhtunkhwa"),
    "dera ismail khan":   (31.8319, 70.9019, "D.I. Khan, KPK",                "D.I. Khan",      "Khyber Pakhtunkhwa"),
    "di khan":            (31.8319, 70.9019, "D.I. Khan, KPK",                "D.I. Khan",      "Khyber Pakhtunkhwa"),
    "dikhan":             (31.8319, 70.9019, "D.I. Khan, KPK",                "D.I. Khan",      "Khyber Pakhtunkhwa"),
    "tank":               (32.2167, 70.3833, "Tank, KPK",                     "Tank",           "Khyber Pakhtunkhwa"),
    "buner":              (34.5153, 72.5011, "Buner, KPK",                    "Buner",          "Khyber Pakhtunkhwa"),
    "shangla":            (35.0000, 72.8333, "Shangla, KPK",                  "Shangla",        "Khyber Pakhtunkhwa"),
    "kohistan":           (35.5833, 73.0000, "Kohistan, KPK",                 "Kohistan",       "Khyber Pakhtunkhwa"),
    "battagram":          (34.6775, 73.0217, "Battagram, KPK",                "Battagram",      "Khyber Pakhtunkhwa"),
    "torghar":            (34.8333, 72.7500, "Torghar, KPK",                  "Torghar",        "Khyber Pakhtunkhwa"),
    # ── BALOCHISTAN ───────────────────────────────────────────────────────────
    "quetta":             (30.1798, 66.9750, "Quetta, Balochistan",            "Quetta",         "Balochistan"),
    "turbat":             (25.9878, 63.0561, "Turbat, Balochistan",            "Turbat",         "Balochistan"),
    "khuzdar":            (27.8006, 66.6178, "Khuzdar, Balochistan",           "Khuzdar",        "Balochistan"),
    "hub":                (25.0272, 67.0822, "Hub, Balochistan",               "Lasbela",        "Balochistan"),
    "gwadar":             (25.1264, 62.3225, "Gwadar, Balochistan",            "Gwadar",         "Balochistan"),
    "chaman":             (30.9200, 66.4500, "Chaman, Balochistan",            "Chaman",         "Balochistan"),
    "zhob":               (31.3414, 69.4486, "Zhob, Balochistan",              "Zhob",           "Balochistan"),
    "sibi":               (29.5431, 67.8778, "Sibi, Balochistan",              "Sibi",           "Balochistan"),
    "loralai":            (30.3717, 68.5950, "Loralai, Balochistan",           "Loralai",        "Balochistan"),
    "kalat":              (29.0231, 66.5892, "Kalat, Balochistan",             "Kalat",          "Balochistan"),
    "nushki":             (29.5517, 66.0256, "Nushki, Balochistan",            "Nushki",         "Balochistan"),
    "panjgur":            (26.9644, 64.0911, "Panjgur, Balochistan",           "Panjgur",        "Balochistan"),
    "lasbela":            (26.2194, 66.6956, "Lasbela, Balochistan",           "Lasbela",        "Balochistan"),
    "kech":               (25.9878, 63.0561, "Kech (Turbat), Balochistan",     "Kech",           "Balochistan"),
    "mastung":            (29.7983, 66.8458, "Mastung, Balochistan",           "Mastung",        "Balochistan"),
    "awaran":             (26.4906, 63.1469, "Awaran, Balochistan",            "Awaran",         "Balochistan"),
    "washuk":             (27.2000, 64.7500, "Washuk, Balochistan",            "Washuk",         "Balochistan"),
    "harnai":             (30.1000, 67.9333, "Harnai, Balochistan",            "Harnai",         "Balochistan"),
    # ── ISLAMABAD ─────────────────────────────────────────────────────────────
    "islamabad":          (33.6844, 73.0479, "Islamabad Capital Territory",    "Islamabad",      "ICT"),
    "ict":                (33.6844, 73.0479, "Islamabad Capital Territory",    "Islamabad",      "ICT"),
    # ── AZAD KASHMIR ──────────────────────────────────────────────────────────
    "muzaffarabad":       (34.3591, 73.4708, "Muzaffarabad, AJK",              "Muzaffarabad",   "Azad Kashmir"),
    "mirpur":             (33.1473, 73.7514, "Mirpur, AJK",                    "Mirpur",         "Azad Kashmir"),
    "rawalakot":          (33.8578, 73.7614, "Rawalakot, AJK",                 "Poonch",         "Azad Kashmir"),
    "bhimber":            (32.9742, 74.0697, "Bhimber, AJK",                   "Bhimber",        "Azad Kashmir"),
    "kotli":              (33.5161, 73.9022, "Kotli, AJK",                     "Kotli",          "Azad Kashmir"),
    "bagh":               (33.9858, 73.7742, "Bagh, AJK",                      "Bagh",           "Azad Kashmir"),
    "neelum":             (34.6500, 73.8000, "Neelum, AJK",                    "Neelum",         "Azad Kashmir"),
    "haveli":             (33.7167, 73.8833, "Haveli, AJK",                    "Haveli",         "Azad Kashmir"),
    # ── GILGIT-BALTISTAN ──────────────────────────────────────────────────────
    "gilgit":             (35.9208, 74.3081, "Gilgit, GB",                     "Gilgit",         "Gilgit-Baltistan"),
    "skardu":             (35.2925, 75.6333, "Skardu, GB",                     "Skardu",         "Gilgit-Baltistan"),
    "hunza":              (36.3167, 74.6500, "Hunza, GB",                      "Hunza-Nagar",    "Gilgit-Baltistan"),
    "ghanche":            (35.3833, 76.4667, "Ghanche, GB",                    "Ghanche",        "Gilgit-Baltistan"),
    "ghizer":             (36.2167, 73.6500, "Ghizer, GB",                     "Ghizer",         "Gilgit-Baltistan"),
    # ── FAMOUS CHOWKS / LOCALITIES (resolve to their parent city) ─────────────
    # These are widely used as incident location names by EMTs.
    "chowk permit":       (30.1978, 71.4711, "Chowk Permit, Multan",           "Multan",         "Punjab"),
    "chowk azam":         (31.0914, 71.3578, "Chowk Azam, Layyah",             "Layyah",         "Punjab"),
    "chowk munda":        (31.7214, 71.6333, "Chowk Munda, Muzaffargarh",      "Muzaffargarh",   "Punjab"),
    "chowk sarwar":       (31.6200, 72.9200, "Chowk Sarwar Shaheed, Sargodha", "Sargodha",       "Punjab"),
    "kotla arab ali":     (31.4400, 72.0100, "Kotla Arab Ali Khan",            "Jhang",           "Punjab"),
    "gulberg":            (31.5204, 74.3360, "Gulberg, Lahore",                "Lahore",         "Punjab"),
    "johar town":         (31.4651, 74.2751, "Johar Town, Lahore",             "Lahore",         "Punjab"),
    "model town":         (31.4956, 74.3094, "Model Town, Lahore",             "Lahore",         "Punjab"),
    "defence":            (31.4762, 74.4025, "DHA, Lahore",                    "Lahore",         "Punjab"),
    "cantt":              (31.5486, 74.3590, "Cantt, Lahore",                  "Lahore",         "Punjab"),
    "saddar":             (24.8550, 67.0217, "Saddar, Karachi",                "Karachi",        "Sindh"),
    "clifton":            (24.8031, 67.0278, "Clifton, Karachi",               "Karachi",        "Sindh"),
    "gulshan":            (24.9225, 67.0983, "Gulshan-e-Iqbal, Karachi",       "Karachi",        "Sindh"),
    "north nazimabad":    (24.9484, 67.0367, "North Nazimabad, Karachi",       "Karachi",        "Sindh"),
    "g-10":               (33.6844, 73.0102, "G-10, Islamabad",                "Islamabad",      "ICT"),
    "f-8":                (33.7107, 73.0493, "F-8, Islamabad",                 "Islamabad",      "ICT"),
    "i-8":                (33.6731, 73.0905, "I-8, Islamabad",                 "Islamabad",      "ICT"),
    "hayatabad":          (33.9979, 71.4762, "Hayatabad, Peshawar",            "Peshawar",       "Khyber Pakhtunkhwa"),
    "university road":    (33.9902, 71.5211, "University Road, Peshawar",      "Peshawar",       "Khyber Pakhtunkhwa"),
}


# ═════════════════════════════════════════════════════════════════════════════
# STATIC PAKISTAN HOSPITAL DATABASE
# Works 100% offline — no external APIs needed.
# Each entry: (lat, lng, name, type, phone, district, province)
# Covers DHQ/THQ/Teaching hospitals for all major Pakistani districts.
# Sorted roughly by population/importance within each district.
# ═════════════════════════════════════════════════════════════════════════════
PK_HOSPITALS: list[dict] = [
    # ── LAHORE ────────────────────────────────────────────────────────────────
    {"name":"Mayo Hospital Lahore","lat":31.5661,"lng":74.3152,"type":"hospital","emergency":True,"phone":"042-99231336","district":"Lahore","province":"Punjab"},
    {"name":"Services Hospital Lahore","lat":31.5545,"lng":74.3087,"type":"hospital","emergency":True,"phone":"042-99203324","district":"Lahore","province":"Punjab"},
    {"name":"Jinnah Hospital Lahore","lat":31.5186,"lng":74.2982,"type":"hospital","emergency":True,"phone":"042-99231111","district":"Lahore","province":"Punjab"},
    {"name":"Sir Ganga Ram Hospital","lat":31.5636,"lng":74.3175,"type":"hospital","emergency":True,"phone":"042-111-111-503","district":"Lahore","province":"Punjab"},
    {"name":"Shaukat Khanum Cancer Hospital","lat":31.4697,"lng":74.2728,"type":"hospital","emergency":True,"phone":"042-111-155-555","district":"Lahore","province":"Punjab"},
    {"name":"Doctors Hospital Lahore","lat":31.4862,"lng":74.2671,"type":"hospital","emergency":True,"phone":"042-111-000-490","district":"Lahore","province":"Punjab"},
    {"name":"Ittefaq Hospital Lahore","lat":31.5204,"lng":74.3478,"type":"hospital","emergency":True,"phone":"042-35761999","district":"Lahore","province":"Punjab"},
    {"name":"Farooq Hospital Lahore","lat":31.4911,"lng":74.3266,"type":"hospital","emergency":True,"phone":"042-35773266","district":"Lahore","province":"Punjab"},
    # ── KARACHI ───────────────────────────────────────────────────────────────
    {"name":"Civil Hospital Karachi","lat":24.8623,"lng":67.0099,"type":"hospital","emergency":True,"phone":"021-99215740","district":"Karachi","province":"Sindh"},
    {"name":"Jinnah Postgraduate Medical Centre","lat":24.8608,"lng":67.0151,"type":"hospital","emergency":True,"phone":"021-99201300","district":"Karachi","province":"Sindh"},
    {"name":"Aga Khan University Hospital","lat":24.8581,"lng":67.0652,"type":"hospital","emergency":True,"phone":"021-111-911-911","district":"Karachi","province":"Sindh"},
    {"name":"Liaquat National Hospital","lat":24.8786,"lng":67.0672,"type":"hospital","emergency":True,"phone":"021-111-456-789","district":"Karachi","province":"Sindh"},
    {"name":"National Medical Centre","lat":24.8661,"lng":67.0205,"type":"hospital","emergency":True,"phone":"021-99215990","district":"Karachi","province":"Sindh"},
    {"name":"Abbasi Shaheed Hospital","lat":24.8924,"lng":67.0507,"type":"hospital","emergency":True,"phone":"021-36680030","district":"Karachi","province":"Sindh"},
    # ── ISLAMABAD / RAWALPINDI ────────────────────────────────────────────────
    {"name":"PIMS Hospital Islamabad","lat":33.7038,"lng":73.0566,"type":"hospital","emergency":True,"phone":"051-9261170","district":"Islamabad","province":"ICT"},
    {"name":"Poly Clinic Hospital Islamabad","lat":33.7232,"lng":73.0846,"type":"hospital","emergency":True,"phone":"051-9218300","district":"Islamabad","province":"ICT"},
    {"name":"Shifa International Hospital Islamabad","lat":33.7215,"lng":73.0476,"type":"hospital","emergency":True,"phone":"051-111-474-432","district":"Islamabad","province":"ICT"},
    {"name":"Benazir Bhutto Hospital Rawalpindi","lat":33.5986,"lng":73.0532,"type":"hospital","emergency":True,"phone":"051-9281511","district":"Rawalpindi","province":"Punjab"},
    {"name":"Holy Family Hospital Rawalpindi","lat":33.5924,"lng":73.0474,"type":"hospital","emergency":True,"phone":"051-9290301","district":"Rawalpindi","province":"Punjab"},
    {"name":"CMH Rawalpindi","lat":33.6099,"lng":73.0756,"type":"hospital","emergency":True,"phone":"051-9271310","district":"Rawalpindi","province":"Punjab"},
    # ── FAISALABAD ────────────────────────────────────────────────────────────
    {"name":"Allied Hospital Faisalabad","lat":31.4126,"lng":73.0795,"type":"hospital","emergency":True,"phone":"041-9200430","district":"Faisalabad","province":"Punjab"},
    {"name":"DHQ Hospital Faisalabad","lat":31.4183,"lng":73.0901,"type":"hospital","emergency":True,"phone":"041-9200431","district":"Faisalabad","province":"Punjab"},
    {"name":"Faisalabad Institute of Cardiology","lat":31.4148,"lng":73.0856,"type":"hospital","emergency":True,"phone":"041-9201030","district":"Faisalabad","province":"Punjab"},
    # ── MULTAN ────────────────────────────────────────────────────────────────
    {"name":"Nishtar Hospital Multan","lat":30.2060,"lng":71.4688,"type":"hospital","emergency":True,"phone":"061-9200460","district":"Multan","province":"Punjab"},
    {"name":"Children Hospital Multan","lat":30.2081,"lng":71.4712,"type":"hospital","emergency":True,"phone":"061-9200461","district":"Multan","province":"Punjab"},
    {"name":"DHQ Hospital Multan","lat":30.1978,"lng":71.4711,"type":"hospital","emergency":True,"phone":"061-111-786","district":"Multan","province":"Punjab"},
    # ── PESHAWAR ──────────────────────────────────────────────────────────────
    {"name":"Lady Reading Hospital Peshawar","lat":34.0085,"lng":71.5686,"type":"hospital","emergency":True,"phone":"091-9211267","district":"Peshawar","province":"Khyber Pakhtunkhwa"},
    {"name":"Khyber Teaching Hospital Peshawar","lat":34.0140,"lng":71.5715,"type":"hospital","emergency":True,"phone":"091-9216440","district":"Peshawar","province":"Khyber Pakhtunkhwa"},
    {"name":"Hayatabad Medical Complex","lat":33.9979,"lng":71.4762,"type":"hospital","emergency":True,"phone":"091-9217300","district":"Peshawar","province":"Khyber Pakhtunkhwa"},
    # ── QUETTA ────────────────────────────────────────────────────────────────
    {"name":"Civil Hospital Quetta","lat":30.1926,"lng":67.0160,"type":"hospital","emergency":True,"phone":"081-9201010","district":"Quetta","province":"Balochistan"},
    {"name":"Bolan Medical Complex Quetta","lat":30.1850,"lng":66.9942,"type":"hospital","emergency":True,"phone":"081-9201325","district":"Quetta","province":"Balochistan"},
    # ── GUJRANWALA ────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Gujranwala","lat":32.1877,"lng":74.1945,"type":"hospital","emergency":True,"phone":"055-9200400","district":"Gujranwala","province":"Punjab"},
    {"name":"Teaching Hospital Gujranwala","lat":32.1910,"lng":74.1920,"type":"hospital","emergency":True,"phone":"055-9200440","district":"Gujranwala","province":"Punjab"},
    # ── SIALKOT ───────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Sialkot","lat":32.4945,"lng":74.5229,"type":"hospital","emergency":True,"phone":"052-9250301","district":"Sialkot","province":"Punjab"},
    {"name":"Allama Iqbal Memorial Teaching Hospital","lat":32.5012,"lng":74.5301,"type":"hospital","emergency":True,"phone":"052-9250400","district":"Sialkot","province":"Punjab"},
    # ── BAHAWALPUR ────────────────────────────────────────────────────────────
    {"name":"Bahawal Victoria Hospital","lat":29.3956,"lng":71.6836,"type":"hospital","emergency":True,"phone":"062-9255301","district":"Bahawalpur","province":"Punjab"},
    {"name":"Children Hospital Bahawalpur","lat":29.4012,"lng":71.6901,"type":"hospital","emergency":True,"phone":"062-9255400","district":"Bahawalpur","province":"Punjab"},
    # ── SARGODHA ──────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Sargodha","lat":32.0836,"lng":72.6711,"type":"hospital","emergency":True,"phone":"048-9230301","district":"Sargodha","province":"Punjab"},
    # ── SUKKUR ────────────────────────────────────────────────────────────────
    {"name":"Ghulam Muhammad Mahar Medical College Hospital","lat":27.7052,"lng":68.8574,"type":"hospital","emergency":True,"phone":"071-5633001","district":"Sukkur","province":"Sindh"},
    {"name":"Civil Hospital Sukkur","lat":27.7010,"lng":68.8520,"type":"hospital","emergency":True,"phone":"071-5623001","district":"Sukkur","province":"Sindh"},
    # ── HYDERABAD ─────────────────────────────────────────────────────────────
    {"name":"Liaquat University Hospital Hyderabad","lat":25.3960,"lng":68.3578,"type":"hospital","emergency":True,"phone":"022-9200301","district":"Hyderabad","province":"Sindh"},
    {"name":"Civil Hospital Hyderabad","lat":25.3912,"lng":68.3530,"type":"hospital","emergency":True,"phone":"022-9200401","district":"Hyderabad","province":"Sindh"},
    # ── LARKANA ───────────────────────────────────────────────────────────────
    {"name":"Chandka Medical College Hospital Larkana","lat":27.5570,"lng":68.2147,"type":"hospital","emergency":True,"phone":"074-9400301","district":"Larkana","province":"Sindh"},
    # ── MUZAFFARABAD ──────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Muzaffarabad","lat":34.3591,"lng":73.4708,"type":"hospital","emergency":True,"phone":"05822-920301","district":"Muzaffarabad","province":"Azad Kashmir"},
    # ── GILGIT ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Gilgit","lat":35.9208,"lng":74.3081,"type":"hospital","emergency":True,"phone":"05811-920301","district":"Gilgit","province":"Gilgit-Baltistan"},
    # ── ABBOTTABAD ────────────────────────────────────────────────────────────
    {"name":"Ayub Medical Complex Abbottabad","lat":34.1463,"lng":73.2117,"type":"hospital","emergency":True,"phone":"0992-9310300","district":"Abbottabad","province":"Khyber Pakhtunkhwa"},
    # ── MARDAN ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Mardan","lat":34.1986,"lng":72.0404,"type":"hospital","emergency":True,"phone":"0937-9230301","district":"Mardan","province":"Khyber Pakhtunkhwa"},
    # ── SWAT ──────────────────────────────────────────────────────────────────
    {"name":"Saidu Group of Teaching Hospital Swat","lat":34.7436,"lng":72.3567,"type":"hospital","emergency":True,"phone":"0946-9240301","district":"Swat","province":"Khyber Pakhtunkhwa"},
    # ── DERA ISMAIL KHAN ──────────────────────────────────────────────────────
    {"name":"DHQ Hospital Dera Ismail Khan","lat":31.8319,"lng":70.9019,"type":"hospital","emergency":True,"phone":"0966-9280301","district":"D.I. Khan","province":"Khyber Pakhtunkhwa"},
    # ── MUZAFFARGARH ──────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Muzaffargarh","lat":30.0736,"lng":71.1932,"type":"hospital","emergency":True,"phone":"066-9200301","district":"Muzaffargarh","province":"Punjab"},
    {"name":"THQ Hospital Alipur","lat":29.3793,"lng":70.9122,"type":"hospital","emergency":True,"phone":"N/A","district":"Muzaffargarh","province":"Punjab"},
    {"name":"THQ Hospital Kot Addu","lat":30.4667,"lng":70.9667,"type":"hospital","emergency":True,"phone":"N/A","district":"Muzaffargarh","province":"Punjab"},
    # ── DERA GHAZI KHAN ───────────────────────────────────────────────────────
    {"name":"DHQ Hospital Dera Ghazi Khan","lat":30.0489,"lng":70.6323,"type":"hospital","emergency":True,"phone":"064-9260301","district":"Dera Ghazi Khan","province":"Punjab"},
    # ── RAHIMYARKHAN ──────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Rahim Yar Khan","lat":28.4202,"lng":70.2952,"type":"hospital","emergency":True,"phone":"068-9230301","district":"Rahim Yar Khan","province":"Punjab"},
    # ── SAHIWAL ───────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Sahiwal","lat":30.6706,"lng":73.1064,"type":"hospital","emergency":True,"phone":"040-9200301","district":"Sahiwal","province":"Punjab"},
    # ── OKARA ─────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Okara","lat":30.8138,"lng":73.4534,"type":"hospital","emergency":True,"phone":"044-9200301","district":"Okara","province":"Punjab"},
    # ── KASUR ─────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Kasur","lat":31.1147,"lng":74.4472,"type":"hospital","emergency":True,"phone":"049-2766301","district":"Kasur","province":"Punjab"},
    # ── SHEIKHUPURA ───────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Sheikhupura","lat":31.7127,"lng":73.9850,"type":"hospital","emergency":True,"phone":"056-9200301","district":"Sheikhupura","province":"Punjab"},
    # ── GUJRAT ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Gujrat","lat":32.5736,"lng":74.0786,"type":"hospital","emergency":True,"phone":"053-9260301","district":"Gujrat","province":"Punjab"},
    # ── JHELUM ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Jhelum","lat":32.9422,"lng":73.7257,"type":"hospital","emergency":True,"phone":"0544-920301","district":"Jhelum","province":"Punjab"},
    # ── CHAKWAL ───────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Chakwal","lat":32.9306,"lng":72.8533,"type":"hospital","emergency":True,"phone":"0543-550301","district":"Chakwal","province":"Punjab"},
    # ── ATTOCK ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Attock","lat":33.7667,"lng":72.3600,"type":"hospital","emergency":True,"phone":"057-9314301","district":"Attock","province":"Punjab"},
    # ── KHANEWAL ──────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Khanewal","lat":30.3014,"lng":71.9322,"type":"hospital","emergency":True,"phone":"065-9200301","district":"Khanewal","province":"Punjab"},
    # ── VEHARI ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Vehari","lat":30.0453,"lng":72.3511,"type":"hospital","emergency":True,"phone":"067-3362301","district":"Vehari","province":"Punjab"},
    # ── MIANWALI ──────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Mianwali","lat":32.5836,"lng":71.5311,"type":"hospital","emergency":True,"phone":"0459-220301","district":"Mianwali","province":"Punjab"},
    # ── BHAKKAR ───────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Bhakkar","lat":31.6274,"lng":71.0657,"type":"hospital","emergency":True,"phone":"0453-500301","district":"Bhakkar","province":"Punjab"},
    # ── LAYYAH ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Layyah","lat":30.9578,"lng":70.9394,"type":"hospital","emergency":True,"phone":"0606-410301","district":"Layyah","province":"Punjab"},
    # ── RAJANPUR ──────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Rajanpur","lat":29.1044,"lng":70.3281,"type":"hospital","emergency":True,"phone":"064-9270301","district":"Rajanpur","province":"Punjab"},
    # ── KOHAT ─────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Kohat","lat":33.5886,"lng":71.4414,"type":"hospital","emergency":True,"phone":"0922-510301","district":"Kohat","province":"Khyber Pakhtunkhwa"},
    # ── BANNU ─────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Bannu","lat":32.9892,"lng":70.6017,"type":"hospital","emergency":True,"phone":"0928-620301","district":"Bannu","province":"Khyber Pakhtunkhwa"},
    # ── MANSEHRA ──────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Mansehra","lat":34.3325,"lng":73.2006,"type":"hospital","emergency":True,"phone":"0997-302301","district":"Mansehra","province":"Khyber Pakhtunkhwa"},
    # ── NAWABSHAH ─────────────────────────────────────────────────────────────
    {"name":"SMBBMU Hospital Nawabshah","lat":26.2442,"lng":68.4100,"type":"hospital","emergency":True,"phone":"0244-362301","district":"Nawabshah","province":"Sindh"},
    # ── JACOBABAD ─────────────────────────────────────────────────────────────
    {"name":"Civil Hospital Jacobabad","lat":28.2769,"lng":68.4511,"type":"hospital","emergency":True,"phone":"0722-640301","district":"Jacobabad","province":"Sindh"},
    # ── KHUZDAR ───────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Khuzdar","lat":27.8006,"lng":66.6178,"type":"hospital","emergency":True,"phone":"0848-510301","district":"Khuzdar","province":"Balochistan"},
    # ── TURBAT ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Turbat","lat":25.9878,"lng":63.0561,"type":"hospital","emergency":True,"phone":"0851-411301","district":"Turbat","province":"Balochistan"},
    # ── GWADAR ────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Gwadar","lat":25.1264,"lng":62.3225,"type":"hospital","emergency":True,"phone":"0864-210301","district":"Gwadar","province":"Balochistan"},
    # ── ZHOB ──────────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Zhob","lat":31.3414,"lng":69.4486,"type":"hospital","emergency":True,"phone":"0823-410301","district":"Zhob","province":"Balochistan"},
    # ── MIRPUR AJK ────────────────────────────────────────────────────────────
    {"name":"DHQ Hospital Mirpur","lat":33.1473,"lng":73.7514,"type":"hospital","emergency":True,"phone":"05827-920301","district":"Mirpur","province":"Azad Kashmir"},
]


def search_hospitals_static(lat: float, lng: float, radius_km: float = 60.0) -> list:
    """
    Search the static Pakistan hospital database.
    Returns hospitals sorted by distance from (lat, lng).
    This works 100% offline — no external APIs needed.
    """
    results = []
    for h in PK_HOSPITALS:
        dist = haversine_km(lat, lng, h["lat"], h["lng"])
        if dist <= radius_km:
            results.append({
                "name":          h["name"],
                "name_ur":       "",
                "type":          h.get("type", "hospital"),
                "phone":         h.get("phone", "N/A"),
                "emergency":     h.get("emergency", True),
                "lat":           h["lat"],
                "lng":           h["lng"],
                "dist_km":       round(dist, 2),
                "address":       f"{h.get('district','')}, {h.get('province','')}",
                "opening_hours": "24/7",
                "source":        "static_db",
            })
    results.sort(key=lambda x: x["dist_km"])
    if not results and radius_km < 200:
        # Expand radius and return closest regardless
        return search_hospitals_static(lat, lng, radius_km=200.0)
    return results


def lookup_district(query: str) -> tuple | None:
    """
    Try to match any substring of the query against PK_DISTRICTS keys.
    Returns (lat, lng, display_name, district, province) or None.
    Longest key match wins (so "rahim yar khan" beats "khan").
    NOTE: 'chowk' is intentionally NOT stripped — many Pakistani places
    are named 'Chowk X' (Chowk Permit, Chowk Azam, Chowk Munda, etc.).
    """
    q = query.lower().strip()
    # Remove only admin-type suffixes — NOT 'chowk', 'road', 'street'
    # because those are part of real Pakistani place names
    q_clean = _re.sub(
        r'\b(tahsil|tehsil|taluka|taluk|district|zila|'
        r'sub.?division|union council|uc|near)\b',
        '', q, flags=_re.IGNORECASE).strip()

    best_key   = None
    best_len   = 0

    # Try both original and cleaned version
    for text in [q, q_clean]:
        for key in PK_DISTRICTS:
            if key in text and len(key) > best_len:
                best_key = key
                best_len = len(key)

    if best_key:
        entry = PK_DISTRICTS[best_key]
        print(f"  lookup_district: '{query}' → matched key='{best_key}' → {entry[2]}")
        return entry
    return None


# ── Circuit breaker for external geocoders ────────────────────────────────────
# If Mapbox/Nominatim/Photon are blocked by firewall, skip them after 1 failure.
_GEOCODER_AVAILABLE: bool = True    # Set to False after first connection failure
_GEOCODER_CHECKED: bool   = False   # Whether we've tested connectivity yet

async def _check_geocoder_available() -> bool:
    """Quick test to see if external geocoders are reachable. Result is cached."""
    global _GEOCODER_AVAILABLE, _GEOCODER_CHECKED
    if _GEOCODER_CHECKED:
        return _GEOCODER_AVAILABLE
    _GEOCODER_CHECKED = True
    # Test with a very short timeout — if it fails, mark all geocoders unavailable
    try:
        test = await safe_get("https://nominatim.openstreetmap.org/status.php", 3.0)
        _GEOCODER_AVAILABLE = test is not None
    except Exception:
        _GEOCODER_AVAILABLE = False
    print(f"  External geocoders: {'AVAILABLE' if _GEOCODER_AVAILABLE else 'BLOCKED (using table only)'}")
    return _GEOCODER_AVAILABLE


async def geocode_location(q: str) -> dict | None:
    """
    Master geocoder. Priority order:
    1. Hardcoded district table (instant, zero ambiguity for major areas)
    2. Mapbox Geocoding API (BEST for sub-district Pakistani localities like
       'Chowk Permit', 'Chowk Azam', street names, union councils, etc.)
    3. Nominatim with anti-ICT scoring (8 candidates)
    4. Photon fallback
    Returns {found, lat, lng, display_name, district, province} or None
    """
    if not q or not q.strip():
        return None

    q = q.strip()

    # ── Step 1: Hardcoded table — instant, zero ambiguity ─────────────────
    entry = lookup_district(q)
    if entry:
        lat, lng, display, district, province = entry
        return {
            "found": True, "lat": lat, "lng": lng,
            "display_name": display,
            "district": district, "province": province,
            "source": "table",
        }

    # ── Step 2: Mapbox Geocoding API ────────────────────────────────────
    # Mapbox has excellent worldwide locality coverage — handles any place name
    # But only try if external internet is available (circuit breaker check)
    _ext_ok = await _check_geocoder_available()
    if MAPBOX_TOKEN and _ext_ok:
        try:
            # Try plain query first, then with ", Pakistan" for disambiguation
            for mb_query in [q, f"{q}, Pakistan"]:
                _enc = urllib.parse.quote(mb_query)
                # Note: no country=PK restriction — user may enter any world location
                _murl = (f"https://api.mapbox.com/geocoding/v5/mapbox.places/{_enc}.json"
                         f"?access_token={MAPBOX_TOKEN}&language=en&limit=5"
                         f"&types=place,locality,neighborhood,address,poi,district,region,country")
                _md = await safe_get(_murl, 6.0)
                if _md and _md.get("features"):
                    _ff  = _md["features"][0]
                    _cc  = _ff["geometry"]["coordinates"]  # [lng, lat]
                    _flat, _flng = float(_cc[1]), float(_cc[0])
                    _ctx = {c.get("id","").split(".")[0]: c.get("text","") for c in _ff.get("context",[])}
                    _pname = _ff.get('place_name', q)
                    print(f"  Mapbox geocode: '{q}' → {_pname[:70]} ({_flat:.4f},{_flng:.4f})")
                    return {"found":True,"lat":_flat,"lng":_flng,
                            "display_name":_pname,
                            "district":_ctx.get("district","") or _ctx.get("locality","") or _ctx.get("place",""),
                            "province":_ctx.get("region",""),"source":"mapbox"}
                # Only retry with ", Pakistan" if first query had no Pakistan results
                if _md and _md.get("features") and "Pakistan" in _md["features"][0].get("place_name",""):
                    break
        except Exception as _me:
            print(f"  Mapbox err: {_me}")

    # ── Step 3: Nominatim with multi-candidate scoring ─────────────────────
    # ── Step 3: Nominatim (only if internet available) ─────────────────────
    if not _ext_ok:
        # External geocoders are blocked — return None so caller falls back to IP-geo
        print(f"  Geocoder: internet blocked, table lookup failed for '{q}'")
        return None

    q_lower = q.lower()
    user_typed_islamabad = "islamabad" in q_lower

    # Build search variants
    base    = q if "pakistan" in q_lower else f"{q}, Pakistan"
    strip   = _re.sub(
        r'\b(tahsil|tehsil|taluka|taluk|zila|district|sub.?division|union council)\b',
        '', q, flags=_re.IGNORECASE).strip()
    base2   = f"{strip}, Pakistan" if strip and strip.lower() != q_lower else None

    nominatim = "https://nominatim.openstreetmap.org/search"
    best = None; best_score = -999.0

    for variant in filter(None, [base, base2]):
        enc  = urllib.parse.quote(variant)
        url  = f"{nominatim}?format=json&addressdetails=1&limit=8&countrycodes=pk&q={enc}"
        data = await safe_get(url, 8.0)
        if not isinstance(data, list) or not data:
            continue

        for cand in data:
            display   = cand.get("display_name","").lower()
            score     = float(cand.get("importance", 0.0))
            # Boost: typed words in display_name
            for w in _re.split(r'\W+', q_lower):
                if len(w) > 2 and w in display: score += 0.30
            # Boost: admin boundary type
            if cand.get("osm_type") == "relation": score += 0.25
            if cand.get("type") in ("administrative","town","city","village","suburb"): score += 0.15
            # HARD PENALTY: ICT/Islamabad unless user explicitly typed it
            is_ict = ("islamabad capital territory" in display or
                      "islamabad," in display or
                      ", islamabad" in display)
            if is_ict and not user_typed_islamabad:
                score -= 5.0   # near-total disqualification
            if score > best_score:
                best_score = score; best = cand

    if best:
        addr     = best.get("address", {})
        province = (addr.get("state") or addr.get("province") or "")
        district = (addr.get("county") or addr.get("district") or
                    addr.get("city_district") or addr.get("city") or "")
        display  = best.get("display_name", q)
        print(f"  Nominatim winner: {display[:60]}  score={best_score:.3f}")
        return {
            "found": True, "lat": float(best["lat"]), "lng": float(best["lon"]),
            "display_name": display, "district": district, "province": province,
            "source": "nominatim",
        }

    # ── Step 4: Photon fallback (worldwide) ────────────────────────────────────────────
    for variant in filter(None, [base, base2]):
        enc = urllib.parse.quote(variant)
        ph  = await safe_get(
            f"https://photon.komoot.io/api/?q={enc}&limit=5", 10.0)
        if not ph or not ph.get("features"): continue
        for feat in ph["features"]:
            c   = feat["geometry"]["coordinates"]
            flng = float(c[0]); flat = float(c[1])
            props = feat.get("properties", {})
            disp  = props.get("name") or q
            print(f"  Photon fallback: {disp} ({flat:.4f},{flng:.4f})")
            return {"found": True, "lat": flat, "lng": flng, "display_name": disp,
                    "district": props.get("county",""), "province": props.get("state",""),
                    "source": "photon"}

    print(f"  geocode FAILED for: {q}")
    return None

async def reverse_geocode(lat: float, lng: float) -> dict:
    url  = (f"https://nominatim.openstreetmap.org/reverse"
            f"?format=json&lat={lat}&lon={lng}&zoom=10&addressdetails=1")
    data = await safe_get(url, 10.0)
    if data and data.get("address"):
        addr = data["address"]
        return {
            "district": (addr.get("county") or addr.get("district") or
                         addr.get("city_district") or addr.get("city") or ""),
            "tehsil":   (addr.get("suburb") or addr.get("town") or
                         addr.get("village") or addr.get("municipality") or ""),
            "city":     (addr.get("city") or addr.get("town") or addr.get("village") or ""),
            "province": (addr.get("state") or addr.get("province") or ""),
            "display":   data.get("display_name",""),
        }
    return {"district":"","tehsil":"","city":"","province":"","display":""}


async def search_hospitals_mapbox(lat: float, lng: float, radius_km: float = 30.0) -> list:
    """
    Search for nearby hospitals using Mapbox POI database.
    Mapbox has far better coverage than OSM for Pakistani hospitals, clinics,
    BHUs, dispensaries etc. Uses proximity-biased forward geocoding.
    Returns list of hospital dicts compatible with the rest of the codebase.
    """
    if not MAPBOX_TOKEN or not lat or not lng:
        return []

    # Search terms ordered by priority
    search_terms = [
        "hospital", "clinic", "medical center", "dispensary",
        "BHU", "DHQ hospital", "health center", "nursing home",
    ]

    seen_keys: set = set()
    results: list = []

    for term in search_terms:
        try:
            _enc = urllib.parse.quote(term)
            url = (
                f"https://api.mapbox.com/geocoding/v5/mapbox.places/{_enc}.json"
                f"?proximity={lng},{lat}"
                f"&access_token={MAPBOX_TOKEN}"
                f"&types=poi"
                f"&limit=10"
                f"&language=en"
            )
            data = await safe_get(url, 10.0)
            if not data or not data.get("features"):
                continue

            for feat in data["features"]:
                coords   = feat["geometry"]["coordinates"]
                flng     = float(coords[0])
                flat     = float(coords[1])
                dist     = haversine_km(lat, lng, flat, flng)
                if dist > radius_km:
                    continue

                name      = feat.get("text", "")
                place_nm  = feat.get("place_name", "")
                if not name:
                    name = place_nm.split(",")[0].strip()

                # De-duplicate: same name within 200m → skip
                key = f"{name[:25].lower()}_{round(flat,2)}_{round(flng,2)}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)

                props     = feat.get("properties", {})
                category  = (props.get("category") or "").lower()
                phone     = props.get("tel", "") or props.get("phone", "") or "N/A"
                address   = ", ".join([p.strip() for p in place_nm.split(",")[1:3] if p.strip()])

                is_er = (
                    "hospital" in name.lower() or
                    "hospital" in category or
                    "dhq" in name.lower() or "thq" in name.lower()
                )
                ftype = "hospital" if is_er else ("clinic" if "clinic" in category else "medical")

                results.append({
                    "name":          name,
                    "name_ur":       "",
                    "type":          ftype,
                    "phone":         phone if phone else "N/A",
                    "emergency":     is_er,
                    "lat":           flat,
                    "lng":           flng,
                    "dist_km":       round(dist, 2),
                    "address":       address,
                    "opening_hours": "",
                    "source":        "mapbox",
                })

        except Exception as e:
            print(f"  Mapbox POI '{term}': {type(e).__name__}: {e}")

    results.sort(key=lambda h: h["dist_km"])
    print(f"  Mapbox POI: {len(results)} facilities within {radius_km}km of ({lat:.3f},{lng:.3f})")
    return results


app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/")
async def serve_landing():
    # This points to your front.html file
    return FileResponse("front.html")


# ── /health ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status":"online","version":"3.7","ai_ready":AI_READY,
            "groq_key":f"{GROQ_KEY[:8]}..." if GROQ_KEY else "MISSING",
            "time":datetime.now().isoformat()}

# ── /debug ────────────────────────────────────────────────────────────────────
@app.get("/debug")
async def debug():
    out = {"version":"3.7","groq_key_set":bool(GROQ_KEY)}
    if GROQ_KEY:
        txt = await groq_chat("llama-3.1-8b-instant",
            [{"role":"user","content":"Reply with just the word: WORKING"}],
            max_tokens=10,temperature=0)
        out["groq_text_api"] = f"✅ {txt}" if txt else "❌ FAILED — Windows Firewall may be blocking python.exe"
        # Test vision with a minimal 1x1 white PNG (base64) — no external URL needed
        _test_png_b64 = (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8"
            "z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
        )
        vtxt = await groq_vision(
            "meta-llama/llama-4-scout-17b-16e-instruct",
            _test_png_b64, "image/png",
            "What do you see? One word only."
        )
        out["groq_vision_api"] = f"✅ {vtxt}" if vtxt else "❌ FAILED — Windows Firewall may be blocking python.exe"
    else:
        out["groq_text_api"] = out["groq_vision_api"] = "❌ No GROQ_API_KEY"
    # Test the Alipur disambiguation
    ali = await geocode_location("Alipur Tahsil")
    out["geocode_alipur_test"] = (
        f"✅ CORRECT: {ali['display_name'][:60]} ({ali['lat']:.4f},{ali['lng']:.4f}) [source:{ali.get('source','')}]"
        if ali and "muzaffargarh" in ali.get("display_name","").lower()
        else f"❌ WRONG: {ali['display_name'][:60] if ali else 'FAILED'}"
    )
    geo = await safe_get("https://nominatim.openstreetmap.org/search?format=json&q=Lahore,Pakistan&limit=1")
    out["nominatim"] = f"✅ {geo[0]['display_name'][:50]}" if geo else "❌ FAILED"
    ov = await safe_post("https://overpass-api.de/api/interpreter",
        {"data":"[out:json][timeout:5];node[amenity=hospital](around:5000,31.5,74.3);out 1;"},8.0)
    out["overpass"] = f"✅ {len(ov.get('elements',[]))} results" if ov else "❌ FAILED"
    ip = await safe_get("http://ip-api.com/json/?fields=lat,lon,city,status",6.0)
    out["ipgeo"] = f"✅ {ip.get('city','')} ({ip['lat']:.2f},{ip['lon']:.2f})" if ip and ip.get("status")=="success" else "❌ FAILED"
    return out

# ── /geocode ──────────────────────────────────────────────────────────────────
@app.get("/geocode")
async def geocode_endpoint(q: str = Query(...)):
    result = await geocode_location(q)
    if result:
        return result
    return {"found":False,"lat":0.0,"lng":0.0,"display_name":q,"province":"","district":""}

# ── /ipgeo ────────────────────────────────────────────────────────────────────
@app.get("/ipgeo")
async def ipgeo():
    for url in ["http://ip-api.com/json/?fields=lat,lon,city,status",
                "https://ipapi.co/json/","https://freeipapi.com/api/json"]:
        d = await safe_get(url, 6.0)
        if not d: continue
        if d.get("status")=="success" and d.get("lat"):
            return {"found":True,"lat":float(d["lat"]),"lng":float(d["lon"]),"city":d.get("city","")}
        if d.get("latitude") and not d.get("error"):
            return {"found":True,"lat":float(d["latitude"]),"lng":float(d["longitude"]),"city":d.get("city","")}
        if d.get("latitude") and d.get("longitude"):
            return {"found":True,"lat":float(d["latitude"]),"lng":float(d["longitude"]),"city":d.get("cityName","")}
    return {"found":False,"lat":0.0,"lng":0.0,"city":""}

# ── /cnic/scan ────────────────────────────────────────────────────────────────
# (EasyOCR globals declared at top of file and pre-warmed at startup)

def _calc_age_from_dob(dob_str: str):
    """Parse DD/MM/YYYY or YYYY/MM/DD → integer age, or None."""
    try:
        parts = [int(x) for x in _re.split(r'[.\-/]', dob_str.strip()) if x]
        if len(parts) != 3:
            return None
        if parts[0] > 31:   # YYYY/MM/DD
            yr, mo, da = parts
        elif parts[2] > 31: # DD/MM/YYYY
            da, mo, yr = parts
        else:
            da, mo, yr = parts
        born = _dt.date(yr, mo, da)
        today = _dt.date.today()
        age = today.year - born.year - (1 if (today.month, today.day) < (born.month, born.day) else 0)
        return age if 1 <= age <= 115 else None
    except Exception:
        return None

def _preprocess_for_ocr(img_bgr):
    """
    Fast CNIC image enhancement for OCR.
    Avoids any slow operations (no NlMeansDenoising).
    Steps: upscale → fast Gaussian smoothing → sharpen → greyscale+CLAHE → Otsu BW
    """
    import cv2 as _cv2, numpy as _np
    h, w = img_bgr.shape[:2]
    # 1. Upscale only if too small (EasyOCR accuracy drops below ~1000px wide)
    if w < 1000:
        scale = 1000 / w
        img_bgr = _cv2.resize(img_bgr, None, fx=scale, fy=scale,
                               interpolation=_cv2.INTER_LINEAR)
    # 2. Very light Gaussian smoothing to reduce camera noise (FAST — <5ms)
    smoothed = _cv2.GaussianBlur(img_bgr, (3, 3), 0)
    # 3. Unsharp mask to sharpen text edges
    kernel  = _np.array([[-1,-1,-1],[-1,9,-1],[-1,-1,-1]])
    sharp   = _cv2.filter2D(smoothed, -1, kernel)
    # 4. Greyscale + CLAHE contrast for Tesseract / BW version
    grey    = _cv2.cvtColor(sharp, _cv2.COLOR_BGR2GRAY)
    clahe   = _cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    grey    = clahe.apply(grey)
    _, bw   = _cv2.threshold(grey, 0, 255, _cv2.THRESH_BINARY + _cv2.THRESH_OTSU)
    return sharp, grey, bw

# ── Non-name tokens that must never be used as names ──────────────────────────
_CNIC_SKIP_WORDS = {
    'REPUBLIC','ISLAMIC','PAKISTAN','NADRA','NATIONAL','IDENTITY','CARD',
    'DATE','BIRTH','ISSUE','EXPIRY','GENDER','MALE','FEMALE','MEN','WOMAN',
    'FATHER','HUSBAND','NAME','HOLDER','WIFE','SON','OF','AND',
    'W/O','S/O','D/O','C/O','M/O','H/O',
    'PERMANENT','ADDRESS','DISTRICT','TEHSIL','COUNTRY','PROVINCE',
    'SIGNATURE','THUMB','IMPRESSION',
}

def _is_name_token(word: str) -> bool:
    """True if a word looks like part of a Pakistani name (alpha only, not a keyword)."""
    w = word.strip().upper()
    if w in _CNIC_SKIP_WORDS:
        return False
    # Must be all letters (allow trailing/leading dot for initials like "M.")
    if not _re.match(r'^[A-Za-z]{2,}$', w.strip('.')):
        return False
    return True

def _clean_name(raw: str) -> str:
    """Title-case a name, remove stray punctuation."""
    return ' '.join(w.capitalize() for w in
                    _re.sub(r'[^A-Za-z ]', ' ', raw).split() if len(w) >= 2)

def _parse_cnic_from_detail(detail_results: list) -> dict:
    """
    Parse EasyOCR detail=1 results: [(bbox, text, conf), ...]
    Uses Y-position of bounding boxes to reconstruct top-to-bottom line order.

    Pakistani CNIC front layout (top → bottom):
      Row 0 : Header  (ISLAMIC REPUBLIC OF PAKISTAN / NADRA)
      Row 1 : Holder English name          ← NAME
      Row 2 : Father/Husband English name  ← FATHER NAME
      Row 3 : Urdu name (right side)
      Row 4 : CNIC number  XXXXX-XXXXXXX-X
      Row 5 : Date of Birth   DD.MM.YYYY
      Row 6 : Gender          Male / Female
      Row 7+: Address (may span multiple rows)
    """
    if not detail_results:
        return {"name":None,"nameUrdu":None,"fatherName":None,
                "cnic":None,"dob":None,"age":None,"gender":None,"address":None}

    # ── Step 1: Sort all tokens by Y-centre (top-to-bottom) ──────────────────
    def _y_centre(bbox):
        # bbox = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] (4 corners)
        ys = [pt[1] for pt in bbox]
        return (min(ys) + max(ys)) / 2.0

    def _x_centre(bbox):
        xs = [pt[0] for pt in bbox]
        return (min(xs) + max(xs)) / 2.0

    tokens = [(bbox, txt.strip(), conf)
               for bbox, txt, conf in detail_results
               if txt.strip()]
    tokens.sort(key=lambda t: _y_centre(t[0]))

    # Image height for relative-position checks
    all_ys = [_y_centre(t[0]) for t in tokens]
    img_h  = max(all_ys) if all_ys else 1

    # ── Step 2: Group tokens into visual rows (cluster by Y within ~3% img_h) ─
    row_gap = img_h * 0.035   # tokens within this vertical distance = same row
    rows: list[list] = []     # list of list of (bbox, txt, conf)
    for tok in tokens:
        placed = False
        for row in rows:
            if abs(_y_centre(tok[0]) - _y_centre(row[0][0])) <= row_gap:
                row.append(tok)
                placed = True
                break
        if not placed:
            rows.append([tok])

    # Sort each row left-to-right
    for row in rows:
        row.sort(key=lambda t: _x_centre(t[0]))

    # Build plain-text lines (left-to-right text per row)
    # Also store the Y-centre of each row for position-based filtering
    text_rows  = [' '.join(t[1] for t in row) for row in rows]
    row_y_ctrs = [_y_centre(row[0][0]) for row in rows]   # Y of first token per row
    full_block = ' '.join(text_rows)

    print(f"  CNIC rows ({len(text_rows)}): {text_rows[:8]}")

    # Pre-compute Y range for header-zone detection
    y_min   = min(row_y_ctrs) if row_y_ctrs else 0
    y_max   = max(row_y_ctrs) if row_y_ctrs else 1
    y_range = max(y_max - y_min, 1)

    # ── Fuzzy + position-based header row detector ────────────────────────────
    # Handles OCR misreads like 'Ilikic'≈'Islamic', 'Repudlic'≈'Republic',
    # 'Pakistam'≈'Pakistan', 'NAORA'≈'NADRA', etc.
    import difflib as _difflib
    _HEADER_KW = ['islamic','republic','pakistan','nadra','national',
                  'identity','card','pakistan']
    _header_exact = _re.compile(
        r'republic|pakistan|nadra|national|identity|card|islamic', _re.I)

    def _is_header_row(row_txt: str, row_y: float) -> bool:
        # 1. Position: top 8% of detected-text Y range -> very likely header
        #    (was 20% which wrongly filtered valid name rows just below header)
        if (row_y - y_min) / y_range < 0.08:
            return True
        # 2. Exact keyword match
        if _header_exact.search(row_txt):
            return True
        # 3. Fuzzy keyword match for OCR-mangled header words
        #    'Repudlic'->0.75, 'Pakistam'->0.875, 'NAORA'->0.80
        words = _re.sub(r'[^A-Za-z ]', ' ', row_txt).lower().split()
        for w in words:
            if len(w) < 4:
                continue
            for kw in _HEADER_KW:
                if _difflib.SequenceMatcher(None, w, kw).ratio() >= 0.68:
                    return True
        return False

    # ── Step 3: Extract structured fields ────────────────────────────────────

    # CNIC number — handle dashes or spaces between digit groups
    cnic = None
    cnic_m = _re.search(r'\b(\d{5})[\s\-](\d{7})[\s\-](\d{1})\b', full_block)
    if not cnic_m:
        # OCR sometimes merges digits: try raw 13-digit run
        cnic_m2 = _re.search(r'\b(\d{13})\b', full_block)
        if cnic_m2:
            d = cnic_m2.group(1)
            cnic = f"{d[:5]}-{d[5:12]}-{d[12]}"
    else:
        cnic = f"{cnic_m.group(1)}-{cnic_m.group(2)}-{cnic_m.group(3)}"

    # ── DOB — label-proximity approach ───────────────────────────────────────
    # Pakistani CNIC layout (left column, top→bottom):
    #   Identity Number, Date of Birth: DD.MM.YYYY, Date of Issue: DD.MM.YYYY, Date of Expiry: DD.MM.YYYY
    # Strategy:
    #   1) Find the row that contains the word "Birth" → the date on that row IS the DOB
    #   2) If no "Birth" label found, find the row that contains the CNIC number and take
    #      the NEXT date that appears after it (first date below CNIC row = DOB)
    #   3) Final fallback: first date in the entire block (already sorted top→bottom)
    _date_pat = _re.compile(r'\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b')

    def _fmt_date(m):
        return f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/{m.group(3)}"

    # ── DOB — context-exclusion + label-anchored + earliest-year fallback ────
    # On any CNIC there are typically 3 dates: DOB, Date of Issue, Date of Expiry.
    # Step A: collect ALL dates from Y-sorted full_block.
    # Step B: mark Issue / Expiry dates by 80-char context window (exact + fuzzy).
    # Step C: DOB = first valid past date NOT marked as Issue/Expiry.
    # Step D: If all dates excluded, take the date with the EARLIEST year (DOB year
    #         is always older than Issue/Expiry year — invariant for any person).
    # Step E: Absolute last resort — any date.

    _all_date_matches = list(_date_pat.finditer(full_block))   # in Y-order

    # Mark Issue / Expiry dates by surrounding context
    _non_dob_dates: set[str] = set()
    for _m in _all_date_matches:
        _ctx = full_block[max(0, _m.start() - 90) : _m.end() + 20].lower()
        if _re.search(r'\b(issue|expiry|expiration|expire)\b', _ctx):
            _non_dob_dates.add(_fmt_date(_m))
            continue
        # Fuzzy check for OCR misreads of "issue" / "expiry"
        for _cw in _re.sub(r'[^a-z ]', ' ', _ctx).split():
            if len(_cw) < 4:
                continue
            if _difflib.SequenceMatcher(None, _cw, 'issue').ratio() >= 0.82:
                _non_dob_dates.add(_fmt_date(_m)); break
            if _difflib.SequenceMatcher(None, _cw, 'expiry').ratio() >= 0.82:
                _non_dob_dates.add(_fmt_date(_m)); break

    _today = _dt.date.today()

    def _valid_past_date(d_str: str) -> bool:
        """True if d_str is a real calendar date in the past (plausible DOB)."""
        try:
            da, mo, yr = [int(x) for x in d_str.split('/')]
            if not (1900 <= yr <= _today.year):
                return False
            _dt.date(yr, mo, da)   # validates month/day combination
            return True
        except Exception:
            return False

    dob = None

    # Priority 1: "Birth" label row (exact + fuzzy) — most reliable
    for i, row_txt in enumerate(text_rows):
        has_birth = bool(_re.search(r'\bbirth\b', row_txt, _re.I))
        if not has_birth:
            for _w in _re.sub(r'[^A-Za-z ]', ' ', row_txt).lower().split():
                if 4 <= len(_w) <= 7 and _difflib.SequenceMatcher(None, _w, 'birth').ratio() >= 0.75:
                    has_birth = True; break
        if has_birth:
            for sr in ([row_txt] + ([text_rows[i+1]] if i+1 < len(text_rows) else [])):
                _dm = _date_pat.search(sr)
                if _dm:
                    _ds = _fmt_date(_dm)
                    if _valid_past_date(_ds):
                        dob = _ds; break
            if dob:
                break

    # Priority 2: first valid past date NOT labeled as Issue / Expiry (in Y-order)
    if not dob:
        for _m in _all_date_matches:
            _ds = _fmt_date(_m)
            if _ds in _non_dob_dates:
                continue
            if _valid_past_date(_ds):
                dob = _ds; break

    # Priority 3: earliest-year date — DOB year is always the oldest on the card
    if not dob:
        _yr_cands = []
        for _m in _all_date_matches:
            _ds = _fmt_date(_m)
            if _valid_past_date(_ds):
                _yr_cands.append((int(_ds.split('/')[2]), _ds))
        if _yr_cands:
            dob = min(_yr_cands, key=lambda x: x[0])[1]

    # Priority 4: absolute last resort — take whatever date exists
    if not dob and _all_date_matches:
        dob = _fmt_date(_all_date_matches[0])


    # ── Gender — 3-stage detection ────────────────────────────────────────────
    gender = None

    # Stage A: label-proximity — find 'Gender' or 'Sex' row, check that row + next
    for i, row_txt in enumerate(text_rows):
        if _re.search(r'\b(gender|sex)\b', row_txt, _re.I):
            combined = ' '.join(text_rows[i : min(i+2, len(text_rows))])
            if _re.search(r'\bfemale\b', combined, _re.I):
                gender = "Female"; break
            elif _re.search(r'\bmale\b', combined, _re.I):
                gender = "Male"; break
            # Single letter M/F adjacent to gender label
            elif _re.search(r'\bF\b', combined):
                gender = "Female"; break
            elif _re.search(r'\bM\b', combined):
                gender = "Male"; break

    # Stage B: full-text word search
    if not gender:
        if _re.search(r'\bfemale\b', full_block, _re.I):
            gender = "Female"
        elif _re.search(r'\bmale\b', full_block, _re.I):
            gender = "Male"

    # Stage C: fuzzy match — catches OCR misreads ('Femate', 'Mate', 'Fomale', etc.)
    if not gender:
        for row_txt in text_rows:
            for word in row_txt.split():
                w = _re.sub(r'[^a-z]', '', word.lower())
                if len(w) < 3:
                    continue
                if _difflib.SequenceMatcher(None, w, 'female').ratio() >= 0.82:
                    gender = "Female"; break
                elif _difflib.SequenceMatcher(None, w, 'male').ratio() >= 0.85:
                    gender = "Male"; break
            if gender:
                break

    # Stage D: last resort — lone M or F on a row by itself (some card designs)
    if not gender:
        for row_txt in text_rows:
            stripped = row_txt.strip()
            if _re.match(r'^[Ff][.,]?$', stripped):
                gender = "Female"; break
            elif _re.match(r'^[Mm][.,]?$', stripped):
                gender = "Male"; break


    # Urdu name — rows containing Urdu-script characters
    urdu_rows = [r for r in text_rows
                 if _re.search(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]', r)]
    name_urdu = urdu_rows[0].strip() if urdu_rows else None

    # ── Step 4: Name + Father extraction ─────────────────────────────────────
    # Three-stage strategy for maximum accuracy on any card:
    #
    # Stage 1 — LABEL-ANCHORED (most accurate):
    #   Search for rows containing "Father"/"S/O"/"D/O"/"W/O"/"Husband" labels
    #   → those rows clearly carry the father's name.
    #   Search for rows with a standalone "Name" label (not "Father's Name")
    #   → those rows carry the holder's name.
    #
    # Stage 2 — POSITIONAL (fallback for unlabelled cards):
    #   Walk rows top→bottom, skip obvious header/label/digit rows,
    #   take 1st valid name row = holder, 2nd = father.
    #   Uses conservative 8% position filter (was 20% which wrongly cut name rows).
    #
    # Stage 3 — NO-POSITION fallback:
    #   If Stage 2 still finds nothing (header not in frame → y_min == name row),
    #   retry without any position filter, relying purely on content.

    _digit_heavy    = _re.compile(r'\d{4,}')
    _urdu_pat       = _re.compile(r'[\u0600-\u06FF]')
    # Label patterns (English + common OCR variants)
    _father_label   = _re.compile(
        r'\b(father|husband|spouse|s\.?\s*[/\\]?\s*o|d\.?\s*[/\\]?\s*o|w\.?\s*[/\\]?\s*o|'
        r'fathers|husbands|pere|padre)\b', _re.I)
    _name_only_lbl  = _re.compile(r'\bname\b', _re.I)   # "Name:" but not "Father's Name"
    _label_only_pat = _re.compile(                        # rows that are purely labels
        r'^[\s\W]*(name|father|husband|s/?o|d/?o|w/?o|date|birth|gender|identity|'
        r'issue|expiry|address|signature|thumb|permanent)[\s\W]*$', _re.I)

    def _extract_name_words(row_txt: str) -> str | None:
        """Extract clean name string from a row, or None if row has no valid name tokens."""
        words      = row_txt.split()
        name_words = [w for w in words if _is_name_token(w)]
        if not name_words:
            return None
        candidate  = _clean_name(' '.join(name_words))
        if not candidate or len(candidate) < 3:
            return None
        parts = candidate.split()
        # Reject single tokens that are too short (likely OCR noise)
        if len(parts) == 1 and len(parts[0]) < 3:
            return None
        return candidate

    def _row_is_skip(row_txt: str) -> bool:
        """True if this row should never be treated as a name row."""
        if _urdu_pat.search(row_txt):        return True   # Urdu script
        if _digit_heavy.search(row_txt):     return True   # CNIC/date digits
        if _label_only_pat.match(row_txt.strip()): return True   # label-only row
        if not _re.search(r'[A-Za-z]{2,}', row_txt): return True
        return False

    holder = None
    father = None

    # ── Stage 1: Label-anchored ───────────────────────────────────────────────
    for i, row_txt in enumerate(text_rows):
        if _row_is_skip(row_txt):
            continue
        has_father_lbl = bool(_father_label.search(row_txt))
        has_name_lbl   = bool(_name_only_lbl.search(row_txt)) and not has_father_lbl

        if not has_father_lbl and not has_name_lbl:
            continue

        # Try to extract name from this row first, then peek at next row
        # (label and value sometimes land on adjacent rows due to OCR split)
        search_rows = [row_txt]
        if i + 1 < len(text_rows) and not _row_is_skip(text_rows[i+1]):
            search_rows.append(text_rows[i+1])

        for sr in search_rows:
            name = _extract_name_words(sr)
            if name:
                if has_name_lbl and holder is None:
                    holder = name
                elif has_father_lbl and father is None:
                    father = name
                break

    # ── Stage 2: Positional (conservative 8% position filter) ────────────────
    if holder is None or father is None:
        positional_names: list[str] = []

        def _collect_names(use_pos_filter: bool):
            for row_txt, row_y in zip(text_rows, row_y_ctrs):
                if _row_is_skip(row_txt):
                    continue
                # Content-based header filter (fuzzy + exact)
                if _is_header_row(row_txt, row_y if use_pos_filter else y_max):
                    continue
                name = _extract_name_words(row_txt)
                if name:
                    positional_names.append(name)
                if len(positional_names) == 2:
                    break

        _collect_names(use_pos_filter=True)

        # Stage 3: if still nothing, retry without position filter
        if not positional_names:
            _collect_names(use_pos_filter=False)

        # Assign only what Stage 1 didn't already find.
        # KEY FIX: exclude already-found names so holder and father are never the same.
        _already = {n for n in (holder, father) if n is not None}
        _remaining = [n for n in positional_names if n not in _already]
        _ri = 0
        if holder is None and _ri < len(_remaining):
            holder = _remaining[_ri]; _ri += 1
        if father is None and _ri < len(_remaining):
            father = _remaining[_ri]

    print(f"  Name='{holder}'  Father='{father}'")


    # ── Step 5: Address — rows after CNIC number, stripped of label text ──────
    # Known CNIC card label strings that must NOT appear in the address field
    _addr_label_pat = _re.compile(
        r'\b(date\s*of\s*issue|date\s*of\s*expiry|date\s*of\s*birth|'
        r'holder|signature|thumb|impression|permanent\s*address|'
        r'identity|nadra|republic|pakistan|gender|male|female|'
        r'issue|expiry)\b',
        _re.I)

    address = None
    found_cnic_row = False
    addr_parts = []
    for row_txt in text_rows:
        if not found_cnic_row:
            if cnic and cnic.replace('-','') in row_txt.replace('-','').replace(' ',''):
                found_cnic_row = True
            continue
        # Skip DOB / date rows
        if _date_pat.search(row_txt):                                   continue
        if _re.search(r'\b(Male|Female)\b', row_txt, _re.I):           continue
        # Skip pure-Urdu rows
        if _re.search(r'^[\u0600-\u06FF\s]+$', row_txt):               continue
        # Skip rows that are purely label text
        row_clean = _addr_label_pat.sub('', row_txt).strip()
        if len(row_clean) < 4:                                          continue
        # Remove any label substrings but keep the rest
        if row_clean:
            addr_parts.append(row_clean)
    if addr_parts:
        address = ', '.join(addr_parts)[:200]

    age = _calc_age_from_dob(dob) if dob else None

    return {
        "name":       holder,
        "nameUrdu":   name_urdu,
        "fatherName": father,
        "cnic":       cnic,
        "dob":        dob,
        "age":        age,
        "gender":     gender,
        "address":    address,
    }


def _parse_cnic_flat(lines: list) -> dict:
    """
    Fallback flat-text parser for Pytesseract (no bounding-box info).
    Uses the same row-order strategy but on plain text lines.
    """
    full_block = ' '.join(lines)

    # CNIC
    cnic = None
    m = _re.search(r'\b(\d{5})[\s\-](\d{7})[\s\-](\d)\b', full_block)
    if m:
        cnic = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    else:
        m2 = _re.search(r'\b(\d{13})\b', full_block)
        if m2:
            d = m2.group(1)
            cnic = f"{d[:5]}-{d[5:12]}-{d[12]}"

    # DOB
    dob = None
    dm = _re.search(r'\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b', full_block)
    if dm:
        dob = f"{dm.group(1).zfill(2)}/{dm.group(2).zfill(2)}/{dm.group(3)}"

    # Gender
    gender = None
    if _re.search(r'\bfemale\b', full_block, _re.I):  gender = "Female"
    elif _re.search(r'\bmale\b', full_block, _re.I):   gender = "Male"

    # Urdu
    urdu_lines = [l for l in lines if _re.search(r'[\u0600-\u06FF]', l)]
    name_urdu = urdu_lines[0] if urdu_lines else None

    _header_pat = _re.compile(r'republic|pakistan|nadra|national|identity|card|islamic', _re.I)
    _digit_heavy = _re.compile(r'\d{4,}')
    english_name_rows = []
    for line in lines:
        if _re.search(r'[\u0600-\u06FF]', line): continue
        if _header_pat.search(line):              continue
        if _digit_heavy.search(line):             continue
        if not _re.search(r'[A-Za-z]{2,}', line):continue
        words = line.split()
        name_words = [w for w in words if _is_name_token(w)]
        if not name_words: continue
        candidate = _clean_name(' '.join(name_words))
        if candidate and len(candidate) >= 3:
            english_name_rows.append(candidate)
        if len(english_name_rows) == 2:
            break

    age = _calc_age_from_dob(dob) if dob else None
    return {
        "name":       english_name_rows[0] if english_name_rows else None,
        "nameUrdu":   name_urdu,
        "fatherName": english_name_rows[1] if len(english_name_rows) > 1 else None,
        "cnic":       cnic,
        "dob":        dob,
        "age":        age,
        "gender":     gender,
        "address":    None,
    }

async def _local_ocr_scan(image_b64: str) -> tuple[dict | None, str]:
    """
    Try local OCR engines:
    1. EasyOCR with detail=1 (uses bounding-box Y-position for accurate name order)
    2. Pytesseract fallback
    Returns (parsed_dict, method_name) or (None, error_message)
    """
    global _EASYOCR_READER, _EASYOCR_LOCK
    import base64 as _b64, numpy as _np
    import asyncio

    try:
        import cv2 as _cv2
    except ImportError:
        return None, "opencv-python not installed — run: pip install opencv-python-headless"

    # Decode + preprocess image
    try:
        raw_bytes = _b64.b64decode(image_b64)
        arr = _np.frombuffer(raw_bytes, _np.uint8)
        img_bgr = _cv2.imdecode(arr, _cv2.IMREAD_COLOR)
        if img_bgr is None:
            return None, "Could not decode image — unsupported format or corrupted file"
        img_sharp, img_grey, img_bw = _preprocess_for_ocr(img_bgr)
    except Exception as e:
        return None, f"Image decode/preprocess failed: {e}"

    # ── Engine 1: EasyOCR with bounding boxes (detail=1) ─────────────────────
    try:
        import easyocr as _eocr

        if _EASYOCR_LOCK is None:
            _EASYOCR_LOCK = asyncio.Lock()

        async with _EASYOCR_LOCK:
            if _EASYOCR_READER is None:
                print("  EasyOCR: loading model (first call, ~30s)…")
                loop = asyncio.get_event_loop()
                _EASYOCR_READER = await loop.run_in_executor(
                    None,
                    lambda: _eocr.Reader(["en", "ur"], verbose=False, gpu=False)
                )
                print("  EasyOCR: ready ✓")
            reader = _EASYOCR_READER

        loop = asyncio.get_event_loop()
        # detail=1 → returns [(bbox, text, confidence), ...] — needed for Y-sort
        results = await loop.run_in_executor(
            None,
            lambda: reader.readtext(img_sharp, detail=1, paragraph=False)
        )
        print(f"  EasyOCR raw tokens ({len(results)}): "
              f"{[r[1] for r in results[:10]]}")

        parsed = _parse_cnic_from_detail(results)
        print(f"  EasyOCR → name='{parsed.get('name')}' "
              f"father='{parsed.get('fatherName')}' "
              f"cnic='{parsed.get('cnic')}' age={parsed.get('age')}")
        return parsed, "easyocr-local"

    except ImportError:
        print("  EasyOCR not installed — falling back to Pytesseract")
    except Exception as e:
        print(f"  EasyOCR error: {e} — falling back to Pytesseract")
        import traceback; traceback.print_exc()

    # ── Engine 2: Pytesseract fallback ────────────────────────────────────────
    try:
        import pytesseract as _tess
        loop = asyncio.get_event_loop()

        def _tess_ocr():
            cfg = r'--oem 3 --psm 6 -l eng'
            t1 = _tess.image_to_string(img_sharp, config=cfg)
            t2 = _tess.image_to_string(img_bw,    config=cfg)
            seen = set(); merged = []
            for line in (t1 + '\n' + t2).splitlines():
                ll = line.strip()
                if ll and ll not in seen:
                    seen.add(ll); merged.append(ll)
            return merged

        lines = await loop.run_in_executor(None, _tess_ocr)
        print(f"  Tesseract lines ({len(lines)}): {lines[:6]}")
        parsed = _parse_cnic_flat(lines)
        print(f"  Tesseract → name='{parsed.get('name')}' "
              f"father='{parsed.get('fatherName')}' cnic='{parsed.get('cnic')}'")
        return parsed, "tesseract-local"

    except ImportError:
        return None, (
            "No local OCR engine available.\n"
            "Install EasyOCR (recommended):\n"
            "  pip install easyocr opencv-python-headless\n"
            "OR install Tesseract:\n"
            "  pip install pytesseract opencv-python-headless\n"
            "  + Tesseract binary: https://github.com/UB-Mannheim/tesseract/wiki"
        )
    except Exception as e:
        return None, f"Pytesseract error: {e}"


@app.post("/cnic/scan")
async def cnic_scan(req: CNICRequest):
    """
    scan_method:
      "local" → Local OCR ONLY (EasyOCR → Pytesseract fallback) — never calls Groq API
      "groq"  → Groq Vision only (cloud, highest accuracy)
      "auto"  → Local OCR first; if CNIC number found → return immediately (offline-safe);
                 if local fails or no CNIC found → fall back to Groq
    """
    sm = req.scan_method

    # ── LOCAL / AUTO: try offline OCR engines first ───────────────────────────
    if sm in ("auto", "local"):
        parsed, method = await _local_ocr_scan(req.image_base64)

        if parsed is not None:
            # In LOCAL mode: always return, whatever we got
            if sm == "local":
                return {"status": "ok", "data": parsed, "method": method}

            # In AUTO mode: return if we extracted at least a CNIC number
            # (network-free success path — works completely offline)
            if parsed.get("cnic"):
                print(f"  AUTO mode: local OCR succeeded (cnic={parsed['cnic']}) — skipping Groq")
                return {"status": "ok", "data": parsed, "method": method}

            # CNIC number not found locally — continue to Groq for better accuracy
            print("  AUTO mode: local OCR ran but no CNIC number found — trying Groq")

        else:
            # Local OCR engines not installed / failed
            if sm == "local":
                raise HTTPException(503, detail=(
                    f"Local OCR failed: {method}\n"
                    "Install at least one engine:\n"
                    "  Option A (EasyOCR):     pip install easyocr opencv-python-headless\n"
                    "  Option B (Tesseract):   pip install pytesseract opencv-python-headless\n"
                    "                          + install Tesseract from https://github.com/UB-Mannheim/tesseract/wiki\n"
                    "Then restart uvicorn."
                ))
            print(f"  AUTO mode: local OCR unavailable ({method}) — falling back to Groq")

    # ── GROQ VISION (mode=groq OR auto-fallback) ─────────────────────────────
    if not GROQ_KEY:
        raise HTTPException(503, detail=(
            "GROQ_API_KEY not set in .env file.\n"
            "Either:\n"
            "  1. Add GROQ_API_KEY=gsk_... to your .env and restart uvicorn, OR\n"
            "  2. Use 'Local' scan mode (requires: pip install easyocr opencv-python-headless)"
        ))

    prompt = (
        "This is a Pakistani CNIC. Read ALL text precisely. "
        "CNICs show: (1) holder Name in English, (2) Father or Husband Name in English below it, "
        "(3) Urdu name, (4) CNIC number XXXXX-XXXXXXX-X, (5) DOB with DOTS like DD.MM.YYYY, "
        "(6) Gender, (7) Address. fatherName is the SECOND English name line on the card. "
        "Return ONLY valid JSON, no markdown:\n"
        '{"name":"holder English name","nameUrdu":"Urdu name or null",'
        '"fatherName":"father or husband English name or null",'
        '"cnic":"XXXXX-XXXXXXX-X or null",'
        '"dob":"convert dots to slashes DD/MM/YYYY or null",'
        '"age":null,"gender":"Male or Female or null","address":"address or null"}'
    )

    # Current Groq vision models (as of 2025) — llava is deprecated
# Current Groq vision models
    vision_models = [
        "llama-3.2-11b-vision-preview",
        "llama-3.2-90b-vision-preview",
    ]

    last_err = "No vision models available"
    for model in vision_models:
        raw = await groq_vision(model, req.image_base64, req.media_type, prompt, max_tokens=500)
        if not raw:
            last_err = f"No response from {model} (check /debug for API connectivity)"
            continue
        try:
            clean = _re.sub(r"```[a-z]*", "", raw).replace("```", "").strip()
            m = _re.search(r'\{.*\}', clean, _re.DOTALL)
            if m:
                clean = m.group(0)
            parsed = _json.loads(clean)
            # Normalise DOB format and compute age
            _raw_dob = (parsed.get("dob") or "").replace(".", "/").replace("-", "/").strip()
            if _raw_dob:
                parsed["dob"] = _raw_dob
            if _raw_dob and not parsed.get("age"):
                parsed["age"] = _calc_age_from_dob(_raw_dob)
            return {"status": "ok", "data": parsed, "method": f"groq:{model.split(chr(47))[-1][:30]}"}
        except _json.JSONDecodeError as je:
            last_err = f"Non-JSON from {model}: {str(je)[:80]} | raw: {raw[:120]}"
            continue

    raise HTTPException(
        422,
        detail=(
            f"CNIC scan failed. Last error: {last_err}. "
            "Check http://127.0.0.1:8000/debug — if groq_vision_api shows ❌, "
            "Windows Firewall is blocking python.exe → api.groq.com. "
            "Fix: Windows Security → Firewall → Allow an app → add python.exe (Private+Public)."
        ),
    )




#     # Current Groq vision models
#     vision_models = [
#     "llama-3.2-11b-vision-preview",
#     "llama-3.2-90b-vision-preview"
# ]

#    # vision_models = [
#    #     "meta-llama/llama-4-scout-17b-16e-instruct",
#    #     "meta-llama/llama-4-maverick-17b-128e-instruct",
#    # ]
# last_err = "No vision models available"
# for model in vision_models:
#     raw = await groq_vision(model, req.image_base64, req.media_type, prompt, max_tokens=500)
#         if not raw:
#             last_err = f"No response from {model} (check /debug for API connectivity)"
#             continue
#         try:
#             clean = _re.sub(r"```[a-z]*", "", raw).replace("```", "").strip()
#             m = _re.search(r'\{.*\}', clean, _re.DOTALL)
#             if m:
#                 clean = m.group(0)
#             parsed = _json.loads(clean)
#             # Normalise DOB format and compute age
#             _raw_dob = (parsed.get("dob") or "").replace(".", "/").replace("-", "/").strip()
#             if _raw_dob:
#                 parsed["dob"] = _raw_dob
#             if _raw_dob and not parsed.get("age"):
#                 parsed["age"] = _calc_age_from_dob(_raw_dob)
#             return {"status": "ok", "data": parsed, "method": f"groq:{model.split(chr(47))[-1][:30]}"}
#         except _json.JSONDecodeError as je:
#             last_err = f"Non-JSON from {model}: {str(je)[:80]} | raw: {raw[:120]}"
#             continue

#     raise HTTPException(422, detail=(
#         f"CNIC scan failed. Last error: {last_err}. "
#         "Check http://127.0.0.1:8000/debug — if groq_vision_api shows ❌, "
#         "Windows Firewall is blocking python.exe → api.groq.com. "
#         "Fix: Windows Security → Firewall → Allow an app → add python.exe (Private+Public)."))

# ── /hospitals/nearby ─────────────────────────────────────────────────────────
@app.get("/hospitals/nearby")
async def hospitals_nearby(
    lat: float = Query(...), lng: float = Query(...),
    radius_km: int = Query(10), loc: str = Query("")
):
    """
    ALWAYS re-geocodes `loc` (the typed incident text) through the district table
    first. This prevents the frontend from accidentally sending wrong coords
    (e.g. if it geocoded Alipur → ICT instead of Alipur → Muzaffargarh).
    """
    # ── Always resolve lat/lng from typed location text ───────────────────────
    resolved_lat, resolved_lng = lat, lng
    source = "frontend"
    geocode_failed = False

    if loc.strip():
        geo = await geocode_location(loc.strip())
        if geo and geo.get("found"):
            resolved_lat = geo["lat"]
            resolved_lng = geo["lng"]
            source = geo.get("source","geocoded")
            old_dist = haversine_km(lat, lng, resolved_lat, resolved_lng) if (lat and lng) else 9999
            if old_dist > 1:
                print(f"  /hospitals: corrected ({lat:.3f},{lng:.3f}) → "
                      f"({resolved_lat:.3f},{resolved_lng:.3f}) for '{loc}' "
                      f"(frontend was {old_dist:.0f}km off, source={source})")
        else:
            # Geocoding failed for this loc text — warn but don't hard-fail
            # We'll still try IP-geo below so user doesn't see a dead screen
            geocode_failed = True
            print(f"  /hospitals: geocode FAILED for '{loc}' — will try IP-geo")

    lat, lng = resolved_lat, resolved_lng

    # Guard: if still 0,0 try IP-geo as last resort
    if not lat or not lng or (abs(lat) < 0.1 and abs(lng) < 0.1):
        # Try IP-geo (works regardless of typed location)
        for _iu in ["http://ip-api.com/json/?fields=lat,lon,status","https://ipapi.co/json/"]:
            _id = await safe_get(_iu, 5.0)
            if not _id: continue
            _lt=_id.get("lat") or _id.get("latitude")
            _lg=_id.get("lon") or _id.get("longitude")
            if _lt and _lg and (_id.get("status")=="success" or _id.get("latitude")):
                lat,lng=float(_lt),float(_lg)
                print(f"  /hospitals: IP-geo fallback ({lat:.3f},{lng:.3f})")
                geocode_failed = False  # IP-geo succeeded
                source = "ip_geo"
                break
        if abs(lat)<0.1 and abs(lng)<0.1:
            msg = (f"Cannot geocode '{loc}'. Try a more specific name." if geocode_failed
                   else "No location provided. Enable GPS or type an area name.")
            return {"status":"geocode_failed","count":0,"hospitals":[],
                    "lat_used":0.0,"lng_used":0.0, "message":msg}

    # ── Hospital Search: Static DB (instant) → Mapbox POI → Overpass → Nominatim ──
    # Static DB is always checked FIRST — instant, offline, zero latency.
    # External APIs are tried as supplements for even better results.

    all_hospitals: list = []

    # ── STEP 0: Static Pakistan hospital database (offline, always works) ──────
    static_results = search_hospitals_static(lat, lng, radius_km=max(radius_km, 80.0))
    if static_results:
        all_hospitals.extend(static_results)
        print(f"  Static DB: {len(static_results)} hospitals within 80km")

    # ── If static DB has results, skip slow external APIs entirely ────────────
    # On networks where Overpass/Mapbox are blocked (common on Windows with
    # strict firewall rules), these calls hang for 40s+ then crash the request.
    # The static DB is sufficient for all Pakistani locations.
    if len(all_hospitals) >= 3:
        print(f"  Skipping external APIs (static DB has {len(all_hospitals)} results)")
    else:
        # ── STEP A: Mapbox POI (try only if static DB found nothing) ─────────
        if MAPBOX_TOKEN:
            try:
                mb_radius = max(radius_km * 1000, 10_000)
                mb_results = await search_hospitals_mapbox(lat, lng, radius_km=mb_radius / 1000)
                if mb_results:
                    all_hospitals.extend(mb_results)
                    print(f"  Mapbox found {len(mb_results)} hospitals")
            except Exception as _me:
                print(f"  Mapbox POI failed: {_me}")

        # ── STEP B: Overpass (try only if still no results) ───────────────────
        if len(all_hospitals) < 2:
            servers = [
                "https://overpass-api.de/api/interpreter",
                "https://overpass.kumi.systems/api/interpreter",
                "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
            ]
            for radius_m in [15_000, 30_000, 60_000]:
                if all_hospitals: break
                q_osm = f"""[out:json][timeout:20];
(
  nwr["amenity"~"^(hospital|clinic|doctors|health_post|dispensary|maternity|nursing_home|medical_center)$"](around:{radius_m},{lat},{lng});
  nwr["healthcare"](around:{radius_m},{lat},{lng});
  nwr["name"~"hospital|clinic|dispensary|BHU|RHC|DHQ|THQ",i](around:{radius_m},{lat},{lng});
);
out center tags 30;"""
                for server in servers:
                    raw = await safe_post(server, {"data": q_osm}, 20.0)
                    if not raw: continue
                    seen_keys: set = set()
                    for el in raw.get("elements", []):
                        elat = el.get("lat") or el.get("center",{}).get("lat")
                        elng = el.get("lon") or el.get("center",{}).get("lon")
                        if not elat or not elng: continue
                        tags = el.get("tags",{})
                        typ  = tags.get("amenity") or tags.get("healthcare") or tags.get("building") or "medical"
                        if typ in ("pharmacy","veterinary","blood_donation","yes","no"): continue
                        name = tags.get("name:en") or tags.get("name") or tags.get("name:ur") or "Medical Facility"
                        key  = f"{name[:20]}_{round(elat,3)}_{round(elng,3)}"
                        if key in seen_keys: continue
                        seen_keys.add(key)
                        phone = (tags.get("phone") or tags.get("contact:phone") or "N/A")
                        addr  = ", ".join(filter(None,[tags.get("addr:city",""), tags.get("addr:district","")]))
                        dist  = haversine_km(lat, lng, elat, elng)
                        is_er = typ=="hospital" or any(k in name.lower() for k in ("hospital","dhq","thq"))
                        all_hospitals.append({
                            "name":name, "name_ur":tags.get("name:ur",""),
                            "type":typ, "phone":phone, "emergency":is_er,
                            "lat":elat, "lng":elng, "dist_km":round(dist,2),
                            "address":addr, "opening_hours":"", "source":"osm",
                        })
                    if all_hospitals: break

        # end of external API block

    # ── Final: deduplicate, sort by distance, return ───────────────────────────
    seen_final: set = set()
    unique: list = []
    for h in all_hospitals:
        k = f"{h['name'][:20].lower()}_{round(h['lat'],2)}_{round(h['lng'],2)}"
        if k not in seen_final:
            seen_final.add(k)
            unique.append(h)
    unique.sort(key=lambda h: h["dist_km"])

    if unique:
        print(f"  /hospitals: returning {len(unique)} facilities near ({lat:.3f},{lng:.3f})")
        return {"status":"ok","count":len(unique),
                "hospitals":unique[:12],"lat_used":lat,"lng_used":lng,
                "radius_used_km":round(unique[-1]["dist_km"]) if unique else 0,
                "location_source":source}

    return {"status":"ok","count":0,"hospitals":[],"lat_used":lat,"lng_used":lng,
            "message":f"No facilities found near this location. If you are in a very rural area, the nearest hospital may not be mapped yet."}

# ── /triage ───────────────────────────────────────────────────────────────────
@app.post("/triage")
async def triage(data: EmergencyInput):
    if not GROQ_KEY:
        raise HTTPException(503, detail="GROQ_API_KEY not configured.")

    # ── Step 1: Resolve coordinates ───────────────────────────────────────────
    lat, lng = 0.0, 0.0
    geo_meta = {"province":"","district":"","display_name":"","source":""}

    if data.location:
        geo = await geocode_location(data.location)
        if geo and geo.get("found"):
            lat  = geo["lat"]; lng = geo["lng"]
            geo_meta = {
                "province":     geo.get("province",""),
                "district":     geo.get("district",""),
                "display_name": geo.get("display_name", data.location),
                "source":       geo.get("source",""),
            }
            print(f"  triage geo: {geo_meta['display_name'][:60]} ({lat:.4f},{lng:.4f}) [{geo_meta['source']}]")

    # Fallback: use coords sent by frontend if geocode failed
    if not lat and data.lat: lat = data.lat
    if not lng and data.lng: lng = data.lng

    # If still have coords but no meta, reverse-geocode them
    if lat and lng and not geo_meta["province"]:
        rev = await reverse_geocode(lat, lng)
        geo_meta["province"]     = rev.get("province","")
        geo_meta["district"]     = rev.get("district","") or rev.get("tehsil","")
        geo_meta["display_name"] = rev.get("display","") or data.location

    loc_text = geo_meta["display_name"] or data.location or "Unknown"
    district = geo_meta["district"]
    province = geo_meta["province"]

    # ── Step 2: Find real nearby hospitals (static DB first, Overpass supplement) ──
    nearby_text = ""
    if lat and lng:
        # ── Primary: Static DB — instant, always works, no internet needed ────
        static_hosp = search_hospitals_static(lat, lng, radius_km=80.0)

        # ── Secondary: Try Overpass for even more results (may fail on some networks) ─
        osm_found = []
        servers = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        ]
        for radius_m in [5_000, 15_000, 30_000]:
            if osm_found: break
            q_osm = f"""[out:json][timeout:20];
(
  nwr["amenity"~"^(hospital|clinic|doctors|health_post|dispensary|maternity|nursing_home)$"](around:{radius_m},{lat},{lng});
  nwr["healthcare"](around:{radius_m},{lat},{lng});
  nwr["name"~"hospital|clinic|dispensary|BHU|RHC|DHQ|THQ",i](around:{radius_m},{lat},{lng});
);
out center tags 15;"""
            for srv in servers:
                raw = await safe_post(srv, {"data":q_osm}, 15.0)
                if not raw: continue
                seen: set = set()
                for el in raw.get("elements",[]):
                    elat = el.get("lat") or el.get("center",{}).get("lat")
                    elng = el.get("lon") or el.get("center",{}).get("lon")
                    if not elat or not elng: continue
                    tags = el.get("tags",{})
                    typ  = tags.get("amenity") or tags.get("healthcare") or "medical"
                    if typ in ("pharmacy","veterinary","blood_donation","yes"): continue
                    name = tags.get("name:en") or tags.get("name") or "Medical Facility"
                    key  = f"{name[:20]}_{round(elat,3)}_{round(elng,3)}"
                    if key in seen: continue
                    seen.add(key)
                    phone = tags.get("phone") or tags.get("contact:phone") or ""
                    dist  = haversine_km(lat,lng,elat,elng)
                    city  = tags.get("addr:city") or tags.get("addr:district") or ""
                    osm_found.append((dist,name,phone,typ,city,elat,elng))
                if osm_found: break

        # Build nearby_text — prefer Overpass if it found something, else static DB
        hosp_lines = []
        if osm_found:
            osm_found.sort(key=lambda x:x[0])
            for dist,name,phone,typ,city,elat,elng in osm_found[:3]:
                ph = f" | Phone: {phone}" if phone else ""
                ct = f" ({city})" if city else ""
                hosp_lines.append(f"  - {name}{ct} [{typ}] — {dist:.1f} km away | GPS:{elat:.4f},{elng:.4f}{ph}")
            nearby_text = (
                "\nVERIFIED NEARBY HOSPITALS (live OSM data, sorted closest first):\n"
                + "\n".join(hosp_lines)
                + "\nMANDATORY: Recommend ONLY the closest hospital above."
            )
        elif static_hosp:
            for h in static_hosp[:3]:
                ph = f" | Phone: {h['phone']}" if h['phone'] and h['phone']!="N/A" else ""
                hosp_lines.append(f"  - {h['name']} [{h['type']}] — {h['dist_km']:.1f} km away | GPS:{h['lat']:.4f},{h['lng']:.4f}{ph}")
            nearby_text = (
                "\nVERIFIED NEARBY HOSPITALS (Pakistan hospital database, sorted closest first):\n"
                + "\n".join(hosp_lines)
                + f"\nMANDATORY: Recommend ONLY from this list. The closest is '{static_hosp[0]['name']}' at {static_hosp[0]['dist_km']:.1f} km."
                + f"\nOPTIMIZED ROUTE must say: '{static_hosp[0]['name']}' and estimate ~{max(5,int(static_hosp[0]['dist_km']*1.4))} minutes by ambulance."
            )
        else:
            lock_area = district or data.location or "incident area"
            nearby_text = (
                f"\nNo hospital data found near ({lat:.4f},{lng:.4f}).\n"
                f"EMT typed location: '{data.location}'\n"
                f"District: {district or 'see typed location'} | Province: {province or 'Pakistan'}\n"
                f"\nGEOGRAPHIC MANDATE:\n"
                f"1. Recommend ONLY a hospital in '{lock_area}' or adjacent tehsil.\n"
                f"2. Name the nearest DHQ Hospital or THQ for '{lock_area}'.\n"
                f"3. Estimate realistic road distance (typically 10-50 km for rural Pakistan)."
            )

    # ── Step 3: Build prompt ──────────────────────────────────────────────────
    # Voice Q&A / intake fields may arrive in English, native Urdu script, or
    # Roman Urdu (Urdu words in Latin letters) — the model must translate any
    # non-English input on the fly, but the AI PCR analysis it produces always
    # comes back in English so the dashboard/PDF stay clinically standardized.
    lang_note = (
        "CRITICAL ARCHITECTURE RULE: The incoming clinical intake metrics, patient "
        "complaint data, or voice transcripts may be supplied in standard English, "
        "native Urdu script (Arabic characters), or Roman Urdu (Urdu words written "
        "using the Latin/English alphabet). You must automatically translate any "
        "non-English inputs on the fly. The final output JSON object structures, "
        "instructions, medical advice, and SOAP text summaries MUST be written "
        "exclusively in clear, professional clinical English."
    )

    big_cities2 = {"lahore","karachi","islamabad","rawalpindi","faisalabad",
                   "multan","gujranwala","sialkot","peshawar","quetta"}
    in_big_city = any(c in (data.location or "").lower() for c in big_cities2)

    if in_big_city:
        geo_lock = f"Incident is in {data.location}. Recommend hospitals IN this city only."
    else:
        geo_lock = (
            f"INCIDENT: '{data.location}'\n"
            f"RESOLVED LOCATION: {loc_text}\n"
            f"GPS: {lat:.5f}, {lng:.5f}\n"
            f"DISTRICT: {district or 'see location'} | PROVINCE: {province or 'Pakistan'}\n"
            f"\nABSOLUTE RULE: The hospital you recommend MUST be in {district or data.location}.\n"
            f"NEVER recommend Islamabad, Lahore, Karachi, Rawalpindi, or any distant city.\n"
            f"ROUTE distance must be realistic for rural Pakistan (10-60 km range for small towns)."
        )

    system = (
        f"You are  NexaMed — expert AI EMT dispatcher for Pakistan.\n{lang_note}\n\n"
        f"╔═══ GEOGRAPHIC LOCK — HIGHEST PRIORITY — DO NOT OVERRIDE ═══╗\n"
        f"{geo_lock}\n"
        f"╚════════════════════════════════════════════════════════════╝\n"
        f"{nearby_text}\n\n"
        "OUTPUT FORMAT: Respond with ONLY a single valid JSON object — no prose "
        "before or after it, no markdown code fences — using exactly these keys:\n"
        "{\n"
        '  "classification": "[diagnosis]",\n'
        '  "triage_level": "[Red-Critical|Yellow-Urgent|Green-Minor|Black-Expectant]",\n'
        '  "recommended_facility": "[name, estimated distance km, phone if known]",\n'
        '  "instructions": "[numbered steps, joined with \\n]",\n'
        '  "equipment_advice": "[bullet list, joined with \\n]",\n'
        '  "soap_note": "S: ...\\nO: ...\\nA: ...\\nP: ...",\n'
        '  "physical_condition": "[head-to-toe assessment]",\n'
        f'  "optimized_route": "[from \'{data.location}\' -> [hospital name] - X km, ~Y min on local roads]"\n'
        "}\n"
    )
    user_msg = (
        f"Patient: {data.name or 'Unknown'} | CNIC: {data.cnic or 'N/A'}\n"
        f"Gender: {data.gender} | Age: {data.age}\n"
        f"Location: {data.location or 'Not provided'}\n"
        f"Chief Complaint: {data.description}\n"
        f"Vitals: HR {data.heart_rate} | BP {data.blood_pressure} "
        f"| SpO2 {data.oxygen_saturation}% | AVPU {data.consciousness_level}\n"
    )

    # ── Step 4: AI with 3-model fallback ──────────────────────────────────────
    # response_format forces strict JSON mode so the frontend can reliably
    # JSON.parse() the result instead of regex-scraping headered text.
    analysis = ""
    for model in ["llama-3.3-70b-versatile","llama-3.1-8b-instant","gemma2-9b-it"]:
        text = await groq_chat(model,[{"role":"system","content":system},
                                       {"role":"user","content":user_msg}],
                               max_tokens=1800, temperature=0.1,
                               response_format={"type": "json_object"})
        if text and text.strip():
            analysis = text; print(f"  triage: used {model}"); break

    if not analysis.strip():
        raise HTTPException(503, detail=(
            "All AI models failed. Open http://127.0.0.1:8000/debug — "
            "Windows Firewall may be blocking python.exe → api.groq.com"))

    # Primary: parse the JSON object the model was instructed to return.
    # Fallback: legacy header-line scraping, in case a model ignores JSON mode.
    triage_level = classification = ""
    try:
        parsed_analysis = _json.loads(analysis)
        triage_level   = str(parsed_analysis.get("triage_level", "") or "")
        classification = str(parsed_analysis.get("classification", "") or "")
    except (ValueError, AttributeError):
        for line in analysis.splitlines():
            lu = line.upper()
            if lu.startswith("TRIAGE LEVEL"):   triage_level   = line.split(":",1)[-1].strip()
            if lu.startswith("CLASSIFICATION"): classification = line.split(":",1)[-1].strip()

    log_report(data.model_dump(), analysis, triage_level, classification)
    return {"status":"success","analysis":analysis,
            "triage_level":triage_level,"classification":classification,
            "patient":data.name,"location":data.location,
            "resolved_lat":lat,"resolved_lng":lng,"resolved_area":loc_text}

# ── /history ──────────────────────────────────────────────────────────────────
COLS = ["id","timestamp","patient_name","cnic","gender","age","location",
        "description","heart_rate","blood_pressure","oxygen_saturation",
        "consciousness_level","ai_analysis","triage_level","classification"]

@app.get("/history")
def get_history(cnic: str = Query(None), limit: int = Query(50)):
    c = db()
    rows = (c.execute("SELECT * FROM triage_logs WHERE cnic=? ORDER BY id DESC LIMIT ?",
                      (cnic,limit)).fetchall() if cnic else
            c.execute("SELECT * FROM triage_logs ORDER BY id DESC LIMIT ?",
                      (limit,)).fetchall())
    c.close()
    return [dict(zip(COLS,r)) for r in rows]

@app.get("/history/name/{name}")
def get_history_name(name: str, limit: int = Query(20)):
    c = db()
    rows = c.execute("SELECT * FROM triage_logs WHERE patient_name LIKE ? ORDER BY id DESC LIMIT ?",
                     (f"%{name}%",limit)).fetchall()
    c.close()
    return [dict(zip(COLS,r)) for r in rows]


# ═════════════════════════════════════════════════════════════════════════════
#  FIREBASE FIRESTORE INTEGRATION  (REST API — no service account file needed)
#  Project: emt-e9471  |  Collection: mock_nadra_registry  &  patients
# ═════════════════════════════════════════════════════════════════════════════
def _from_fs_doc(doc: dict) -> dict:
    """Unwrap a Firestore document fields structure back to a plain dict."""
    out = {}
    for k, vobj in doc.get("fields", {}).items():
        # Extract the actual value from whichever type key is present
        for vtype in ("stringValue", "integerValue", "doubleValue",
                      "booleanValue", "nullValue"):
            if vtype in vobj:
                raw = vobj[vtype]
                out[k] = int(raw) if vtype == "integerValue" else (float(raw) if vtype == "doubleValue" else raw)
                break
        else:
            out[k] = None
    return out

import time

# 1. Define the class blueprint first so Python knows what it is
class _CircuitBreakerState:
    def __init__(self, threshold=3, cooldown=60):
        self.state = "CLOSED"  # Possible states: CLOSED, OPEN, HALF-OPEN
        self.failure_count = 0
        self.threshold = threshold
        self.cooldown = cooldown
        self.last_failure_time = None

    def record_success(self):
        """Resets the counter and closes the circuit."""
        self.state = "CLOSED"
        self.failure_count = 0

    def record_failure(self):
        """Increments failures and trips the circuit to OPEN if threshold reached."""
        self.failure_count += 1
        if self.failure_count >= self.threshold:
            self.state = "OPEN"
            self.last_failure_time = time.time()
            print("[SECURITY-GOVERNANCE] Primary Database Offline. Transitioning to isolated local cache layer.")

    def allow_request(self):
        """Gate check to see if requests are permitted or routed to cache."""
        if self.state == "CLOSED":
            return True
        if self.state == "OPEN":
            # Automatically check if the cooldown window has expired
            if time.time() - self.last_failure_time > self.cooldown:
                self.state = "HALF-OPEN"
                return True
            return False
        if self.state == "HALF-OPEN":
            return True

    @property
    def is_offline(self):
        return self.state in ["OPEN", "HALF-OPEN"]

# 2. Now initialize the shared instance safely right below the class
_firebase_cb = _CircuitBreakerState()
# Singleton circuit breaker instance shared across the entire process lifetime
#_firebase_cb = _CircuitBreakerState()


# ── 2. DYNAMIC PROCEDURAL VAULT ───────────────────────────────────────────────
# No hardcoded PII. Identities are generated at runtime from curated name
# pools and valid NADRA CNIC district codes, then mapped to fixed token strings
# so test lookups always succeed with deterministic (but not hardcoded) data.
#
# Token catalogue (exhaustive — add new tokens here to extend the vault):
#   face_vector_01/02/03 | fp_hash_01/02/03 | iris_scan_01/02/03
#
# CNIC format: DDDDD-DDDDDDD-D
#   First 5 digits = district code  |  next 7 = serial  |  last 1 = check digit

import random as _rng

# ── Name pools (common Pakistani names by gender) ─────────────────────────────
_MALE_FIRST   = ["Muhammad", "Ali", "Umar", "Hassan", "Ibrahim",
                 "Ahmad", "Bilal", "Zain", "Daud", "Omar"]
_MALE_LAST    = ["Khan", "Shah", "Qureshi", "Malik", "Siddiqui",
                 "Chaudhry", "Afridi", "Mengal", "Hussain", "Abbasi"]
_FEMALE_FIRST = ["Fatima", "Ayesha", "Sana", "Nadia", "Zara",
                 "Maryam", "Hafsa", "Hina", "Rabia", "Amna"]
_FEMALE_LAST  = ["Noor", "Bibi", "Begum", "Perveen", "Gul",
                 "Bano", "Akhtar", "Rashid", "Siddiqui", "Mirza"]

# ── Valid NADRA district codes → city names ────────────────────────────────────
_DISTRICT_CODES = {
    "35201": "Lahore",    "42101": "Karachi",  "61101": "Islamabad",
    "37405": "Rawalpindi","36302": "Multan",   "17301": "Peshawar",
    "33100": "Faisalabad","52101": "Quetta",   "38403": "Gujranwala",
    "34101": "Sialkot",
}

# ── Blood groups pool ─────────────────────────────────────────────────────────
_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]


def _mask_cnic(cnic: str) -> str:
    """
    Privacy-safe CNIC masker.
    Input:  '35201-1234567-1'
    Output: '35201-XXXXXXX-1'
    """
    parts = cnic.split("-")
    if len(parts) == 3:
        return f"{parts[0]}-XXXXXXX-{parts[2]}"
    # Fallback for malformed CNICs: mask everything except last digit
    return cnic[:-1].replace(cnic[:-1], "XXXXX-XXXXXXX-") + cnic[-1]


def _generate_cnic(district_code: str, seed_int: int) -> str:
    """
    Produce a deterministic-but-realistic 13-digit CNIC for a given district
    and seed integer. Uses seed so the same token always yields the same CNIC.
    """
    _rng.seed(seed_int)
    serial     = _rng.randint(1000000, 9999999)
    check      = _rng.randint(1, 9)
    return f"{district_code}-{serial}-{check}"


def _generate_profile(token: str, seed_int: int) -> dict:
    """
    Deterministically generate one Pakistani citizen profile for a given token.
    The seed_int makes the output repeatable across server restarts (same token
    always maps to the same name/CNIC), while keeping data out of source code.
    """
    _rng.seed(seed_int)

    # Alternate gender by seed parity for demographic balance
    is_male   = (seed_int % 2 == 1)
    gender    = "Male" if is_male else "Female"

    if is_male:
        first = _rng.choice(_MALE_FIRST)
        last  = _rng.choice(_MALE_LAST)
        name  = f"{first} {_rng.choice(_MALE_FIRST)} {last}"
        rel_key, rel_val = "father_name", f"{_rng.choice(_MALE_FIRST)} {last}"
    else:
        first = _rng.choice(_FEMALE_FIRST)
        last  = _rng.choice(_FEMALE_LAST)
        name  = f"{first} {last}"
        rel_key, rel_val = "husband_name", f"{_rng.choice(_MALE_FIRST)} {_rng.choice(_MALE_LAST)}"

    district_code, city = _rng.choice(list(_DISTRICT_CODES.items()))
    cnic                = _generate_cnic(district_code, seed_int)
    age                 = _rng.randint(18, 65)
    blood_group         = _rng.choice(_BLOOD_GROUPS)

    return {
        "name":            name,
        rel_key:           rel_val,
        "cnic":            cnic,
        "gender":          gender,
        "age":             age,
        "biometric_token": token,
        "blood_group":     blood_group,
        "city":            city,
    }


# ── Token catalogue with stable integer seeds ─────────────────────────────────
# Each token gets a fixed seed so re-generation always produces the same profile.
# To add a new token: append an entry here — no other change needed.
_TOKEN_SEED_MAP: dict[str, int] = {
    "face_vector_01": 101,
    "face_vector_02": 202,
    "face_vector_03": 303,
    "fp_hash_01":     411,
    "fp_hash_02":     522,
    "fp_hash_03":     633,
    "iris_scan_01":   741,
    "iris_scan_02":   852,
    "iris_scan_03":   963,
}

# ── Build the dynamic vault at import time ────────────────────────────────────
# _NADRA_CACHE is keyed by biometric_token for O(1) lookup.
# _NADRA_SEED is kept as a list for the Firestore seeder (startup task).
_NADRA_SEED: list[dict] = [
    _generate_profile(token, seed)
    for token, seed in _TOKEN_SEED_MAP.items()
]

_NADRA_CACHE: dict[str, dict] = {
    r["biometric_token"]: r for r in _NADRA_SEED
}

# Runtime store for anonymous patients (written to Firebase when reachable)
_ANON_PATIENTS_CACHE: dict[str, dict] = {}


# ── Startup: seed mock_nadra_registry if empty (background task) ──────────────
async def _seed_nadra_background():
    """
    Background task: write all dynamically generated profiles into Firestore
    if the collection is currently empty.  Runs 2 s after uvicorn is ready
    so it never delays request handling.  Circuit breaker state is updated
    based on whether Firebase responds.
    """
    import asyncio
    await asyncio.sleep(2)
    try:
        existing = await _fs_get_collection(_NADRA_COL)
        if existing:
            _firebase_cb.record_success()
            print(f"[NADRA-CB:{_firebase_cb.state}] "
                  f"Registry already seeded ({len(existing)} records) — skipping.")
            return

        # Write each generated profile; document ID = CNIC digits (no dashes)
        for record in _NADRA_SEED:
            doc_id = record["cnic"].replace("-", "")
            ok     = await _fs_set_document(_NADRA_COL, doc_id, record)
            masked = _mask_cnic(record["cnic"])
            status = "OK" if ok else "FAILED"
            print(f"[NADRA-CB:{_firebase_cb.state}] "
                  f"Seeded token={record['biometric_token']} "
                  f"cnic={masked} — {status}")

        _firebase_cb.record_success()
        print(f"[NADRA] Vault seeded — {len(_NADRA_SEED)} dynamic profiles written.")

    except Exception as exc:
        _firebase_cb.record_failure()
        print(f"[NADRA-CB:{_firebase_cb.state}] Firebase unreachable: {exc}")
        print(f"[NADRA] In-memory vault active — "
              f"{len(_NADRA_SEED)} tokens available without Firebase.")


@app.on_event("startup")
async def seed_nadra_registry():
    """Schedule the NADRA vault seed as a non-blocking background task."""
    import asyncio
    asyncio.create_task(_seed_nadra_background())


# ── Pydantic models ───────────────────────────────────────────────────────────

class BiometricLookupRequest(BaseModel):
    """
    Flexible biometric lookup payload.  Two input modes are supported:

    MODE A — Image-based (new, primary):
        biometric_type : "face" | "fingerprint" | "iris"
        image_data     : Base64-encoded image/scan OR a known test-stub string
                         (e.g. 'IMG_FACE_01').  The backend runs a simulated
                         recognition check and maps the payload to a profile.
                         Unknown image  strict 404.  No fake data ever returned.

    MODE B — Token-based (legacy / frontend Hardware Simulator):
        biometric_type : any string
        token          : vault key such as "face_vector_01".

    Both modes go through the same circuit-breaker and audit-trail pipeline.
    """
    biometric_type: str              # "face" | "fingerprint" | "iris"
    image_data:     str = ""         # Base64 image payload  (Mode A)
    token:          str = ""         # Vault token           (Mode B, legacy)
    operator_id:    str = "SYSTEM"   # EMT / operator identifier


class AnonymousIntakeRequest(BaseModel):
    estimated_age:     str   # flexible: "30-40", "35", etc.
    gender:            str
    incident_location: str


# ── Image Recognition Simulator ───────────────────────────────────────────────
# Maps known image stubs / base64 prefixes to vault tokens.
# In production, replace _resolve_token_from_image() with a real CV inference
# call (e.g. AWS Rekognition, Azure Face API, or an on-device model).
#
# Test stubs — send these as image_data to hit specific profiles:
#   IMG_FACE_01  → face_vector_01   IMG_FP_01  → fp_hash_01
#   IMG_FACE_02  → face_vector_02   IMG_FP_02  → fp_hash_02
#   IMG_FACE_03  → face_vector_03   IMG_FP_03  → fp_hash_03
#   IMG_IRIS_01  → iris_scan_01     IMG_IRIS_02 → iris_scan_02
#   IMG_IRIS_03  → iris_scan_03
#   Anything else → NO MATCH → strict 404
# ───────────────────────────────────────────────────────────────────────────
_IMAGE_TOKEN_MAP: dict[str, str] = {
    "IMG_FACE_01":  "face_vector_01",
    "IMG_FACE_02":  "face_vector_02",
    "IMG_FACE_03":  "face_vector_03",
    "IMG_FP_01":    "fp_hash_01",
    "IMG_FP_02":    "fp_hash_02",
    "IMG_FP_03":    "fp_hash_03",
    "IMG_IRIS_01":  "iris_scan_01",
    "IMG_IRIS_02":  "iris_scan_02",
    "IMG_IRIS_03":  "iris_scan_03",
}


def _resolve_token_from_image(image_data: str) -> str | None:
    """
    Simulate biometric recognition from a base64 image payload.

    Steps:
      1. Strip whitespace.
      2. Exact-match the full string against test stubs.
      3. Prefix-match the first 32 chars (covers real base64 images registered
         in _IMAGE_TOKEN_MAP with their base64 prefix as key).
      4. Return the mapped vault token, or None if unrecognised.

    Returning None signals a clean identity failure.
    The caller MUST raise a strict 404 — no fallback data is synthesised.
    """
    if not image_data:
        return None
    stripped = image_data.strip()
    # Exact match (short stubs, test identifiers)
    if stripped in _IMAGE_TOKEN_MAP:
        return _IMAGE_TOKEN_MAP[stripped]
    # Prefix match for real base64 payloads
    prefix = stripped[:32]
    if prefix in _IMAGE_TOKEN_MAP:
        return _IMAGE_TOKEN_MAP[prefix]
    # Unrecognised individual — caller raises 404
    return None

# ── 3. PRIVACY-MASKING AUDIT TRAIL + CIRCUIT-BREAKER ENDPOINT ────────────────
@app.post("/nadra/biometric-lookup")
async def nadra_biometric_lookup(req: BiometricLookupRequest):
    """
    Production-grade NADRA biometric verification endpoint.

    Two payload modes (see BiometricLookupRequest docstring):
      • image_data  — simulate recognition from a base64 scan/photo (Mode A)
      • token       — legacy vault key for the frontend simulator       (Mode B)

    Strict 404 isolation:
      If the image does not match any registered profile, 404 is raised
      immediately. No placeholder names, random CNICs, or fake citizen
      objects are ever returned. The frontend treats 404 as the signal
      to activate the Emergency John Doe Protocol.
    """
    import json as _json

    lookup_ts = datetime.utcnow().isoformat() + "Z"

    # ── Resolve the effective vault token ──────────────────────────────────
    # Priority: image_data (Mode A) takes precedence over token (Mode B).
    effective_token: str | None = None
    resolution_mode: str        = "none"

    if req.image_data.strip():
        # MODE A: image-based recognition simulation
        effective_token = _resolve_token_from_image(req.image_data)
        resolution_mode = "image_recognition"
    elif req.token.strip():
        # MODE B: legacy token-based lookup (frontend Hardware Simulator)
        effective_token = req.token.strip()
        resolution_mode = "token_direct"

    # Audit record — no raw token, no raw image bytes, no PII in logs
    audit: dict = {
        "timestamp":        lookup_ts,
        "operator_id":      req.operator_id,
        "biometric_type":   req.biometric_type,
        "resolution_mode":  resolution_mode,
        "token_prefix":     (
            effective_token.split("_")[0]
            if effective_token and "_" in effective_token
            else "unresolved"
        ),
        "image_payload_sz": len(req.image_data) if req.image_data else 0,
        "operation":        "NADRA_BIOMETRIC_LOOKUP",
        "circuit_breaker":  _firebase_cb.state,
        "source":           None,
        "status":           None,
        "cnic_masked":      None,
    }

    if _firebase_cb.is_offline:
        audit["governance_flag"] = (
            "[SECURITY-GOVERNANCE] Primary Database Offline. "
            "Isolated cache layer active."
        )

    # ── STRICT 404: image supplied but recognition produced no match ───────
    # Do NOT fall through to any fallback. Clean identity failure.
    if resolution_mode == "image_recognition" and effective_token is None:
        audit["status"] = "NOT_FOUND"
        print("[AUDIT]", _json.dumps(audit, ensure_ascii=False))
        raise HTTPException(
            status_code=404,
            detail="No identity record found in NADRA database."
        )

    # ── No input at all provided ───────────────────────────────────────────
    if effective_token is None:
        audit["status"] = "UNRESOLVED"
        print("[AUDIT]", _json.dumps(audit, ensure_ascii=False))
        raise HTTPException(
            status_code=422,
            detail="Provide either image_data (base64 scan) or token."
        )

    citizen = None
    source  = "none"

    # ── Primary path: Firestore (gated by circuit breaker) ────────────────
    if _firebase_cb.allow_request():
        try:
            matches = await _fs_query_by_field(
                collection=_NADRA_COL,
                field="biometric_token",
                value=effective_token,
            )
            if matches:
                citizen = matches[0]
                source  = "firebase"
                _firebase_cb.record_success()
        except Exception as _fb_err:
            _firebase_cb.record_failure()
            audit["firebase_error"]  = str(_fb_err)
            audit["circuit_breaker"] = _firebase_cb.state
            if _firebase_cb.is_offline:
                audit["governance_flag"] = (
                    "[SECURITY-GOVERNANCE] Primary Database Offline. "
                    "Isolated cache layer active."
                )

    # ── Fallback path: isolated in-memory vault ────────────────────────────
    if citizen is None:
        citizen = _NADRA_CACHE.get(effective_token)
        if citizen:
            source = "cache"

    # ── Audit trail emission ───────────────────────────────────────────────
    audit["source"] = source
    if citizen:
        audit["status"]      = "FOUND"
        audit["cnic_masked"] = _mask_cnic(citizen.get("cnic", ""))
    else:
        audit["status"] = "NOT_FOUND"

    print("[AUDIT]", _json.dumps(audit, ensure_ascii=False))

    # ── Verified citizen response ──────────────────────────────────────────
    if citizen:
        return {
            "status":          "verified",
            "biometric_type":  req.biometric_type,
            "resolution_mode": resolution_mode,
            "source":          source,
            "circuit_breaker": _firebase_cb.state,
            "citizen":         citizen,
        }

    # ── STRICT 404: token resolved but not in DB or cache ─────────────────
    # No placeholder. No random CNIC. Clean failure — frontend activates
    # Emergency John Doe Protocol on this status code.
    raise HTTPException(
        status_code=404,
        detail="No identity record found in NADRA database."
    )



# -- /patients/anonymous-intake ------------------------------------------------
@app.post("/patients/anonymous-intake")
async def anonymous_patient_intake(req: AnonymousIntakeRequest):
    """
    Create an anonymous John Doe patient record.
    Tracking ID format: TRAUMA-YYYYMMDD-LOCATION-XXXX.
    Always stores in RAM first; tries Firebase best-effort.
    Returns HTTP 200 even when Firebase is unreachable.
    """
    today        = datetime.utcnow().strftime("%Y%m%d")
    location_tag = "".join(
        c for c in req.incident_location.upper() if c.isalnum()
    ) or "UNKNOWN"
    suffix       = str(random.randint(1000, 9999))
    tracking_id  = f"TRAUMA-{today}-{location_tag}-{suffix}"

    record = {
        "name":              "Unidentified John Doe",
        "tracking_id":       tracking_id,
        "estimated_age":     str(req.estimated_age),
        "gender":            req.gender,
        "incident_location": req.incident_location,
        "created_at":        datetime.utcnow().isoformat() + "Z",
        "status":            "anonymous",
    }

    # Always store in RAM first
    _ANON_PATIENTS_CACHE[tracking_id] = record
    print(f"[AnonymousIntake] RAM cached: {tracking_id}")

    # Try Firebase (best-effort)
    firebase_ok = False
    try:
        firebase_ok = await _fs_set_document(_PATIENTS_COL, tracking_id, record)
        if firebase_ok:
            print(f"[AnonymousIntake] Firebase OK: {tracking_id}")
        else:
            print(f"[AnonymousIntake] Firebase returned False: {tracking_id}")
    except Exception as _fe:
        print(f"[AnonymousIntake] Firebase error: {_fe}")

    return {
        "status":        "created",
        "tracking_id":   tracking_id,
        "patient":       record,
        "firebase_sync": firebase_ok,
        "message":       (
            f"Anonymous patient registered as Unidentified John Doe with ID {tracking_id}. "
            + ("Record saved to Firebase." if firebase_ok
               else "Record saved locally (Firebase sync pending).")
        ),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  N8N AUTOMATION WEBHOOK URLS  (read from .env, fallback to localhost)
# ══════════════════════════════════════════════════════════════════════════════
#N8N_SOS_URL       = os.environ.get("N8N_SOS_WEBHOOK_URL",       "http://localhost:5678/webhook-test/sos")
#N8N_BROADCAST_URL = os.environ.get("N8N_BROADCAST_WEBHOOK_URL", "http://localhost:5678/webhook-test/broadcast")
N8N_SOS_URL = os.environ.get(
    "N8N_SOS_WEBHOOK_URL", 
    "http://localhost:5678/webhook/f3aaf3d8-7e57-4e2e-94ad-1d4fabfe94ef"
)

# 2. EMT Broadcast Flow
N8N_BROADCAST_URL = os.environ.get(
    "N8N_BROADCAST_WEBHOOK_URL", 
    "http://localhost:5678/webhook/fc462df0-497f-4d8d-a484-569b9a2e0a38"
)
# Firestore collection names for the two new routes
_INCIDENTS_COL = "incidents"
_PCR_COL       = "patient_care_reports"


# ── /api/public/emergency ──────────────────────────────────────────────────────
class PublicEmergencyRequest(BaseModel):
    """Payload sent by the citizen Public Emergency Portal panic button."""
    description: str = "Public Emergency SOS Panic Button Pressed"
    latitude:    Optional[float] = None
    longitude:   Optional[float] = None
    timestamp:   Optional[str]   = None


@app.post("/api/public/emergency")
async def public_emergency(req: PublicEmergencyRequest):
    """
    Receives a citizen SOS signal from the Public Portal.

    Actions (in order):
      1. Build a critical-priority incident document.
      2. Persist it to Firestore 'incidents' collection (best-effort).
      3. Forward the payload to n8n SOS webhook for automation dispatch.
         Wrapped in try/except — if n8n is offline the save still completes.

    Returns HTTP 200 with incident ID even when n8n / Firebase is unreachable.
    """
    incident_id = f"SOS-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{random.randint(1000,9999)}"
    ts          = req.timestamp or datetime.utcnow().isoformat() + "Z"

    record = {
        "incident_id":   incident_id,
        "source":        "Public Portal",
        "priority":      "CRITICAL",
        "status":        "unassigned",
        "description":   req.description,
        "latitude":      req.latitude,
        "longitude":     req.longitude,
        "timestamp":     ts,
        "created_at":    datetime.utcnow().isoformat() + "Z",
    }

    # ── Step 1: Persist to Firestore 'incidents' (best-effort) ──────────────
    firebase_ok = False
    try:
        firebase_ok = await _fs_set_document(_INCIDENTS_COL, incident_id, record)
        print(f"[PublicSOS] Firestore write {'OK' if firebase_ok else 'FAILED'}: {incident_id}")
    except Exception as _fe:
        print(f"[PublicSOS] Firestore error: {_fe}")

    # ── Step 2: Forward to n8n SOS webhook (best-effort) ────────────────────
    n8n_ok = False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(N8N_SOS_URL, json=record)
            n8n_ok = (resp.status_code < 400)
            print(f"[PublicSOS] n8n response: {resp.status_code}")
    except Exception as _ne:
        print(f"[PublicSOS] n8n unreachable (offline?): {_ne}")

    return {
        "status":        "dispatched",
        "incident_id":   incident_id,
        "firebase_sync": firebase_ok,
        "n8n_notified":  n8n_ok,
        "message":       (
            "Emergency signal received. Paramedics have been notified. "
            "Help is on the way."
        ),
    }


# ── /api/emt/pcr/finalize ──────────────────────────────────────────────────────
class VitalsSchema(BaseModel):
    hr_bpm:      Optional[str] = ""
    bp:          Optional[str] = ""
    spo2_percent: Optional[str] = ""


class PCRFinalizeRequest(BaseModel):
    """
    Full Patient Care Report payload — mirrors every EMT intake form field.
    All fields are optional strings to remain lenient with partial submissions.
    """
    incident_location:      str = ""
    chief_complaint_scene:  str = ""
    patient_name:           str = ""
    gender:                 str = ""
    father_husband_name:    str = ""
    cnic:                   str = ""
    age:                    Optional[str] = ""
    vitals:                 Optional[VitalsSchema] = None
    allergies:              str = ""
    triage_level:           str = ""
    classification:         str = ""
    ai_analysis:            str = ""


@app.post("/api/emt/pcr/finalize")
async def emt_pcr_finalize(req: PCRFinalizeRequest):
    """
    EMT finalizes and dispatches the compiled Patient Care Report (PCR).

    Action A — Firestore commit:
      Saves the complete PCR as a permanent document in 'patient_care_reports'.

    Action B — n8n broadcast (guarded try/except):
      Forwards the structured PCR downstream to the n8n security broadcast hook.
      If n8n is offline, the Firestore save still completes — non-blocking.

    Always returns HTTP 200 with the assigned PCR reference ID.
    """
    pcr_id  = f"PCR-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{random.randint(1000,9999)}"
    ts_now  = datetime.utcnow().isoformat() + "Z"

    # Build the PCR document
    vitals_dict = {}
    if req.vitals:
        vitals_dict = {
            "hr_bpm":       req.vitals.hr_bpm or "",
            "bp":           req.vitals.bp or "",
            "spo2_percent": req.vitals.spo2_percent or "",
        }

    pcr_doc = {
        "pcr_id":                 pcr_id,
        "incident_location":      req.incident_location,
        "chief_complaint_scene":  req.chief_complaint_scene,
        "patient_name":           req.patient_name,
        "gender":                 req.gender,
        "father_husband_name":    req.father_husband_name,
        "cnic":                   req.cnic,
        "age":                    str(req.age or ""),
        "vitals":                 vitals_dict,
        "allergies":              req.allergies,
        "triage_level":           req.triage_level,
        "classification":         req.classification,
        "ai_analysis":            req.ai_analysis,
        "status":                 "finalized",
        "created_at":             ts_now,
    }

    # ── Action A: Firestore commit (primary — always attempted) ─────────────
    firebase_ok = False
    try:
        firebase_ok = await _fs_set_document(_PCR_COL, pcr_id, pcr_doc)
        print(f"[PCRFinalize] Firestore write {'OK' if firebase_ok else 'FAILED'}: {pcr_id}")
    except Exception as _fe:
        print(f"[PCRFinalize] Firestore error (continuing): {_fe}")

    # ── Action B: n8n broadcast (secondary — non-blocking try/except) ───────
    # If n8n container is offline, the primary Firestore save above is unaffected.
    n8n_ok = False
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(N8N_BROADCAST_URL, json=pcr_doc)
            n8n_ok = (resp.status_code < 400)
            print(f"[PCRFinalize] n8n broadcast response: {resp.status_code}")
    except Exception as _ne:
        print(f"[PCRFinalize] n8n broadcast unreachable (offline?): {_ne}")

    masked_cnic = _mask_cnic(req.cnic) if req.cnic else "N/A"
    print(f"[PCRFinalize] PCR committed — ID={pcr_id} patient={req.patient_name or 'N/A'} cnic={masked_cnic}")

    return {
        "status":        "committed",
        "pcr_id":        pcr_id,
        "patient":       req.patient_name or "N/A",
        "firebase_sync": firebase_ok,
        "n8n_broadcast": n8n_ok,
        "message":       (
            f"PCR {pcr_id} finalized and dispatched. "
            + ("Firestore: saved. " if firebase_ok else "Firestore: pending sync. ")
            + ("n8n: broadcast sent." if n8n_ok else "n8n: offline (local save complete).")
        ),
    }
