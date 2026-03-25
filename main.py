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

import os, sqlite3, json as _json, re as _re, urllib.parse
import datetime as _dt
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import os
import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

GROQ_KEY     = os.getenv("GROQ_API_KEY", "").strip()
MAPBOX_TOKEN = os.getenv("MAPBOX_TOKEN","").strip()
GROQ_BASE    = "https://api.groq.com/openai/v1"
GROQ_HEADERS = {"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json"}
AI_READY     = bool(GROQ_KEY)

if GROQ_KEY: print(f"✅ Groq key: {GROQ_KEY[:8]}...")
else:        print("⚠  GROQ_API_KEY missing — add to .env")

app = FastAPI(title=" NexaMed EMT Backend", version="3.7")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

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

async def groq_chat(model: str, messages: list, max_tokens: int = 1800, temperature: float = 0.1):
    """Call Groq text completion. Returns content string or None."""
    if not GROQ_KEY:
        return None
    payload = {"model": model, "messages": messages,
               "max_tokens": max_tokens, "temperature": temperature}
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
}

def lookup_district(query: str) -> tuple | None:
    """
    Try to match any substring of the query against PK_DISTRICTS keys.
    Returns (lat, lng, display_name, district, province) or None.
    Longest key match wins (so "rahim yar khan" beats "khan").
    """
    q = query.lower().strip()
    # Remove common suffixes that EMTs might add
    q_clean = _re.sub(
        r'\b(tahsil|tehsil|taluka|taluk|district|zila|city|town|village|'
        r'sub.?division|union council|uc|road|street|chowk|near|area)\b',
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

async def geocode_location(q: str) -> dict | None:
    """
    Master geocoder. Priority:
    1. Hardcoded district table (unambiguous, instant)
    2. Nominatim with anti-ICT scoring (8 candidates)
    3. Photon fallback (different network)
    Returns {found, lat, lng, display_name, district, province} or None
    """
    if not q or not q.strip():
        return None

    q = q.strip()

    # ── Step 1: Hardcoded table — instant, zero ambiguity ─────────────────────
    entry = lookup_district(q)
    if entry:
        lat, lng, display, district, province = entry
        return {
            "found": True, "lat": lat, "lng": lng,
            "display_name": display,
            "district": district, "province": province,
            "source": "table",
        }

    # ── Step 2: Mapbox Geocoding API (faster + PK-aware, uses MAPBOX_TOKEN) ──────
    if MAPBOX_TOKEN:
        try:
            _enc = urllib.parse.quote(q)
            _murl = (f"https://api.mapbox.com/geocoding/v5/mapbox.places/{_enc}.json"
                     f"?access_token={MAPBOX_TOKEN}&country=PK&language=en&limit=3"
                     f"&bbox=60.878,23.694,77.841,36.998")
            _md = await safe_get(_murl, 8.0)
            if _md and _md.get("features"):
                _ff  = _md["features"][0]
                _cc  = _ff["geometry"]["coordinates"]  # [lng, lat]
                _ctx = {c.get("id","").split(".")[0]: c.get("text","") for c in _ff.get("context",[])}
                _pname = _ff.get('place_name', q)
                print(f"  Mapbox geocode: {_pname[:60]}")
                return {"found":True,"lat":float(_cc[1]),"lng":float(_cc[0]),
                        "display_name":_pname,
                        "district":_ctx.get("district","") or _ctx.get("locality",""),
                        "province":_ctx.get("region",""),"source":"mapbox"}
        except Exception as _me:
            print(f"  Mapbox err: {_me}")

    # ── Step 3: Nominatim with multi-candidate scoring ────────────────────────
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
        data = await safe_get(url, 12.0)
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

    # ── Step 4: Photon fallback ───────────────────────────────────────────────
    for variant in filter(None, [base, base2]):
        enc = urllib.parse.quote(variant)
        ph  = await safe_get(
            f"https://photon.komoot.io/api/?q={enc}&limit=5&bbox=60.0,23.0,77.5,37.5", 10.0)
        if not ph or not ph.get("features"): continue
        for feat in ph["features"]:
            c   = feat["geometry"]["coordinates"]
            lng = float(c[0]); lat = float(c[1])
            if not (60.0 <= lng <= 77.5 and 23.0 <= lat <= 37.5): continue
            props = feat.get("properties", {})
            disp  = props.get("name") or q
            # Skip Islamabad results unless user typed it
            if "islamabad" in disp.lower() and not user_typed_islamabad: continue
            print(f"  Photon fallback: {disp}")
            return {"found": True, "lat": lat, "lng": lng, "display_name": disp,
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
@app.post("/cnic/scan")
async def cnic_scan(req: CNICRequest):
    """
    scan_method:
      "local" → EasyOCR ONLY — never touches Groq API regardless of GROQ_KEY
      "groq"  → Groq Vision only, skip EasyOCR
      "auto"  → try EasyOCR first, fall back to Groq if not installed
    """
    sm = req.scan_method

    # ── LOCAL EASYOCR — completely offline, zero API calls ───────────────────
    if sm in ("auto","local"):
        try:
            import easyocr as _eocr, numpy as _np, base64 as _b64, cv2 as _cv2
            _bytes  = _b64.b64decode(req.image_base64)
            _arr    = _np.frombuffer(_bytes, _np.uint8)
            _img    = _cv2.imdecode(_arr, _cv2.IMREAD_COLOR)
            _reader = _eocr.Reader(["en","ur"], verbose=False, gpu=False)
            _txts   = _reader.readtext(_img, detail=0)
            _block  = " ".join(_txts)
            _cnic_m = _re.search(r"\d{5}-\d{7}-\d", _block)
            _dob_m  = _re.search(r"\d{2}[./]\d{2}[./]\d{4}", _block)
            _dob_s  = _dob_m.group(0).replace(".","/") if _dob_m else None
            _gen    = ("Female" if _re.search(r"\bfemale\b",_block,_re.I) else
                       "Male"   if _re.search(r"\bmale\b",_block,_re.I) else None)
            _caps   = _re.findall(r"\b[A-Z][A-Z ]{2,28}\b", _block)
            _holder = _caps[0].strip().title() if len(_caps)>0 else None
            _father = _caps[1].strip().title() if len(_caps)>1 else None
            _lp = {"name":_holder,"nameUrdu":None,"fatherName":_father,
                   "cnic":_cnic_m.group(0) if _cnic_m else None,
                   "dob":_dob_s,"age":None,"gender":_gen,"address":None}
            if _dob_s:
                try:
                    _dp=[int(x) for x in _dob_s.split("/")]
                    if _dp[0]>31: _yr,_mo,_da=_dp[0],_dp[1],_dp[2]
                    else:          _da,_mo,_yr=_dp[0],_dp[1],_dp[2]
                    _b=_dt.date(_yr,_mo,_da); _td=_dt.date.today()
                    _a=_td.year-_b.year-(1 if (_td.month,_td.day)<(_b.month,_b.day) else 0)
                    if 1<=_a<=115: _lp["age"]=_a
                except: pass
            _cnic_val = _lp.get('cnic','N/A'); _age_val = _lp.get('age','N/A')
            print(f"  EasyOCR local scan: cnic={_cnic_val} age={_age_val}")
            # LOCAL MODE: return immediately — Groq API is NEVER called
            if sm == "local":
                # Even if some fields are None, return what we extracted
                return {"status":"ok","data":_lp,"method":"easyocr-local"}
            # AUTO MODE: EasyOCR ran, still continue to Groq for richer name/address/Urdu
        except ImportError:
            if sm=="local":
                raise HTTPException(503,detail=("EasyOCR or OpenCV not installed. "
                    "Run in your venv: pip install easyocr opencv-python-headless\n"
                    "Then restart uvicorn. EasyOCR downloads ~100MB model on first run."))
            print("  EasyOCR not available — auto fallback to Groq")
        except Exception as _ee:
            if sm=="local":
                raise HTTPException(422,detail=f"EasyOCR failed: {_ee}")
            print(f"  EasyOCR error ({_ee}) — auto fallback to Groq")

    # ── GROQ VISION (mode=groq or mode=auto-fallback) ────────────────────────
    if not GROQ_KEY:
        raise HTTPException(503, detail="GROQ_API_KEY not set in .env file. Add it and restart uvicorn.")

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
    vision_models = [
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
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
            # Fix: Pakistani CNIC DOB uses dots DD.MM.YYYY → exact birthday-aware age
            _raw_dob = (parsed.get("dob") or "").replace(".","/").replace("-","/").strip()
            if _raw_dob and not parsed.get("age"):
                _dp = _raw_dob.split("/")
                if len(_dp)==3:
                    try:
                        _pi=[int(x) for x in _dp]
                        if _pi[0]>31: _yr,_mo,_da=_pi[0],_pi[1],_pi[2]  # YYYY/MM/DD
                        else:          _da,_mo,_yr=_pi[0],_pi[1],_pi[2]  # DD/MM/YYYY
                        _born=_dt.date(_yr,_mo,_da); _td=_dt.date.today()
                        _a=_td.year-_born.year
                        if (_td.month,_td.day)<(_born.month,_born.day): _a-=1
                        if 1<=_a<=115: parsed["age"]=_a
                    except Exception as _ae:
                        print(f"  DOB parse err: {_ae} | {_raw_dob}")
            return {"status":"ok","data":parsed,"method":f"groq:{model.split(chr(47))[-1][:30]}"}
        except _json.JSONDecodeError as je:
            last_err = f"Non-JSON from {model}: {str(je)[:80]} | raw: {raw[:120]}"
            continue

    raise HTTPException(422, detail=(
        f"CNIC scan failed. Last error: {last_err}. "
        "Check http://127.0.0.1:8000/debug — if groq_vision_api shows ❌, "
        "Windows Firewall is blocking python.exe → api.groq.com. "
        "Fix: Windows Security → Firewall → Allow an app → add python.exe (Private+Public)."))

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
            # Geocoding failed — do NOT search around null island (0,0)
            geocode_failed = True
            print(f"  /hospitals: geocode FAILED for '{loc}' — returning geocode_failed")

    lat, lng = resolved_lat, resolved_lng

    # Guard: if still 0,0 try IP-geo as last resort
    if not lat or not lng or (abs(lat) < 0.1 and abs(lng) < 0.1):
        if geocode_failed:
            return {"status":"geocode_failed","count":0,"hospitals":[],
                    "lat_used":0.0,"lng_used":0.0,
                    "message":f"Cannot find '{loc}'. Try a fuller name like 'Lahore' or 'Rawalpindi'."}
        # No loc text — try IP-geo
        for _iu in ["http://ip-api.com/json/?fields=lat,lon,status","https://ipapi.co/json/"]:
            _id = await safe_get(_iu, 5.0)
            if not _id: continue
            _lt=_id.get("lat") or _id.get("latitude")
            _lg=_id.get("lon") or _id.get("longitude")
            if _lt and _lg and (_id.get("status")=="success" or _id.get("latitude")):
                lat,lng=float(_lt),float(_lg)
                print(f"  /hospitals: IP-geo fallback ({lat:.3f},{lng:.3f})")
                break
        if abs(lat)<0.1 and abs(lng)<0.1:
            return {"status":"geocode_failed","count":0,"hospitals":[],
                    "lat_used":0.0,"lng_used":0.0,
                    "message":"No location. Type a city/area name in Incident Location field."}

    # ── OSM Overpass hospital search ──────────────────────────────────────────
    servers = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]

    for radius_m in [5_000, 10_000, 25_000, 50_000, 100_000]:
        q_osm = f"""[out:json][timeout:30];
(
  nwr["amenity"~"^(hospital|clinic|doctors|health_post|dispensary|maternity|nursing_home|medical_center)$"](around:{radius_m},{lat},{lng});
  nwr["healthcare"](around:{radius_m},{lat},{lng});
  nwr["building"~"^(hospital|clinic|dispensary|health)$"](around:{radius_m},{lat},{lng});
  nwr["name"~"hospital|clinic|dispensary|health|BHU|RHC|DHQ|THQ|maternity|markaz",i](around:{radius_m},{lat},{lng});
);
out center tags 30;"""

        hospitals = []
        for server in servers:
            raw = await safe_post(server, {"data": q_osm}, 25.0)
            if not raw: continue
            seen = set()
            for el in raw.get("elements", []):
                elat = el.get("lat") or el.get("center",{}).get("lat")
                elng = el.get("lon") or el.get("center",{}).get("lon")
                if not elat or not elng: continue
                tags = el.get("tags",{})
                typ  = tags.get("amenity") or tags.get("healthcare") or tags.get("building") or "medical"
                if typ in ("pharmacy","veterinary","blood_donation","yes","no"): continue
                name = tags.get("name:en") or tags.get("name") or tags.get("name:ur") or "Medical Facility"
                key  = f"{name[:20]}_{round(elat,3)}_{round(elng,3)}"
                if key in seen: continue
                seen.add(key)
                phone = (tags.get("phone") or tags.get("contact:phone") or
                         tags.get("contact:mobile") or "N/A")
                addr  = ", ".join(filter(None,[
                    tags.get("addr:street",""), tags.get("addr:suburb",""),
                    tags.get("addr:city",""),   tags.get("addr:district","")]))
                dist  = haversine_km(lat, lng, elat, elng)
                is_er = (tags.get("emergency")=="yes" or typ=="hospital" or
                         tags.get("healthcare")=="hospital" or
                         any(k in name.lower() for k in ("hospital","dhq","thq","teaching")))
                hospitals.append({
                    "name":name, "name_ur":tags.get("name:ur",""),
                    "type":typ,  "phone":phone, "emergency":is_er,
                    "lat":elat,  "lng":elng, "dist_km":round(dist,2),
                    "address":addr, "opening_hours":tags.get("opening_hours",""),
                    "source":"osm",
                })
            if hospitals: break

        # Nominatim fallback if Overpass returns nothing
        if not hospitals:
            box = radius_m / 111_000
            nom = await safe_get(
                f"https://nominatim.openstreetmap.org/search?format=json&limit=10"
                f"&countrycodes=pk&bounded=1&q=hospital+OR+clinic+OR+dispensary"
                f"&viewbox={lng-box},{lat+box},{lng+box},{lat-box}", 10.0)
            if nom:
                for p in nom:
                    plat,plng = float(p.get("lat",0)),float(p.get("lon",0))
                    if not plat or not plng: continue
                    dist = haversine_km(lat,lng,plat,plng)
                    if dist > radius_m/1000: continue
                    hospitals.append({
                        "name":p.get("display_name","Hospital").split(",")[0],
                        "name_ur":"","type":"hospital","phone":"N/A","emergency":True,
                        "lat":plat,"lng":plng,"dist_km":round(dist,2),
                        "address":", ".join(p.get("display_name","").split(",")[1:3]),
                        "opening_hours":"","source":"nominatim"})

        if hospitals:
            hospitals.sort(key=lambda h: h["dist_km"])
            return {"status":"ok","count":len(hospitals),
                    "hospitals":hospitals[:10],"lat_used":lat,"lng_used":lng,
                    "radius_used_km":radius_m//1000, "location_source":source}

    return {"status":"ok","count":0,"hospitals":[],"lat_used":lat,"lng_used":lng,
            "message":"No facilities found in 50km."}

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

    # ── Step 2: Find real nearby hospitals via Overpass ───────────────────────
    nearby_text = ""
    if lat and lng:
        servers = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        ]
        found = []
        for radius_m in [2_000, 5_000, 10_000, 25_000]:
            if found: break
            q_osm = f"""[out:json][timeout:20];
(
  nwr["amenity"~"^(hospital|clinic|doctors|health_post|dispensary|maternity|nursing_home)$"](around:{radius_m},{lat},{lng});
  nwr["healthcare"](around:{radius_m},{lat},{lng});
  nwr["name"~"hospital|clinic|dispensary|BHU|RHC|DHQ|THQ",i](around:{radius_m},{lat},{lng});
);
out center tags 15;"""
            for srv in servers:
                raw = await safe_post(srv, {"data":q_osm}, 20.0)
                if not raw: continue
                seen, batch = set(), []
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
                    batch.append((dist,name,phone,typ,city,elat,elng))
                if batch: found = batch; break

        if found:
            found.sort(key=lambda x:x[0])
            lines=[]
            for dist,name,phone,typ,city,elat,elng in found[:3]:
                ph = f" | Phone: {phone}" if phone else ""
                ct = f" ({city})" if city else ""
                lines.append(f"  - {name}{ct} [{typ}] — {dist:.1f} km | GPS:{elat:.4f},{elng:.4f}{ph}")
            nearby_text = (
                "\nVERIFIED NEARBY HOSPITALS (OpenStreetMap, sorted closest first):\n"
                + "\n".join(lines)
                + "\nMANDATORY: Recommend ONLY the closest hospital above. No other options."
            )
        else:
            # No OSM data — geographic hard lock using resolved location
            big_cities  = {"lahore","karachi","islamabad","rawalpindi","faisalabad",
                           "multan","gujranwala","sialkot","peshawar","quetta"}
            is_big_city = any(c in (data.location or "").lower() for c in big_cities)
            lock_area   = district or data.location or "incident area"

            if is_big_city:
                nearby_text = (
                    f"\nNo OSM data near ({lat:.4f},{lng:.4f}).\n"
                    f"Incident: {data.location} | GPS: {lat:.5f},{lng:.5f}\n"
                    f"Recommend nearest major hospital IN {data.location} only."
                )
            else:
                nearby_text = (
                    f"\nNo OSM data found near ({lat:.4f},{lng:.4f}).\n"
                    f"EMT typed location: '{data.location}'\n"
                    f"Resolved: {loc_text} | GPS: {lat:.5f},{lng:.5f}\n"
                    f"District: {district or 'see typed location'} | Province: {province or 'Pakistan'}\n"
                    f"\nGEOGRAPHIC MANDATE — critical violation if ignored:\n"
                    f"1. Recommend ONLY a hospital in '{lock_area}' or its adjacent tehsil.\n"
                    f"2. STRICTLY FORBIDDEN: Do NOT name any hospital in Islamabad, Lahore,\n"
                    f"   Karachi, Rawalpindi, Faisalabad, Multan, or any city far from '{lock_area}'.\n"
                    f"3. Name the nearest DHQ (District HQ Hospital) or THQ for '{lock_area}'.\n"
                    f"4. OPTIMIZED ROUTE distance must reflect ACTUAL local road km — rural Pakistan\n"
                    f"   towns are typically 10-50 km from their district hospital, NOT 200-400km.\n"
                    f"5. If unsure which hospital, say: 'Nearest DHQ Hospital, {lock_area}' and\n"
                    f"   estimate ~15-40km from '{data.location}' on local roads."
                )

    # ── Step 3: Build prompt ──────────────────────────────────────────────────
    lang_note = ("Respond in Urdu (Nastaliq). TRIAGE LEVEL in English only."
                 if data.language=="ur-PK" else
                 "Respond in Roman Urdu. TRIAGE LEVEL in English only."
                 if data.language=="ru-PK" else
                 "Respond in clear English.")

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
        "OUTPUT FORMAT (exact headers required):\n"
        "CLASSIFICATION: [diagnosis]\n"
        "TRIAGE LEVEL: [Red-Critical|Yellow-Urgent|Green-Minor|Black-Expectant]\n"
        "RECOMMENDED FACILITY: [name, estimated distance km, phone if known]\n"
        "INSTRUCTIONS:\n[numbered steps]\n"
        "EQUIPMENT ADVICE:\n[bullet list]\n"
        "SOAP NOTE:\nS: ...\nO: ...\nA: ...\nP: ...\n"
        "PHYSICAL CONDITION:\n[head-to-toe]\n"
        f"OPTIMIZED ROUTE: [from '{data.location}' → [hospital name] — X km, ~Y min on local roads]\n"
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
    analysis = ""
    for model in ["llama-3.3-70b-versatile","llama-3.1-8b-instant","gemma2-9b-it"]:
        text = await groq_chat(model,[{"role":"system","content":system},
                                       {"role":"user","content":user_msg}],
                               max_tokens=1800, temperature=0.1)
        if text and text.strip():
            analysis = text; print(f"  triage: used {model}"); break

    if not analysis.strip():
        raise HTTPException(503, detail=(
            "All AI models failed. Open http://127.0.0.1:8000/debug — "
            "Windows Firewall may be blocking python.exe → api.groq.com"))

    triage_level = classification = ""
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