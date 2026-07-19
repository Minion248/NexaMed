// src/App.jsx  — NexaMed v3.2  ✅ ALL 4 BUGS FIXED
// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — CNIC:     Routes through backend /cnic/scan using FREE Groq LLaVA
//                   No Anthropic key needed — only GROQ_API_KEY in .env
// FIX 2 — GPS/MAP:  GPS + Leaflet map working. When GPS denied → typed-location
//                   fallback searches by city/area name via Nominatim (free)
// FIX 3 — VOICE:    Mic permission requested first, then TTS→Listen loop fixed.
//                   All 3 languages work. Chrome bug workaround applied.
// FIX 4 — LANGUAGE: Full RTL/LTR layout switch. All UI text translates across
//                   English / اردو (Urdu) / Roman Urdu. Form fields always LTR.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { jsPDF } from "jspdf";
import {
  Ambulance, Activity, PhoneCall, Stethoscope, Heart,
  Thermometer, Moon, Sun, Mic, Volume2, Square,
  Download, Navigation, MapPin, CheckCircle, Camera,
  Upload, History, RefreshCw, LogOut, User, X,
} from "lucide-react";
import {
  collection, addDoc, getDocs, query, where,
  orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./context/AuthContext";
import BiometricPanel from "./components/BiometricPanel";

const BACKEND = "http://127.0.0.1:8000";

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4 — FULL TRANSLATIONS: English / Urdu / Roman Urdu
// ═══════════════════════════════════════════════════════════════════════════
const T = {
  "en": {
    dir: "ltr", fontDir: "ltr",
    appSub: "EMT PCR COMMAND SYSTEM",
    tabs: ["Intake", "Hospitals", "History", "Vitals"],
    scanCNIC: "Scan CNIC", voiceQA: "Voice Q&A", stop: "Stop",
    location: "INCIDENT LOCATION", locationPh: "e.g. Gulberg Lahore, village name…",
    complaint: "CHIEF COMPLAINT & SCENE", complaintPh: "Describe symptoms, mechanism of injury…",
    patientName: "PATIENT NAME", namePh: "Full name",
    gender: "GENDER", cnicLabel: "CNIC (from scan)", cnicPh: "XXXXX-XXXXXXX-X",
    age: "AGE", agePh: "Yrs",
    hrLabel: "HR bpm", bpLabel: "BP", spo2Label: "SpO2 %",
    avpu: "CONSCIOUSNESS (AVPU)",
    avpuLevels: ["Alert", "Verbal", "Pain", "Unresponsive"],
    generate: "GENERATE PCR REPORT", generating: "GENERATING…",
    nearbyTitle: "REAL-TIME NEARBY FACILITIES", refreshGPS: "Refresh GPS",
    searchByLoc: "Search by Location Name",
    historyTitle: "PATIENT HISTORY", noHistory: "No previous visits found",
    scanFirst: "Scan a CNIC to load history",
    vitalsTitle: "VITALS TREND",
    narrate: "Narrate", pdf: "PDF", awaiting: "AWAITING EMERGENCY INPUT",
    condition: "CONDITION", triage: "TRIAGE",
    fieldInstr: "◈ FIELD INSTRUCTIONS", equipMeds: "◈ EQUIPMENT & MEDS",
    soapNote: "◈ SOAP NOTE", nearFacility: "◈ NEAREST FACILITIES (GPS)",
    physAssess: "◈ PHYSICAL ASSESSMENT", optimRoute: "◈ OPTIMIZED ROUTE",
    narratingMsg: "🔊 Narrating report…",
    online: "ONLINE", offline: "OFFLINE", checking: "CHECKING",
    gpsDeniedTitle: "⚠ GPS Permission Denied",
    gpsDeniedMsg: "To enable GPS in Chrome:",
    gpsDeniedSteps: [
      "Click the 🔒 lock icon in the Chrome address bar",
      "Click 'Site settings'",
      "Set Location → Allow",
      "Press F5 to reload, then click Refresh GPS",
    ],
    gpsAltTitle: "🗺 No GPS? Use Location Name Instead:",
    gpsAltMsg: "Type a city/area in Incident Location field (Intake tab), then click below.",
    gpsSearchBtn: "Find Hospitals Near Typed Location",
    gpsNoResult: "No facilities found. Try a larger area or check internet.",
    voiceErr: "Voice needs Google Chrome. Open this page in Chrome.",
    micDenied: "Microphone access denied. Allow mic in browser settings.",
    cnicTitle: "Scan CNIC Card",
    cnicSub: "AI reads name, age, CNIC number and address automatically",
    takePhoto: "Take Photo with Camera", uploadImg: "Upload Image from Device",
    cnicHint: "JPG, PNG — front side of CNIC only",
    holdFrame: "Hold CNIC inside frame", capture: "Capture", back: "← Back",
    reading: "Reading CNIC with AI…", extracted: "✓ EXTRACTED DATA",
    rescan: "Re-scan", useData: "Use This Data", tryAgain: "Try Again",
    nearest: "NEAREST", navigate: "Navigate",
    visit: "Visit #", voiceStep: "Step", voiceOf: "of",
    speaking: "🔊 Speaking…", listening: "🎙 Listening…",
    processing: "🔄 Processing Voice…", voiceSaved: "✅ Step Saved! Moving next…",
    done: "✓ Done", voiceError: "⚠ Error",
    voiceComplete: "Voice interview complete! Form auto-filled.",
    cnicApplied: "CNIC applied", age2: "age",
    pcrSaved: "PCR saved", backendErr: "Backend error",
    gender_m: "Male", gender_f: "Female", gender_o: "Other",
  },
  "ur": {
    dir: "rtl", fontDir: "rtl",
    appSub: "ای ایم ٹی پی سی آر سسٹم",
    tabs: ["اندراج", "اسپتال", "تاریخ", "اعداد"],
    scanCNIC: "شناختی کارڈ اسکین", voiceQA: "آواز سوال", stop: "روکیں",
    location: "واقعے کی جگہ", locationPh: "مثلاً گلبرگ لاہور، گاؤں کا نام…",
    complaint: "مرکزی شکایت", complaintPh: "علامات اور چوٹ کی وجہ بیان کریں…",
    patientName: "مریض کا نام", namePh: "پورا نام",
    gender: "جنس", cnicLabel: "شناختی نمبر", cnicPh: "XXXXX-XXXXXXX-X",
    age: "عمر", agePh: "سال",
    hrLabel: "دل کی دھڑکن", bpLabel: "بلڈ پریشر", spo2Label: "آکسیجن %",
    avpu: "شعور کی سطح (AVPU)",
    avpuLevels: ["ہوشیار", "آواز", "درد", "بے ہوش"],
    generate: "رپورٹ بنائیں", generating: "بن رہا ہے…",
    nearbyTitle: "قریبی طبی مراکز", refreshGPS: "GPS تازہ کریں",
    searchByLoc: "مقام کے نام سے تلاش کریں",
    historyTitle: "مریض کی تاریخ", noHistory: "پچھلے دورے نہیں ملے",
    scanFirst: "تاریخ دیکھنے کے لیے شناختی کارڈ اسکین کریں",
    vitalsTitle: "علامات کا رجحان",
    narrate: "سنیں", pdf: "PDF", awaiting: "ایمرجنسی ڈیٹا کا انتظار",
    condition: "حالت", triage: "درجہ بندی",
    fieldInstr: "◈ ہدایات", equipMeds: "◈ سامان و ادویات",
    soapNote: "◈ SOAP نوٹ", nearFacility: "◈ قریبی مراکز",
    physAssess: "◈ جسمانی معائنہ", optimRoute: "◈ بہترین راستہ",
    narratingMsg: "🔊 رپورٹ سنائی جا رہی ہے…",
    online: "آن لائن", offline: "آف لائن", checking: "جانچ",
    gpsDeniedTitle: "⚠ GPS کی اجازت نہیں",
    gpsDeniedMsg: "Chrome میں GPS فعال کرنے کا طریقہ:",
    gpsDeniedSteps: [
      "Chrome ایڈریس بار میں 🔒 آئیکن کلک کریں",
      "'Site settings' کلک کریں",
      "Location → Allow سیٹ کریں",
      "F5 دبائیں اور GPS تازہ کریں",
    ],
    gpsAltTitle: "🗺 GPS نہیں؟ مقام کا نام استعمال کریں:",
    gpsAltMsg: "Intake میں مقام لکھیں، پھر نیچے کلک کریں۔",
    gpsSearchBtn: "مقام کے قریب اسپتال تلاش کریں",
    gpsNoResult: "قریب کوئی مرکز نہیں۔ GPS آن کریں یا بڑا علاقہ آزمائیں۔",
    voiceErr: "آواز کے لیے گوگل کروم درکار ہے۔",
    micDenied: "مائکروفون کی اجازت نہیں۔ براؤزر سیٹنگز میں اجازت دیں۔",
    cnicTitle: "شناختی کارڈ اسکین کریں",
    cnicSub: "AI خودبخود نام، عمر، نمبر اور پتہ نکالتا ہے",
    takePhoto: "کیمرے سے تصویر لیں", uploadImg: "ڈیوائس سے تصویر اپ لوڈ کریں",
    cnicHint: "JPG، PNG — صرف سامنے کی طرف",
    holdFrame: "کارڈ فریم کے اندر رکھیں", capture: "تصویر لیں", back: "← واپس",
    reading: "AI سے پڑھ رہا ہے…", extracted: "✓ نکالا گیا ڈیٹا",
    rescan: "دوبارہ اسکین", useData: "یہ ڈیٹا استعمال کریں", tryAgain: "دوبارہ کوشش کریں",
    nearest: "قریب ترین", navigate: "راستہ",
    visit: "دورہ #", voiceStep: "مرحلہ", voiceOf: "میں سے",
    speaking: "🔊 بول رہا ہے…", listening: "🎙 سن رہا ہے…",
    processing: "🔄 آواز پر کارروائی ہو رہی ہے…", voiceSaved: "✅ محفوظ ہو گیا! اگلا سوال…",
    done: "✓ مکمل", voiceError: "⚠ خرابی",
    voiceComplete: "آواز مکمل! فارم بھر گیا۔",
    cnicApplied: "شناختی کارڈ لگایا گیا", age2: "عمر",
    pcrSaved: "رپورٹ محفوظ", backendErr: "سرور خرابی",
    gender_m: "مرد", gender_f: "عورت", gender_o: "دیگر",
  },
  "ru": {
    dir: "ltr", fontDir: "ltr",
    appSub: "EMT PCR COMMAND SYSTEM",
    tabs: ["Intake", "Aspataal", "Taareekh", "Vitals"],
    scanCNIC: "CNIC Scan Karein", voiceQA: "Awaz Q&A", stop: "Band Karein",
    location: "WAQYE KI JAGAH", locationPh: "Maslan: Gulberg Lahore, gaon ka naam…",
    complaint: "MUKHYA SHIKAYAT", complaintPh: "Alamat, chot ki wajah bayan karein…",
    patientName: "MAREEZ KA NAAM", namePh: "Poora naam",
    gender: "JINS", cnicLabel: "CNIC (Scan se)", cnicPh: "XXXXX-XXXXXXX-X",
    age: "UMAR", agePh: "Saal",
    hrLabel: "Dhadkan", bpLabel: "BP", spo2Label: "Oxygen %",
    avpu: "HOSH KA DARJA (AVPU)",
    avpuLevels: ["Hoshyaar", "Awaaz", "Dard", "Behosh"],
    generate: "PCR REPORT BANAO", generating: "Ban raha hai…",
    nearbyTitle: "QAREEB TIBBI MARAKAZ", refreshGPS: "GPS Taaza Karein",
    searchByLoc: "Jagah ke naam se talash karein",
    historyTitle: "MAREEZ KI TAAREEKH", noHistory: "Koi purani visit nahi mili",
    scanFirst: "Taareekh ke liye CNIC scan karein",
    vitalsTitle: "Vital Signs ka Rukhan",
    narrate: "Sunein", pdf: "PDF", awaiting: "EMERGENCY DATA KA INTIZAAR",
    condition: "HALAT", triage: "DARJABANDI",
    fieldInstr: "◈ HIDAYAAT", equipMeds: "◈ SAMAN AUR DAWAIYAAN",
    soapNote: "◈ SOAP Note", nearFacility: "◈ QAREEB MARAKAZ",
    physAssess: "◈ JISMANI MUAAINA", optimRoute: "◈ BEHTAREEN RAASTA",
    narratingMsg: "🔊 Report sun raha hai…",
    online: "ONLINE", offline: "OFFLINE", checking: "Jaanch ho rahi hai",
    gpsDeniedTitle: "⚠ GPS ijaazat nahi mili",
    gpsDeniedMsg: "Chrome mein GPS on karne ka tareeqa:",
    gpsDeniedSteps: [
      "Chrome address bar mein 🔒 icon click karein",
      "'Site settings' click karein",
      "Location → Allow set karein",
      "F5 dabayein, phir GPS Taaza Karein click karein",
    ],
    gpsAltTitle: "🗺 GPS nahi? Jagah ka naam istemal karein:",
    gpsAltMsg: "Intake mein jagah likhein, phir neeche click karein.",
    gpsSearchBtn: "Likhay gaye maqam ke qareeb aspataal talaash karein",
    gpsNoResult: "Qareeb koi markaz nahi. Bada ilaqa azmayen ya internet check karein.",
    voiceErr: "Awaaz ke liye Google Chrome chahiye.",
    micDenied: "Microphone ki ijaazat nahi. Browser settings mein allow karein.",
    cnicTitle: "CNIC Card Scan Karein",
    cnicSub: "AI khud naam, umar, CNIC number aur pata nikalega",
    takePhoto: "Camera se Tasveer Lein", uploadImg: "Device se Upload Karein",
    cnicHint: "JPG, PNG — sirf aagay ki taraf",
    holdFrame: "Card frame ke andar rakhein", capture: "Tasveer Lein", back: "← Wapas",
    reading: "AI se parh raha hai…", extracted: "✓ NIKALA GAYA DATA",
    rescan: "Dobara Scan", useData: "Yeh Data Use Karein", tryAgain: "Dobara Koshish Karein",
    nearest: "QAREEB TAREEN", navigate: "Raasta Dekhein",
    visit: "Visit #", voiceStep: "Marhalay", voiceOf: "mein se",
    speaking: "🔊 Bol raha hai…", listening: "🎙 Sun raha hai…",
    processing: "🔄 Awaz process ho rahi hai…", voiceSaved: "✅ Save ho gaya! Agla sawal…",
    done: "✓ Mukammal", voiceError: "⚠ Kharabi",
    voiceComplete: "Awaaz mukammal! Form bhar gaya.",
    cnicApplied: "CNIC laga diya", age2: "umar",
    pcrSaved: "Report mehfooz", backendErr: "Server kharabi",
    gender_m: "Mard", gender_f: "Aurat", gender_o: "Degar",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// VOICE QUESTIONS — all 3 languages
// ═══════════════════════════════════════════════════════════════════════════
// Field keys match the actual `form` state shape used throughout the app
// (name, father_name, description, heart_rate, blood_pressure,
// oxygen_saturation, location, allergies) — not placeholder names, so voice
// answers land in the same fields the visible inputs are bound to.
const VOICE_FIELDS = [
  "location", "description", "name", "father_name", "cnic",
  "age", "heart_rate", "blood_pressure", "oxygen_saturation", "allergies",
];
const VOICE_QS = {
  "en": [
    "Where did the incident occur?",
    "Describe the emergency. What are the symptoms and how did it happen?",
    "What is the patient's full name?",
    "What is the patient's father's or husband's name?",
    "Please state the patient's 13-digit CNIC number if known.",
    "What is the patient's age in years?",
    "What is the heart rate in beats per minute?",
    "What is the blood pressure reading? For example, 120 over 80.",
    "What is the oxygen saturation percentage?",
    "List any known allergies, or say 'none'.",
  ],
  "ur": [
    "واقعہ کہاں پیش آیا؟",
    "ایمرجنسی کیا ہے؟ علامات کیا ہیں؟",
    "مریض کا پورا نام کیا ہے؟",
    "مریض کے والد یا شوہر کا نام کیا ہے؟",
    "اگر معلوم ہو تو مریض کا 13 ہندسوں پر مشتمل شناختی کارڈ نمبر بتائیں۔",
    "مریض کی عمر کتنی ہے؟",
    "دل کی دھڑکن فی منٹ کتنی ہے؟",
    "بلڈ پریشر کیا ہے؟",
    "آکسیجن کی سطح کیا ہے؟",
    "کوئی معلوم الرجی ہو تو بتائیں، ورنہ 'کوئی نہیں' کہیں۔",
  ],
  "ru": [
    "Waqia kahan pesh aaya?",
    "Emergency kya hai? Alamat kya hain aur kaise hua?",
    "Mareez ka poora naam kya hai?",
    "Mareez ke walid ya shohar ka naam kya hai?",
    "Agar maloom ho to mareez ka 13 digit ka shanakhti card number bataein.",
    "Mareez ki umar kitni saal hai?",
    "Dil ki dhadkan per minute kitni hai?",
    "Blood pressure kya hai? Systolic over diastolic bolein.",
    "Oxygen saturation kitni hai?",
    "Koi maloom allergy ho to batayein, warna 'koi nahi' kahein.",
  ],
};
// gTTS language codes (server-side TTS via /api/voice/tts).
// Roman Urdu: the EMT is still speaking Urdu words out loud, just displayed in
// Latin script in the UI — so it uses the Urdu voice/model, not English.
const TTS_LANG = { "en": "en", "ur": "ur", "ru": "ur" };
// STT no longer needs a locale code — Groq's whisper-large-v3 *translation*
// endpoint auto-detects the spoken language and always outputs English.

// ── Voice hallucination/filler filter ────────────────────────────────────────
// Whisper (and STT models generally) frequently hallucinate short filler
// phrases on near-silent/ambient-noise audio — "you" and "Thank you." are the
// two classic cases. These must never be written into a clinical field.
const VOICE_FILLER_PHRASES = ["you", "thank you", "um", "uh", "go", "bye"];
function isVoiceFiller(text) {
  const cleaned = (text || "").toLowerCase().trim().replace(/[.,!?]+$/g, "").trim();
  if (!cleaned) return true;
  if (VOICE_FILLER_PHRASES.includes(cleaned)) return true;
  // "contains only these words" — strip every filler phrase out and see if
  // anything meaningful is left over.
  let remainder = cleaned;
  for (const phrase of VOICE_FILLER_PHRASES) remainder = remainder.split(phrase).join(" ");
  return remainder.trim().length === 0;
}

// ── Spoken-number → digits (covers realistic vitals ranges, 0-999) ──────────
// Whisper usually already renders spoken numbers as digits, but this is a
// fallback for cases where it doesn't (e.g. "eighty five" spoken slowly).
const VOICE_NUM_ONES = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9,
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16,
  seventeen:17, eighteen:18, nineteen:19 };
const VOICE_NUM_TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
function wordsToNumber(text) {
  const words = (text || "").toLowerCase().replace(/-/g, " ").split(/\s+/).filter(Boolean);
  let current = 0, found = false;
  for (const w of words) {
    if (w === "and") continue;
    if (w in VOICE_NUM_ONES)       { current += VOICE_NUM_ONES[w]; found = true; }
    else if (w in VOICE_NUM_TENS)  { current += VOICE_NUM_TENS[w]; found = true; }
    else if (w === "hundred")      { current = (current || 1) * 100; found = true; }
    else if (/^\d+$/.test(w))      { current += parseInt(w, 10); found = true; }
  }
  return found ? current : null;
}

// Extract a single integer for a plain numeric vitals field (age, HR, SpO2).
// Never writes alphabetic junk — an unparseable answer becomes an empty
// field for manual entry, not garbled text sitting in a number-shaped box.
function parseNumericField(text) {
  const digitMatch = (text || "").match(/\d+/);
  if (digitMatch) return digitMatch[0];
  const asWords = wordsToNumber(text);
  return asWords != null ? String(asWords) : "";
}

// "120 over 80" / "120/80" -> "120/80". Falls back to the trimmed raw text
// if fewer than two numbers are found, rather than silently dropping it.
function parseBloodPressure(text) {
  const nums = (text || "").match(/\d+/g);
  if (nums && nums.length >= 2) return `${nums[0]}/${nums[1]}`;
  if (nums && nums.length === 1) return nums[0];
  return (text || "").trim();
}

// Extract exactly 13 digits and format as XXXXX-XXXXXXX-X. A partial/garbled
// read is left as raw digits (not force-padded into a fake-looking CNIC) so
// the EMT can see and correct it manually.
function parseCNIC(text) {
  const digits = (text || "").replace(/\D/g, "");
  if (digits.length === 13) return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  return digits;
}

function capitalizeFirst(text) {
  const t = (text || "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// ── Route a raw transcript through the correct parser for its target field ──
const VOICE_NUMERIC_FIELDS      = new Set(["age", "heart_rate", "oxygen_saturation"]);
const VOICE_CAPITALIZED_FIELDS  = new Set(["name", "father_name", "location"]);
function parseVoiceField(fieldKey, rawText) {
  const trimmed = (rawText || "").trim();
  if (fieldKey === "cnic")            return parseCNIC(trimmed);
  if (fieldKey === "blood_pressure")  return parseBloodPressure(trimmed);
  if (VOICE_NUMERIC_FIELDS.has(fieldKey))     return parseNumericField(trimmed);
  if (VOICE_CAPITALIZED_FIELDS.has(fieldKey)) return capitalizeFirst(trimmed);
  return trimmed; // description, allergies — plain trim only
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRESTORE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function fsSave(payload, uid) {
  try {
    const ref = await addDoc(collection(db, "pcr_reports"), { ...payload, uid, createdAt: serverTimestamp() });
    return ref.id;
  } catch (e) { console.warn("Firestore save:", e.message); return null; }
}
async function fsHistory(cnic) {
  if (!cnic) return [];
  try {
    const q = query(collection(db, "pcr_reports"), where("cnic","==",cnic), orderBy("createdAt","desc"));
    return (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    try {
      const q2 = query(collection(db, "pcr_reports"), where("cnic","==",cnic));
      return (await getDocs(q2)).docs.map(d => ({ id: d.id, ...d.data() }));
    } catch { return []; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CNIC SCANNER — routes to /cnic/scan with selected engine
// ═══════════════════════════════════════════════════════════════════════════
async function scanCNICviaBackend(file, scan_method = "auto") {
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error("File read failed"));
    r.onload  = e => res(e.target.result.split(",")[1]);
    r.readAsDataURL(file);
  });

  const resp = await fetch(`${BACKEND}/cnic/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: b64, media_type: file.type || "image/jpeg", scan_method }),
    signal: AbortSignal.timeout(90000), // 90s — EasyOCR model download on first use
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      err.detail ||
      `Backend error ${resp.status}. Make sure uvicorn is running.`
    );
  }
  const json = await resp.json();
  if (!json.data) throw new Error("No data returned from backend");
  return json.data;
}


// ═══════════════════════════════════════════════════════════════════════════
// VOICE ENGINE — TTS via backend gTTS (/api/voice/tts, plays through an
// <audio> element for a natural voice); STT via MediaRecorder + Groq's hosted
// whisper-large-v3 *translation* endpoint (/api/voice/stt) — the EMT can speak
// Urdu, Roman Urdu, or English and it comes back as English text in one step.
// Recording is continuous from the moment listening starts; nothing is
// transcribed or advanced until the EMT taps "Submit Answer".
// All stale closures eliminated via refs.
// ═══════════════════════════════════════════════════════════════════════════
function useVoice(lang, onFieldUpdate, onFinish) {
  const [stepIdx, setStepIdx] = useState(-1);
  const [status,  setStatus]  = useState("idle"); // idle|speaking|listening|processing|saved|done|error
  const [errMsg,  setErrMsg]  = useState("");

  const stoppedRef   = useRef(false);  // user pressed Stop — block all callbacks
  const collRef      = useRef({});
  const langRef      = useRef(lang);
  const onUpdateRef  = useRef(onFieldUpdate);
  const onFinishRef  = useRef(onFinish);
  const micStreamRef = useRef(null);   // live mic MediaStream (kept open across steps)
  const stepIdxRef   = useRef(-1);
  const advanceTimerRef = useRef(null); // processing→saved→advance visual pipeline
  const audioRef      = useRef(null);   // <audio> currently playing the TTS mp3
  const recorderRef   = useRef(null);   // active MediaRecorder for the current step
  const chunksRef      = useRef([]);    // recorded Blob chunks for the current step

  useEffect(() => { langRef.current    = lang; },          [lang]);
  useEffect(() => { onUpdateRef.current = onFieldUpdate; }, [onFieldUpdate]);
  useEffect(() => { onFinishRef.current = onFinish; },      [onFinish]);
  useEffect(() => { stepIdxRef.current  = stepIdx; },       [stepIdx]);

  const prompts = VOICE_QS[lang] || VOICE_QS["en"];

  const stopTTS = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
  }, []);

  // Stop the active recorder without uploading anything (used by skip/killAll).
  const discardRecording = useCallback(() => {
    try { if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const killAll = useCallback(() => {
    stoppedRef.current = true;   // block any pending callbacks immediately
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    stopTTS();
    discardRecording();
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
  }, [stopTTS, discardRecording]);

  const stop = useCallback(() => {
    killAll();
    setStepIdx(-1); stepIdxRef.current = -1;
    setStatus("idle"); setErrMsg("");
    collRef.current = {};
    // Reset stopped flag so a new session can start
    setTimeout(() => { stoppedRef.current = false; }, 100);
  }, [killAll]);

  // ── advanceFrom: shared step-advancement logic — used by submitAnswer and
  // the manual "Skip Question" action ─────────────────────────────────────────
  const advanceFrom = useCallback((i) => {
    if (stoppedRef.current) return;  // user pressed Stop — don't advance
    const curLang = langRef.current;
    const total   = (VOICE_QS[curLang] || VOICE_QS["en"]).length;
    const next    = i + 1;
    if (next >= total) {
      killAll();
      setStatus("done");
      onFinishRef.current({ ...collRef.current });
      setStepIdx(-1); stepIdxRef.current = -1;
    } else {
      setStepIdx(next); stepIdxRef.current = next;
    }
  }, [killAll]);

  // Holds the latest startRecording so it can be re-armed without a
  // self-reference before its own declaration completes.
  const startRecordingRef = useRef(null);

  // ── startRecording: arm a MediaRecorder for the current step. Recording just
  // runs continuously — no live transcript, no auto-advance — until the EMT
  // taps "Submit Answer" or "Skip Question" (both read stepIdxRef themselves,
  // so this needs no step-index argument) ─────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      // Release any previous stream and request a completely fresh one for
      // this recording — guarantees live, unmuted tracks every time rather
      // than reusing tracks that may have gone stale after a prior
      // MediaRecorder session on the same stream.
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stoppedRef.current) return; // Stop pressed while awaiting permission

      const rec = new MediaRecorder(micStreamRef.current);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onerror = e => {
        console.warn(`MediaRecorder error: ${e.error?.message || e.error}`);
        setStatus("error"); setErrMsg("micDenied");
      };
      recorderRef.current = rec;
      rec.start();
      setStatus("listening");
    } catch {
      setStatus("error"); setErrMsg("micDenied");
    }
  }, []);

  useEffect(() => { startRecordingRef.current = startRecording; }, [startRecording]);

  // Holds the latest tryWebSpeechFallback so finalizeTranscript can escalate
  // to it without a circular useCallback dependency (the two reference each
  // other: cloud filler → fallback; fallback filler → give up).
  const tryWebSpeechFallbackRef = useRef(null);

  // ── finalizeTranscript: shared by the cloud (Groq) path and the browser
  // fallback path below — filter hallucinations, parse for the target field,
  // write to state, THEN advance. This is the ONLY place either path may
  // advance the step, and a step is ONLY advanced once a real, non-filler
  // transcript has actually been written.
  //
  // Groq returns a confident HTTP 200 even when it hallucinated "you" on
  // silence — that's not a fetch failure, so a filler/empty result from the
  // CLOUD path is treated as a pipeline failure and escalates straight to
  // the browser fallback instead of retrying the same failing cloud call.
  // A filler/empty result from the FALLBACK path itself means both routes
  // failed — stop there, no more retries, leave the step for manual entry.
  const finalizeTranscript = useCallback((fieldKey, i, rawTranscript, isFallbackAttempt = false) => {
    if (isVoiceFiller(rawTranscript)) {
      if (!isFallbackAttempt) {
        console.warn(`Voice: cloud transcript for "${fieldKey}" on step ${i} rejected as filler/empty: "${rawTranscript}" — escalating to browser fallback`);
        tryWebSpeechFallbackRef.current?.(fieldKey, i);
        return;
      }
      console.warn(`Voice: browser fallback transcript for "${fieldKey}" on step ${i} ALSO rejected as filler/empty: "${rawTranscript}" — both routes failed`);
      setErrMsg("No clear speech detected on cloud or local fallback — type this field manually or tap Skip Question.");
      setStatus("error");
      return;
    }
    const parsedValue = parseVoiceField(fieldKey, rawTranscript);
    collRef.current[fieldKey] = parsedValue;
    onUpdateRef.current(fieldKey, parsedValue);

    setStatus("saved");
    advanceTimerRef.current = setTimeout(() => {
      if (!stoppedRef.current) advanceFrom(i);
    }, 650);
  }, [advanceFrom]);

  // ── tryWebSpeechFallback: cloud STT failed (network/HTTP error) or
  // hallucinated a filler transcript — fall back to the browser's own
  // SpeechRecognition. A valid result runs through the SAME field parsers
  // and advances via finalizeTranscript; if the fallback ALSO can't detect
  // speech, the step holds (see finalizeTranscript / onerror / onend below)
  // instead of looping forever.
  const tryWebSpeechFallback = useCallback((fieldKey, i) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn(`Voice: no browser SpeechRecognition available for fallback on "${fieldKey}"`);
      setErrMsg("Cloud STT failed and this browser has no local fallback — type this field manually or tap Skip Question.");
      setStatus("error");
      return;
    }

    const rec = new SR();
    rec.lang            = "en-US"; // last-resort fallback: transcription only, no translation
    rec.continuous       = false;
    rec.interimResults   = false;
    rec.maxAlternatives  = 1;

    let handled = false;
    rec.onresult = e => {
      if (handled) return;
      handled = true;
      finalizeTranscript(fieldKey, i, e.results[0]?.[0]?.transcript?.trim() || "", true);
    };
    rec.onerror = () => {
      if (handled) return;
      handled = true;
      console.warn(`Voice: browser fallback SpeechRecognition errored for "${fieldKey}" — both routes failed`);
      setErrMsg("Cloud STT and local fallback both failed — type this field manually or tap Skip Question.");
      setStatus("error");
    };
    rec.onend = () => {
      if (handled) return;
      handled = true;
      console.warn(`Voice: no speech detected by browser fallback for "${fieldKey}" — both routes failed`);
      setErrMsg("No speech detected — type this field manually or tap Skip Question.");
      setStatus("error");
    };

    console.warn(`Voice: cloud STT failed/hallucinated for "${fieldKey}" — trying browser SpeechRecognition fallback`);
    try { rec.start(); }
    catch { setErrMsg("micDenied"); setStatus("error"); }
  }, [finalizeTranscript]);

  useEffect(() => { tryWebSpeechFallbackRef.current = tryWebSpeechFallback; }, [tryWebSpeechFallback]);

  // ── submitAnswer: EMT is done speaking — ONLY stops the recorder here.
  // Everything else (assembling the blob, uploading, parsing, advancing)
  // happens inside rec.onstop, which the browser guarantees fires strictly
  // after the final ondataavailable chunk has already landed in chunksRef —
  // there is no path where the upload can fire on a still-assembling blob.
  const submitAnswer = useCallback(() => {
    const i = stepIdxRef.current;
    const rec = recorderRef.current;
    if (stoppedRef.current || i < 0 || !rec || rec.state === "inactive") return;

    setStatus("processing");
    rec.onstop = async () => {
      recorderRef.current = null;
      // 1. Assemble the blob from chunksRef (already complete — see note above).
      const audioBlob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      // 2. Clear the chunks array for the next step.
      chunksRef.current = [];

      const fieldKey = VOICE_FIELDS[i];

      if (audioBlob.size === 0) {
        // Nothing captured at all — MediaRecorder itself produced no audio,
        // so retrying the same recorder is unlikely to help. Escalate
        // straight to the browser's own SpeechRecognition (separate mic
        // capture path) instead of looping on a recorder that isn't working.
        console.warn(`Voice: empty recording for "${fieldKey}" on step ${i} — escalating to browser fallback`);
        tryWebSpeechFallback(fieldKey, i);
        return;
      }

      // 3. Post to the backend.
      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        const response = await fetch(`${BACKEND}/api/voice/stt`, {
          method: "POST", body: formData, signal: AbortSignal.timeout(30000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `STT HTTP ${response.status}`);

        // 4. Parse response, filter hallucinations, write to state, then advance.
        finalizeTranscript(fieldKey, i, (data.transcript || "").trim());
      } catch (error) {
        if (stoppedRef.current) return;
        // 5. Cloud STT failed (network error, timeout, or Groq rejecting the
        // request — e.g. a model blocked at the org level) — fall back to
        // the browser's native recognizer instead of leaving the EMT stuck.
        console.warn(`STT error (cloud): ${error.message}`);
        tryWebSpeechFallback(fieldKey, i);
      }
    };
    try { rec.stop(); } catch { rec.onstop(); }
  }, [finalizeTranscript, tryWebSpeechFallback]);

  // ── skip: manual "Skip Question" — discard the recording/TTS, advance immediately ──
  const skip = useCallback(() => {
    if (stoppedRef.current || stepIdxRef.current < 0) return;
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    discardRecording();
    stopTTS();
    advanceFrom(stepIdxRef.current);
  }, [advanceFrom, stopTTS, discardRecording]);

  // ── speakStep: fetch TTS audio from the backend and play it, then start
  // recording the EMT's answer once playback finishes ─────────────────────────
  const speakStep = useCallback(async (i) => {
    stopTTS();
    const curLang = langRef.current;
    const curQs   = VOICE_QS[curLang] || VOICE_QS["en"];
    if (i >= curQs.length) return;

    setStatus("speaking");

    let audioUrl = null;
    try {
      const resp = await fetch(`${BACKEND}/api/voice/tts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: curQs[i], lang: TTS_LANG[curLang] || "en" }),
        signal:  AbortSignal.timeout(15000),
      });
      if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (stoppedRef.current) return;

      audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      const proceedToListening = () => {
        if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
        if (!stoppedRef.current) startRecordingRef.current?.();
      };
      audio.onended = proceedToListening;
      audio.onerror = proceedToListening;
      await audio.play();
    } catch {
      if (audioUrl) { URL.revokeObjectURL(audioUrl); }
      // TTS unavailable — still let the EMT answer the (silently skipped) question
      if (!stoppedRef.current) startRecordingRef.current?.();
    }
  }, [stopTTS]);

  // Drive the interview: each stepIdx change triggers speak+listen
  useEffect(() => {
    if (stepIdx >= 0) speakStep(stepIdx);
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    if (!window.MediaRecorder) {
      setStatus("error"); setErrMsg("noSR"); return;
    }
    // Get mic permission first — keeps stream alive so the browser doesn't
    // re-prompt on every question.
    stoppedRef.current = false;  // clear stop flag for new session
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        micStreamRef.current = stream;
        collRef.current = {};
        setErrMsg("");
        setStepIdx(0); stepIdxRef.current = 0;
      })
      .catch(() => { setStatus("error"); setErrMsg("micDenied"); });
  }, []);

  return {
    status, errMsg, stepIdx,
    totalSteps:    prompts.length,
    // "error" deliberately stays active — that's the stuck-on-step state
    // where the EMT needs the progress card (and its Skip Question button)
    // to still be visible, not hidden the moment both STT routes fail.
    isActive:      stepIdx >= 0 && status !== "done",
    currentPrompt: stepIdx >= 0 && stepIdx < prompts.length ? prompts[stepIdx] : "",
    start, stop, skip, submitAnswer,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAFLET MAP — shows incident location + all hospitals + OSRM route
// ═══════════════════════════════════════════════════════════════════════════
async function loadLeaflet() {
  if (window.L) return window.L;
  if (!document.getElementById("leaflet-css")) {
    const link = document.createElement("link");
    link.id = "leaflet-css"; link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
  if (!window._leafletLoading) {
    window._leafletLoading = new Promise(res => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = res; document.head.appendChild(s);
    });
  }
  await window._leafletLoading;
  return window.L;
}

// Single hospital marker map (used in result panel)
function LeafletMap({ lat, lng, name }) {
  const containerId = useRef(`lmap-${Math.random().toString(36).slice(2)}`);
  const mapRef      = useRef(null);

  useEffect(() => {
    if (!lat || !lng) return;
    const init = async () => {
      const L  = await loadLeaflet();
      const el = document.getElementById(containerId.current);
      if (!el || mapRef.current) return;
      const map = L.map(el, { zoomControl:true, scrollWheelZoom:false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(`<b>${name || "Hospital"}</b>`).openPopup();
      mapRef.current = map;
    };
    init().catch(console.error);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [lat, lng, name]);

  return <div id={containerId.current} style={{ width:"100%", height:200 }} />;
}

// Full emergency map: incident marker + hospital markers + route
function EmergencyMap({ incidentLat, incidentLng, incidentLabel, hospitals, triageColor: tColor }) {
  const containerId = useRef(`emap-${Math.random().toString(36).slice(2)}`);
  const mapRef      = useRef(null);
  const routeRef    = useRef(null);

  // Serialize hospitals to a string key to detect changes
  const hospitalsKey = hospitals.map(h => `${h.lat},${h.lng}`).join("|");

  useEffect(() => {
    const hasIncident  = incidentLat && incidentLng && Math.abs(incidentLat) > 0.1 && Math.abs(incidentLng) > 0.1;
    const hasHospitals = hospitals && hospitals.length > 0;
    if (!hasIncident && !hasHospitals) return;

    const init = async () => {
      const L = await loadLeaflet();
      const el = document.getElementById(containerId.current);
      if (!el) return;

      // Destroy old map instance if it exists
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; routeRef.current = null; }

      // Determine map center — incident location preferred
      const centerLat = hasIncident ? incidentLat : hospitals[0].lat;
      const centerLng = hasIncident ? incidentLng : hospitals[0].lng;
      const zoom      = hasIncident && hasHospitals ? 13 : 14;

      const map = L.map(el, { zoomControl: true, scrollWheelZoom: true }).setView([centerLat, centerLng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors", maxZoom: 19,
      }).addTo(map);

      const bounds = [];

      // ── Incident location marker (red pin) ────────────────────────────────
      if (hasIncident) {
        const incIcon = L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${tColor || "#ef4444"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        });
        L.marker([incidentLat, incidentLng], { icon: incIcon })
          .addTo(map)
          .bindPopup(`<b>🚨 Incident</b><br/>${incidentLabel || "Emergency Location"}`);
        bounds.push([incidentLat, incidentLng]);
      }

      // ── Hospital markers ──────────────────────────────────────────────────
      hospitals.forEach((h, i) => {
        if (!h.lat || !h.lng) return;
        const isNearest = i === 0;
        const bgColor   = isNearest ? "#3b82f6" : "#6b7280";
        const hIcon = L.divIcon({
          className: "",
          html: `<div style="width:${isNearest?20:14}px;height:${isNearest?20:14}px;border-radius:4px;background:${bgColor};border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:${isNearest?10:8}px;font-weight:900">H</div>`,
          iconSize: [isNearest ? 20 : 14, isNearest ? 20 : 14],
          iconAnchor: [isNearest ? 10 : 7, isNearest ? 10 : 7],
        });
        const popup = `<b>${i === 0 ? "🏥 Nearest: " : ""} ${h.name}</b><br/>📍 ${h.dist_km} km away${h.phone && h.phone !== "N/A" ? `<br/>📞 ${h.phone}` : ""}${h.address ? `<br/>${h.address}` : ""}`;
        L.marker([h.lat, h.lng], { icon: hIcon }).addTo(map).bindPopup(popup);
        bounds.push([h.lat, h.lng]);
      });

      // Fit map to show all markers
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }

      // ── OSRM Route: incident → nearest hospital ───────────────────────────
      if (hasIncident && hasHospitals) {
        const h0 = hospitals[0];
        const routeColor = tColor || "#3b82f6";
        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${incidentLng},${incidentLat};${h0.lng},${h0.lat}?overview=full&geometries=geojson&steps=false`;
          const resp = await fetch(osrmUrl, { signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            const data = await resp.json();
            if (data.routes && data.routes[0]) {
              const route    = data.routes[0];
              const coords   = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
              const distKm   = (route.distance / 1000).toFixed(1);
              const timeMins = Math.round(route.duration / 60);
              // Draw route polyline
              const poly = L.polyline(coords, {
                color: routeColor, weight: 4, opacity: 0.85,
                dashArray: null,
              }).addTo(map);
              // Route info popup at midpoint
              const mid = coords[Math.floor(coords.length / 2)];
              L.popup({ closeButton: false, className: "route-popup" })
                .setLatLng(mid)
                .setContent(`<div style="font-weight:800;font-size:12px">🚑 Route: ${distKm} km · ~${timeMins} min</div>`)
                .openOn(map);
              routeRef.current = poly;
            }
          }
        } catch (e) {
          console.warn("OSRM routing failed:", e.message);
          // Fallback: draw a straight dashed line
          const fallbackLine = L.polyline([[incidentLat, incidentLng], [h0.lat, h0.lng]], {
            color: routeColor, weight: 3, opacity: 0.6, dashArray: "8 6",
          }).addTo(map);
          routeRef.current = fallbackLine;
        }
      }

      mapRef.current = map;
    };

    init().catch(console.error);
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; routeRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentLat, incidentLng, hospitalsKey, tColor]);

  return <div id={containerId.current} style={{ width: "100%", height: 320, borderRadius: 12, overflow: "hidden" }} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// CNIC MODAL
// ═══════════════════════════════════════════════════════════════════════════
function CNICModal({ onClose, onSuccess, darkMode, tx }) {
  const [mode,       setMode]       = useState("choose");
  const [prev,       setPrev]       = useState(null);
  const [result,     setResult]     = useState(null);
  const [err,        setErr]        = useState("");
  const [scanMethod, setScanMethod] = useState("auto"); // "auto"|"local"|"groq"
  const [usedMethod, setUsedMethod] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");    // dynamic loading status text

  const fileRef   = useRef(null);
  const vidRef    = useRef(null);
  const streamRef = useRef(null);

  const bg = darkMode ? "#0d1b2e" : "#fff";
  const bd = darkMode ? "#1e3a5f" : "#e2e8f0";
  const tc = darkMode ? "#e2e8f0" : "#1e293b";

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
  }, []);
  useEffect(() => () => stopCam(), [stopCam]);

  async function processFile(file) {
    if (!file) return;
    setMode("processing"); setPrev(URL.createObjectURL(file));
    try {
      const b64 = await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onerror=()=>rej(new Error("File read failed"));
        r.onload=e=>res(e.target.result.split(",")[1]);
        r.readAsDataURL(file);
      });

      // For local/auto: check if EasyOCR model is ready, wait if still loading
      if (scanMethod === "local" || scanMethod === "auto") {
        try {
          const statusResp = await fetch(`${BACKEND}/cnic/status`, { signal: AbortSignal.timeout(3000) });
          if (statusResp.ok) {
            const status = await statusResp.json();
            if (status.loading && !status.ready) {
              setLoadingMsg("Loading OCR model... (first time, ~30s)");
              // Poll until ready or timeout
              let waited = 0;
              while (waited < 90) {
                await new Promise(r => setTimeout(r, 2000));
                waited += 2;
                try {
                  const s2 = await fetch(`${BACKEND}/cnic/status`, { signal: AbortSignal.timeout(2000) });
                  if (s2.ok) {
                    const st2 = await s2.json();
                    if (st2.ready) break;
                    setLoadingMsg(`Loading OCR model... ${waited}s`);
                  }
                } catch { break; }
              }
              setLoadingMsg("");
            }
          }
        } catch { /* status check failed, proceed anyway */ }
      }

      // scan_method is enforced by BACKEND:
      //  "local" -> local OCR only (EasyOCR -> Pytesseract fallback), NEVER calls Groq
      //  "groq"  -> Groq Vision only (cloud, highest accuracy)
      //  "auto"  -> local OCR first; if CNIC found -> return offline; else fall back to Groq
      const resp = await fetch(`${BACKEND}/cnic/scan`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({image_base64:b64,media_type:file.type||"image/jpeg",scan_method:scanMethod}),
        signal:AbortSignal.timeout(120000), // 120s — EasyOCR inference can take 10-20s
      });
      if(!resp.ok){const e2=await resp.json().catch(()=>({}));throw new Error(e2.detail||`Error ${resp.status}`);}
      const json=await resp.json();
      if(!json.data) throw new Error("No data returned");
      setUsedMethod(json.method||"");
      setResult(json.data); setMode("done");
    } catch(e) {
      setErr(e.message||"Could not read CNIC. Check backend is running.");
      setMode("error");
    }
  }

  async function openCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:"environment" } });
      streamRef.current = stream; setMode("camera");
      setTimeout(() => { if (vidRef.current){ vidRef.current.srcObject = stream; vidRef.current.play(); } }, 80);
    } catch { setErr("Camera access denied. Use Upload instead."); setMode("error"); }
  }

  function capture() {
    const v = vidRef.current; if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(b => { stopCam(); processFile(new File([b],"cnic.jpg",{type:"image/jpeg"})); }, "image/jpeg", 0.93);
  }

  const BB = ({ color, onClick, children }) => (
    <button onClick={onClick} style={{ padding:"13px", borderRadius:12, background:color, color:"white", border:"none", cursor:"pointer", fontWeight:800, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:9, width:"100%", fontFamily:"inherit" }}>
      {children}
    </button>
  );

  return (
    <div onClick={e => { if(e.target===e.currentTarget){stopCam();onClose();} }}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(6px)", padding:20 }}>
      <div style={{ background:bg, borderRadius:20, padding:"30px 28px", width:"100%", maxWidth:440, border:`1px solid ${bd}`, boxShadow:"0 30px 80px rgba(0,0,0,0.6)", position:"relative", color:tc, direction:"ltr" }}>
        <button onClick={()=>{stopCam();onClose();}} style={{ position:"absolute", top:14, right:14, background:"none", border:"none", cursor:"pointer", color:tc, opacity:0.5 }}><X size={20}/></button>
        <div style={{ fontWeight:900, fontSize:17, marginBottom:4 }}>📇 {tx.cnicTitle}</div>
        <div style={{ fontSize:12, opacity:0.45, marginBottom:22 }}>{tx.cnicSub}</div>

        {mode==="choose" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {/* Scan Engine Selector */}
            <div style={{borderRadius:11,border:"1px solid rgba(99,102,241,0.22)",padding:"11px 13px",background:"rgba(99,102,241,0.04)"}}>
              <div style={{fontSize:9,fontWeight:800,letterSpacing:"2px",opacity:0.4,marginBottom:9}}>SCAN ENGINE</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                {[["auto","🔄 Auto","EasyOCR\n→ Groq"],["local","💻 Local","Offline\nNo API call"],["groq","☁ Groq AI","Cloud\nVision model"]].map(([v,lbl,sub])=>(
                  <div key={v} onClick={()=>setScanMethod(v)}
                    style={{padding:"9px 4px",borderRadius:9,textAlign:"center",cursor:"pointer",
                      border:`1.5px solid ${scanMethod===v?"#6366f1":"transparent"}`,
                      background:scanMethod===v?"rgba(99,102,241,0.14)":"rgba(255,255,255,0.02)",transition:"all 0.15s"}}>
                    <div style={{fontSize:12,fontWeight:800}}>{lbl}</div>
                    <div style={{fontSize:9,opacity:0.5,marginTop:3,whiteSpace:"pre-line"}}>{sub}</div>
                  </div>
                ))}
              </div>
              {scanMethod==="local"&&<div style={{marginTop:9,fontSize:10,color:"#22c55e"}}>✓ No API key required · <code>pip install easyocr opencv-python</code></div>}
              {scanMethod==="groq"&&<div style={{marginTop:9,fontSize:10,color:"#818cf8"}}>Uses GROQ_API_KEY — highest accuracy</div>}
            </div>
            <BB color="#6366f1" onClick={openCam}><Camera size={18}/> {tx.takePhoto}</BB>
            <BB color="#3b82f6" onClick={()=>fileRef.current?.click()}><Upload size={18}/> {tx.uploadImg}</BB>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
            <div style={{fontSize:11,opacity:0.35,textAlign:"center"}}>{tx.cnicHint}</div>
          </div>
        )}

        {mode==="camera" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ borderRadius:12, overflow:"hidden", border:"2px solid #6366f1", position:"relative" }}>
              <video ref={vidRef} playsInline style={{ width:"100%", display:"block", maxHeight:260, objectFit:"cover" }}/>
              <div style={{ position:"absolute", inset:10, border:"2px dashed rgba(99,102,241,0.75)", borderRadius:10, pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ background:"rgba(0,0,0,0.55)", color:"white", fontSize:11, padding:"3px 10px", borderRadius:8 }}>{tx.holdFrame}</span>
              </div>
            </div>
            <BB color="#22c55e" onClick={capture}><Camera size={16}/> {tx.capture}</BB>
            <button onClick={()=>{stopCam();setMode("choose");}} style={{ padding:"11px", borderRadius:12, background:"transparent", border:`1px solid ${bd}`, color:tc, cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>{tx.back}</button>
          </div>
        )}

        {mode==="processing" && (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            {prev&&<img src={prev} alt="" style={{ width:"100%", borderRadius:10, marginBottom:16, maxHeight:180, objectFit:"cover" }}/>}
            <div style={{ width:40, height:40, borderRadius:"50%", border:"3px solid rgba(99,102,241,0.2)", borderTop:"3px solid #6366f1", animation:"spin 1s linear infinite", margin:"0 auto 14px" }}/>
            <div style={{ fontSize:13, opacity:0.6 }}>{tx.reading}</div>
            {scanMethod==="local" && <div style={{ fontSize:10, opacity:0.4, marginTop:6 }}>First scan may take ~30s to load OCR model</div>}
          </div>
        )}

        {mode==="done" && result && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {prev&&<img src={prev} alt="" style={{ width:"100%", borderRadius:10, maxHeight:150, objectFit:"cover", opacity:0.85 }}/>}
            <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:16, border:"1px solid rgba(34,197,94,0.3)" }}>
              <div style={{ fontSize:10, color:"#22c55e", fontWeight:800, letterSpacing:2, marginBottom:10 }}>{tx.extracted}</div>
              {usedMethod&&<div style={{fontSize:9,color:"#6366f1",fontWeight:700,letterSpacing:"1.5px",marginBottom:8}}>ENGINE: {usedMethod.toUpperCase()}</div>}
              {[["Name",result.name],["Father/Husband",result.fatherName||result.father_name],["اردو نام",result.nameUrdu],["CNIC #",result.cnic],["Age",result.age!=null?`${result.age} yrs`:null],["DOB",result.dob],["Gender",result.gender],["Address",result.address]]
                .filter(([,v])=>v!=null&&v!="")
                .map(([label,val])=>(
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5, gap:12 }}>
                    <span style={{ opacity:0.5, flexShrink:0 }}>{label}</span>
                    <span style={{ fontWeight:800, textAlign:"right" }}>{String(val)}</span>
                  </div>
                ))}
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{setMode("choose");setPrev(null);setResult(null);}} style={{ flex:1, padding:"12px", borderRadius:12, background:"#6b7280", color:"white", border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>{tx.rescan}</button>
              <button onClick={()=>{onSuccess(result);onClose();}} style={{ flex:2, padding:"12px", borderRadius:12, background:"#22c55e", color:"white", border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                <CheckCircle size={15}/> {tx.useData}
              </button>
            </div>
          </div>
        )}

        {mode==="error" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, padding:14, fontSize:12, color:"#f87171", lineHeight:1.7 }}>
              ⚠ {err}
              {(err||"").toLowerCase().includes("connection") && (
                <div style={{ marginTop:10, padding:10, background:"rgba(0,0,0,0.3)", borderRadius:8, color:"#fbbf24", fontSize:11 }}>
                  <strong>🔧 Fix:</strong> Windows Firewall is blocking Python → Groq.<br/>
                  1. Open <strong>Windows Security → Firewall → Allow an app</strong><br/>
                  2. Add <strong>python.exe</strong> (both Private + Public)<br/>
                  3. Or open: <strong>http://127.0.0.1:8000/debug</strong> to diagnose
                </div>
              )}
            </div>
            <BB color="#6366f1" onClick={()=>{setErr("");setMode("choose");}}>{tx.tryAgain}</BB>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VITALS CHART
// ═══════════════════════════════════════════════════════════════════════════
function VitalsChart({ history, darkMode }) {
  const gc  = darkMode?"#1e3a5f":"#e2e8f0";
  const tc2 = darkMode?"#94a3b8":"#475569";
  const ts  = { background:darkMode?"#0d1b2e":"#fff", border:`1px solid ${gc}`, borderRadius:8, fontSize:11 };
  if (!history || history.length < 2)
    return <div style={{ padding:"36px 0", textAlign:"center", opacity:0.35, fontSize:13 }}>Vitals trend appears after 2+ visits</div>;

  const data = [...history].reverse().map(r => {
    const t = r.createdAt?.toDate?r.createdAt.toDate():new Date(r.savedAt||r.timestamp||0);
    return {
      date: t.toLocaleDateString("en-PK",{month:"short",day:"numeric"}),
      HR:   parseInt(r.heart_rate)||null,
      SpO2: parseInt(r.oxygen_saturation)||null,
      SBP:  r.blood_pressure?parseInt(r.blood_pressure.split("/")[0])||null:null,
      DBP:  r.blood_pressure?parseInt(r.blood_pressure.split("/")[1])||null:null,
    };
  });
  const sp = { data, margin:{top:8,right:10,left:-18,bottom:4} };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div>
        <div style={{ fontSize:10, fontWeight:800, opacity:0.4, letterSpacing:"2px", marginBottom:10 }}>HEART RATE & SpO2</div>
        <ResponsiveContainer width="100%" height={175}>
          <LineChart {...sp}>
            <CartesianGrid strokeDasharray="3 3" stroke={gc}/>
            <XAxis dataKey="date" tick={{fontSize:10,fill:tc2}}/>
            <YAxis tick={{fontSize:10,fill:tc2}}/>
            <Tooltip contentStyle={ts}/><Legend wrapperStyle={{fontSize:11}}/>
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" opacity={0.4}/>
            <ReferenceLine y={95}  stroke="#f59e0b" strokeDasharray="4 4" opacity={0.4}/>
            <Line type="monotone" dataKey="HR"   stroke="#ef4444" strokeWidth={2} dot={{r:4}} name="Heart Rate" connectNulls/>
            <Line type="monotone" dataKey="SpO2" stroke="#3b82f6" strokeWidth={2} dot={{r:4}} name="SpO2 %" connectNulls/>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div style={{ fontSize:10, fontWeight:800, opacity:0.4, letterSpacing:"2px", marginBottom:10 }}>BLOOD PRESSURE</div>
        <ResponsiveContainer width="100%" height={175}>
          <LineChart {...sp}>
            <CartesianGrid strokeDasharray="3 3" stroke={gc}/>
            <XAxis dataKey="date" tick={{fontSize:10,fill:tc2}}/>
            <YAxis tick={{fontSize:10,fill:tc2}}/>
            <Tooltip contentStyle={ts}/><Legend wrapperStyle={{fontSize:11}}/>
            <ReferenceLine y={140} stroke="#ef4444" strokeDasharray="3 3" opacity={0.4}/>
            <ReferenceLine y={90}  stroke="#f59e0b" strokeDasharray="3 3" opacity={0.4}/>
            <Line type="monotone" dataKey="SBP" stroke="#a855f7" strokeWidth={2} dot={{r:4}} name="Systolic" connectNulls/>
            <Line type="monotone" dataKey="DBP" stroke="#06b6d4" strokeWidth={2} dot={{r:4}} name="Diastolic" connectNulls/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOSPITAL PANEL — triage-aware, with GPS denied guide + location fallback
// ═══════════════════════════════════════════════════════════════════════════
function HospitalPanel({ hospitals, loading, error, onRefresh, onSearchByLoc, darkMode, tx, triageLevel }) {
  const bd = darkMode?"#1e3a5f":"#e2e8f0";
  const sb = darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)";
  const tc = darkMode?"#e2e8f0":"#1e293b";

  // Triage level is pre-extracted by the parent (from the parsed AI response)
  const triageLvl = (triageLevel || "").toLowerCase();
  const isCritical = triageLvl && (triageLvl.includes("red") || triageLvl.includes("critical"));
  const isUrgent   = triageLvl && (triageLvl.includes("yellow") || triageLvl.includes("urgent"));

  // Sort: if critical triage, put ER hospitals first
  const sortedHospitals = isCritical
    ? [...hospitals].sort((a, b) => {
        const aER = a.emergency ? 0 : 1;
        const bER = b.emergency ? 0 : 1;
        if (aER !== bER) return aER - bER;
        return a.dist_km - b.dist_km;
      })
    : hospitals;

  if (loading) return (
    <div style={{ padding:"28px 0", textAlign:"center", opacity:0.5, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
      <span style={{ width:15, height:15, borderRadius:"50%", border:"2px solid rgba(59,130,246,0.2)", borderTop:"2px solid #3b82f6", display:"inline-block", animation:"spin 1s linear infinite" }}/>
      Locating nearby hospitals…
    </div>
  );

  if (error === "gps") return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, direction:"ltr" }}>
      {/* GPS denied — step by step guide */}
      <div style={{ background:"rgba(239,68,68,0.07)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:12, padding:"14px 16px", fontSize:12, color:"#f87171", lineHeight:1.8 }}>
        <div style={{ fontWeight:800, fontSize:13, marginBottom:8 }}>{tx.gpsDeniedTitle}</div>
        <div style={{ marginBottom:8, opacity:0.85 }}>{tx.gpsDeniedMsg}</div>
        {tx.gpsDeniedSteps.map((s,i) => (
          <div key={i} style={{ display:"flex", gap:8, marginBottom:4 }}>
            <span style={{ background:"rgba(239,68,68,0.3)", borderRadius:4, width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:10, fontWeight:800 }}>{i+1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>

      {/* Location name fallback */}
      <div style={{ background:"rgba(99,102,241,0.07)", border:"1px solid rgba(99,102,241,0.35)", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ fontSize:12, fontWeight:800, color:"#818cf8", marginBottom:6 }}>{tx.gpsAltTitle}</div>
        <div style={{ fontSize:11, opacity:0.65, marginBottom:10 }}>{tx.gpsAltMsg}</div>
        <button onClick={onSearchByLoc} style={{ padding:"11px 16px", borderRadius:10, background:"#6366f1", color:"white", border:"none", cursor:"pointer", fontWeight:800, fontSize:13, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"inherit" }}>
          <MapPin size={14}/> {tx.gpsSearchBtn}
        </button>
      </div>

      <button onClick={onRefresh} style={{ padding:"10px", borderRadius:10, background:"transparent", border:`1px solid ${bd}`, color:tc, cursor:"pointer", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"inherit", opacity:0.65 }}>
        <RefreshCw size={12}/> {tx.refreshGPS}
      </button>
    </div>
  );

  if (error && error !== "gps") return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, direction:"ltr" }}>
      <div style={{ background:"rgba(245,158,11,0.07)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:"12px 14px", fontSize:12, color:"#fbbf24" }}>
        ⚠ {error}
      </div>
      <div style={{ background:"rgba(99,102,241,0.07)", border:"1px solid rgba(99,102,241,0.35)", borderRadius:12, padding:"14px 16px" }}>
        <div style={{ fontSize:12, fontWeight:800, color:"#818cf8", marginBottom:6 }}>{tx.gpsAltTitle}</div>
        <div style={{ fontSize:11, opacity:0.65, marginBottom:10 }}>{tx.gpsAltMsg}</div>
        <button onClick={onSearchByLoc} style={{ padding:"11px 16px", borderRadius:10, background:"#6366f1", color:"white", border:"none", cursor:"pointer", fontWeight:800, fontSize:13, width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"inherit" }}>
          <MapPin size={14}/> {tx.gpsSearchBtn}
        </button>
      </div>
    </div>
  );

  if (!sortedHospitals.length) return (
    <div style={{ padding:"26px 0", textAlign:"center", opacity:0.4, fontSize:13 }}>
      Click <strong>{tx.refreshGPS}</strong> or type a location to find hospitals
    </div>
  );

  // Triage recommendation banner
  const triageBanner = isCritical ? (
    <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:10, padding:"10px 14px", fontSize:11, color:"#f87171", display:"flex", gap:8, alignItems:"center" }}>
      <span style={{ fontSize:16 }}>🚨</span>
      <span><strong>CRITICAL:</strong> Prioritizing hospitals with Emergency Room capacity. Proceed to nearest ER immediately.</span>
    </div>
  ) : isUrgent ? (
    <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.4)", borderRadius:10, padding:"10px 14px", fontSize:11, color:"#fbbf24", display:"flex", gap:8, alignItems:"center" }}>
      <span style={{ fontSize:16 }}>⚠️</span>
      <span><strong>URGENT:</strong> Transport to nearest hospital. Time-sensitive — avoid delays.</span>
    </div>
  ) : null;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, direction:"ltr" }}>
      {triageBanner}
      {sortedHospitals.map((h, i) => {
        const isNearest  = i === 0;
        const borderCol  = isNearest ? (isCritical ? "#ef4444" : "#3b82f6") : bd;
        const bgCol      = isNearest ? (isCritical ? "rgba(239,68,68,0.06)" : "rgba(59,130,246,0.06)") : sb;
        // Navigation URL: destination coords
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}&travelmode=driving`;
        return (
          <div key={i} style={{ border:`1px solid ${borderCol}`, borderRadius:14, overflow:"hidden", background:bgCol }}>
            <div style={{ padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                  {isNearest && <span style={{ background: isCritical ? "#ef4444" : "#3b82f6", color:"white", fontSize:9, padding:"2px 7px", borderRadius:4, fontWeight:800 }}>{tx.nearest}</span>}
                  {h.emergency && <span style={{ background:"#f59e0b", color:"white", fontSize:9, padding:"2px 7px", borderRadius:4, fontWeight:800 }}>ER</span>}
                  <span style={{ background:sb, color:tc, fontSize:9, padding:"2px 7px", borderRadius:4, border:`1px solid ${bd}`, opacity:0.7 }}>{h.type||"hospital"}</span>
                  {isCritical && h.emergency && <span style={{ background:"rgba(239,68,68,0.2)", color:"#f87171", fontSize:9, padding:"2px 7px", borderRadius:4, fontWeight:800 }}>✓ Has ER</span>}
                </div>
                <div style={{ fontWeight:800, fontSize:13, color:tc, lineHeight:1.3 }}>{h.name}</div>
                {h.name_ur && <div style={{ fontSize:12, opacity:0.6, direction:"rtl", marginTop:2 }}>{h.name_ur}</div>}
                <div style={{ fontSize:11, opacity:0.5, marginTop:4 }}>📍 {h.dist_km} km away{h.address?` • ${h.address}`:""}</div>
                {h.phone && h.phone!=="N/A" && (
                  <a href={`tel:${h.phone}`} style={{ fontSize:11, color:"#22c55e", display:"inline-flex", alignItems:"center", gap:4, marginTop:5, textDecoration:"none" }}>
                    <PhoneCall size={11}/> {h.phone}
                  </a>
                )}
                {h.opening_hours && <div style={{ fontSize:10, opacity:0.4, marginTop:3 }}>⏰ {h.opening_hours}</div>}
              </div>
              <a href={navUrl} target="_blank" rel="noopener noreferrer"
                style={{ background: isCritical && isNearest ? "#ef4444" : "#3b82f6", color:"white", padding:"9px 12px", borderRadius:10, fontSize:11, fontWeight:700, textDecoration:"none", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", flexShrink:0 }}>
                <Navigation size={12}/> {tx.navigate}
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
// Safely parse the AI response as JSON. Returns the parsed object, or null
// if the text isn't valid JSON (legacy/plain-text response, malformed output).
function tryParseJSON(text) {
  if (!text || typeof text !== "string") return null;
  try {
    const parsed = JSON.parse(text);
    return (parsed && typeof parsed === "object") ? parsed : null;
  } catch {
    return null;
  }
}
function triageColor(l) {
  const s=(l||"").toLowerCase();
  if (s.includes("red")||s.includes("critical")) return "#ef4444";
  if (s.includes("yellow")||s.includes("urgent")) return "#f59e0b";
  if (s.includes("green")||s.includes("minor"))   return "#22c55e";
  return "#6b7280";
}

// Resolve a history record's timestamp across the shapes it can come in as
// (Firestore Timestamp, epoch/ISO savedAt, plain timestamp string). Records
// with no resolvable timestamp sort to the bottom instead of floating to "now".
function historyTimestamp(r) {
  if (r?.createdAt?.toDate) return r.createdAt.toDate().getTime();
  if (r?.savedAt)   { const t = new Date(r.savedAt).getTime();   if (!isNaN(t)) return t; }
  if (r?.timestamp) { const t = new Date(r.timestamp).getTime(); if (!isNaN(t)) return t; }
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function NexaMedApp() {
  const { currentUser, userProfile, logout } = useAuth();

  const [dark,      setDark]      = useState(true);
  const [lang,      setLang]      = useState("en");  // "en" | "ur" | "ru"
  const [isSubmittingSignal, setIsSubmittingSignal] = useState(false); // citizen SOS flag
  const [form,      setForm]      = useState({
    name:"", cnic:"", father_name:"", gender:"Male", age:"", description:"",
    heart_rate:"", blood_pressure:"", oxygen_saturation:"",
    consciousness_level:"Alert", location:"", allergies:"",
  });
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [speaking,  setSpeaking]  = useState(false);
  const [backendOk, setBackendOk] = useState(null);
  const [showCNIC,  setShowCNIC]  = useState(false);
  const [tab,       setTab]       = useState("intake");
  const [hospitals, setHospitals] = useState([]);
  const [hLoad,     setHLoad]     = useState(false);
  const [hErr,      setHErr]      = useState("");
  const [coords,    setCoords]    = useState(null);
  const [history,   setHistory]   = useState([]);
  const [notif,     setNotif]     = useState(null);
  const [incidentCoords,     setIncidentCoords]     = useState(null);
  const [isAnonymous,        setIsAnonymous]        = useState(false);  // true after NADRA 404
  const [anonBanner,         setAnonBanner]         = useState(null);   // null | "searching" | "found" | "notfound" | "error"
  // Persist last known GPS so switching tabs never loses position
  const lastCoordsRef = useRef(null);

  // FIX 4: derive everything from lang
  const tx  = T[lang] || T["en"];
  const dir = tx.dir;

  const C = {
    bg:     dark?"#060d18":"#f0f4f8",
    text:   dark?"#e2e8f0":"#1e293b",
    border: dark?"#1e3a5f":"#e2e8f0",
    subtle: dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)",
  };

  const toast = (msg, type="success") => { setNotif({msg,type}); setTimeout(()=>setNotif(null),3800); };
  const sf    = k => v => setForm(p=>({...p,[k]:v}));

  useEffect(() => {
    fetch(`${BACKEND}/health`,{signal:AbortSignal.timeout(3000)})
      .then(()=>setBackendOk(true)).catch(()=>setBackendOk(false));
  }, []);

  // Pass form.location via ref so the effect always has the current value
  const formLocRef = useRef(form.location);
  useEffect(() => { formLocRef.current = form.location; }, [form.location]);

  useEffect(() => {
    // When switching to hospitals tab, always reload with current typed location
    if (tab === "hospitals") loadHospitals(formLocRef.current);
  }, [tab]); // eslint-disable-line

  // Auto-refresh hospitals when location text changes (debounced 1.5s)
  const locDebounceRef = useRef(null);
  useEffect(() => {
    if (tab !== "hospitals" || !form.location.trim()) return;
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current);
    locDebounceRef.current = setTimeout(() => {
      loadHospitals(form.location);
    }, 1500);
    return () => { if (locDebounceRef.current) clearTimeout(locDebounceRef.current); };
  }, [form.location, tab]); // eslint-disable-line

  // ── Geocode via backend proxy (no CORS, no browser blocks) ────────────────
  async function geocodeLocation(locText) {
    if (!locText) return null;
    try {
      const r = await fetch(`${BACKEND}/geocode?q=${encodeURIComponent(locText)}`);
      const d = await r.json();
      if (d.found) return { lat: d.lat, lng: d.lng };
    } catch { /* fall through */ }
    return null;
  }

  // LOCATION FIX v3.6: When loc text is typed, return (0,0) sentinel.
  // Backend re-geocodes via smart_geocode() with disambiguation — avoids wrong city.
  // Browser GPS only used when NO location text is entered at all.
  async function getCoordinates(locText) {
    const loc = (locText || "").trim();

    // Typed location → return (0,0) sentinel; backend corrects via loc= param
    if (loc) return { lat: 0, lng: 0, source: "typed" };

    // No location typed — try browser GPS
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, {
            timeout: 8000, enableHighAccuracy: false, maximumAge: 30000,
          })
        );
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        lastCoordsRef.current = { lat, lng };
        return { lat, lng, source: "gps" };
      } catch { /* fall through */ }
    }

    // Reuse last known coords
    if (lastCoordsRef.current) return { ...lastCoordsRef.current, source: "cached" };

    // IP geo — last resort
    try {
      const r = await fetch(`${BACKEND}/ipgeo`);
      const d = await r.json();
      if (d.found) {
        lastCoordsRef.current = { lat: d.lat, lng: d.lng };
        return { lat: d.lat, lng: d.lng, source: "ip" };
      }
    } catch { /* fall through */ }

    return null;
  }

  // Always pass current form.location explicitly — avoids stale closure
  // Now geocodes FIRST via backend (Mapbox → Nominatim → Photon),
  // then sends real coords + loc text so Overpass finds hospitals.
  async function loadHospitals(locOverride) {
    // Avoid duplicate concurrent loads
    if (hLoad) return;
    const locText = (locOverride !== undefined ? locOverride : formLocRef.current).trim();
    setHLoad(true); setHErr(""); setHospitals([]);

    let lat = 0, lng = 0;
    let resolvedLabel = "";

    if (locText) {
      // Step 1: Call backend /geocode to resolve name → coords (uses Mapbox first)
      try {
        const gRes = await fetch(`${BACKEND}/geocode?q=${encodeURIComponent(locText)}`,
          { signal: AbortSignal.timeout(12000) });
        const gData = await gRes.json();
        if (gData.found && (Math.abs(gData.lat) > 0.1 || Math.abs(gData.lng) > 0.1)) {
          lat = gData.lat;
          lng = gData.lng;
          resolvedLabel = gData.display_name || locText;
          setCoords({ lat, lng });
          setIncidentCoords({ lat, lng });
          lastCoordsRef.current = { lat, lng };
          console.log(`Geocoded "${locText}" → (${lat.toFixed(4)}, ${lng.toFixed(4)}) [${gData.source}] ${resolvedLabel}`);
        } else {
          // Geocode returned 0,0 or not found — still try with loc text
          console.warn(`Geocode returned no coords for "${locText}", using loc= fallback`);
        }
      } catch (e) {
        console.warn("Geocode fetch failed:", e.message);
      }
    } else {
      // No text — use browser GPS or cached coords
      const gpsResult = await getCoordinates("");
      if (!gpsResult) { setHErr("gps"); setHLoad(false); return; }
      lat = gpsResult.lat; lng = gpsResult.lng;
      setCoords({ lat, lng });
    }

    // Step 2: Call /hospitals/nearby with resolved coords + original loc text
    try {
      const locParam = locText ? `&loc=${encodeURIComponent(locText)}` : "";
      const r = await fetch(
        `${BACKEND}/hospitals/nearby?lat=${lat}&lng=${lng}&radius_km=15${locParam}`,
        { signal: AbortSignal.timeout(60000) }  // Overpass can be slow
      );
      if (!r.ok) throw new Error(`Backend ${r.status}. Is uvicorn running?`);
      const d = await r.json();
      // Backend may correct coords (e.g. if we sent 0,0 and it geocoded)
      if (d.lat_used && d.lng_used && Math.abs(d.lat_used) > 0.1) {
        setCoords({ lat: d.lat_used, lng: d.lng_used });
        setIncidentCoords({ lat: d.lat_used, lng: d.lng_used });
        lastCoordsRef.current = { lat: d.lat_used, lng: d.lng_used };
      }
      const hospList = d.hospitals || [];
      setHospitals(hospList);
      if (!hospList.length) {
        // Give a helpful message with the resolved location name
        const usedName = resolvedLabel || locText || "your location";
        setHErr(d.message || `No hospitals found near "${usedName}". Expanding search area...`);
      }
    } catch (e) {
      setHErr(e.message || tx.gpsNoResult);
    }
    setHLoad(false);
  }

  // searchByTypedLocation: just delegates to loadHospitals with current location text
  async function searchByTypedLocation() {
    const loc = (formLocRef.current || form.location).trim();
    if (!loc) { toast("Type an incident location first (e.g. Lahore, Rawalpindi, Chowk Permit)", "error"); return; }
    await loadHospitals(loc);
    if (hospitals.length) setTab("hospitals");
  }

  async function loadHistory(cnic) { if(cnic) setHistory(await fsHistory(cnic)); }

  // FIX 4: pass lang to voice so it uses correct questions
  const voice = useVoice(
    lang,
    (field, val) => setForm(p=>({...p,[field]:val})),
    all => { setForm(p=>({...p,...all})); toast(tx.voiceComplete); }
  );

  function applyCNIC(d) {
    // Exact-birthday age from DOB (DD/MM/YYYY Pakistani standard)
    let age = (d.age != null) ? d.age : null;
    if (!age && d.dob) {
      try {
        const raw = (d.dob||"").replace(/\./g,"/").replace(/-/g,"/");
        const pts = raw.split("/");
        if (pts.length===3) {
          const p0=parseInt(pts[0]),p1=parseInt(pts[1]),p2=parseInt(pts[2]);
          let yr,mo,da;
          if(p0>31){yr=p0;mo=p1;da=p2;}else{da=p0;mo=p1;yr=p2;}
          const born=new Date(yr,mo-1,da), today=new Date();
          age=today.getFullYear()-born.getFullYear();
          if(today.getMonth()<born.getMonth()||(today.getMonth()===born.getMonth()&&today.getDate()<born.getDate()))age--;
        }
      } catch(_){}
    }
    const fn = d.fatherName || d.father_name || "";
    setForm(p=>({...p,
      name:        d.name     || p.name,
      cnic:        d.cnic     || p.cnic,
      father_name: fn         || p.father_name,
      age:         age!=null  ? String(age) : p.age,
      gender:      d.gender   || p.gender,
    }));
    const info=[d.name||"Patient"];
    if(age!=null) info.push(`${tx.age2} ${age}`);
    if(fn)        info.push(`Father: ${fn}`);
    toast(`${tx.cnicApplied}: ${info.join(" | ")}`);
    if(d.cnic) loadHistory(d.cnic);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NADRA BIOMETRIC LOOKUP  (/nadra/biometric-lookup via <BiometricPanel/>)
  // 200  → handleBiometricSuccess: map citizen fields into form, preserve allergies
  // 404  → handleBiometricFailure: John Doe Protocol — anonymous mode + banner
  // ─────────────────────────────────────────────────────────────────────────
  function handleBiometricSuccess(data) {
    const citizen = data.citizen || {};
    setIsAnonymous(false);
    setAnonBanner("found");
    setForm(prev => ({
      ...prev,
      name:        citizen.name        || prev.name,
      cnic:        citizen.cnic        || prev.cnic,
      father_name: citizen.father_name || citizen.husband_name || prev.father_name,
      age:         citizen.age != null ? String(citizen.age) : prev.age,
      gender:      citizen.gender      || prev.gender,
      allergies:   prev.allergies,   // preserved — biometric lookup never touches allergies
    }));
    toast(
      `✅ Identity verified: ${citizen.name}` +
      (citizen.blood_group ? ` | Blood Group: ${citizen.blood_group}` : ""),
      "success"
    );
    if (citizen.cnic) loadHistory(citizen.cnic);
    setTimeout(() => setAnonBanner(null), 4000); // auto-dismiss success banner
  }

  function handleBiometricFailure() {
    setIsAnonymous(true);
    setAnonBanner("notfound"); // mounts the John Doe Protocol banner below
    setForm(prev => ({
      ...prev,
      name:        "Unidentified John Doe",
      cnic:        "UNKNOWN",
      father_name: "",
      age:         "",
      gender:      "Male",
      allergies:   "",
    }));
  }

  // ── Dispatch finalized PCR to backend + n8n broadcast ───────────────────────────
  // Non-blocking: errors are logged but never interrupt the triage or PDF flow.
  async function dispatchPCR(triageResult) {
    try {
      const payload = {
        incident_location:     form.location      || "",
        chief_complaint_scene: form.description   || "",
        patient_name:          form.name          || "",
        gender:                form.gender        || "",
        father_husband_name:   form.father_name   || "",
        cnic:                  form.cnic          || "",
        age:                   String(form.age    || ""),
        vitals: {
          hr_bpm:       String(form.heart_rate         || ""),
          bp:           form.blood_pressure            || "",
          spo2_percent: String(form.oxygen_saturation  || ""),
        },
        allergies:       form.allergies      || "",
        triage_level:    triageResult?.triage_level    || "",
        classification:  triageResult?.classification  || "",
        ai_analysis:     triageResult?.analysis        || "",
      };
      const r = await fetch(`${BACKEND}/api/emt/pcr/finalize`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const d = await r.json();
      console.log("[PCR-Finalize]", d.pcr_id, d.message);
    } catch (err) {
      console.warn("[PCR-Finalize] Non-critical error (Firestore/n8n offline?):", err.message);
    }
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!form.description.trim()) { toast("Please describe the emergency","error"); return; }
    setLoading(true); setResult(null);
    const langCode = lang==="ur" ? "ur-PK" : lang==="ru" ? "ru-PK" : "en-US";

    // Send lat=0, lng=0 — backend smart_geocode() resolves the typed location
    // correctly, avoiding Nominatim's wrong first-result disambiguation problem.
    try {
      const r = await fetch(`${BACKEND}/triage`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          ...form, language: langCode,
          lat: 0, lng: 0,      // backend will geocode form.location with disambiguation
          age: parseInt(form.age)||0,
          heart_rate: parseInt(form.heart_rate)||0,
          oxygen_saturation: parseInt(form.oxygen_saturation)||0,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setResult(d.analysis);
      // Fire-and-forget PCR finalization to backend + n8n (non-blocking)
      dispatchPCR(d).catch(() => {});
      // Capture backend-resolved incident coords for EmergencyMap
      if (d.resolved_lat && d.resolved_lng && Math.abs(d.resolved_lat) > 0.1) {
        setIncidentCoords({ lat: d.resolved_lat, lng: d.resolved_lng });
        lastCoordsRef.current = { lat: d.resolved_lat, lng: d.resolved_lng };
      }
      const rid = await fsSave({...form,analysis:d.analysis,triage_level:d.triage_level,classification:d.classification},currentUser?.uid||"");
      toast(`${tx.pcrSaved}${rid?` — ${rid.slice(0,8)}`:""}`);
      if (form.cnic) await loadHistory(form.cnic);
      loadHospitals(formLocRef.current); // Always reload hospitals to sync map with incident
    } catch (err) {
      const msg = err.message || "Unknown error";
      const isConn = msg.toLowerCase().includes("503") || msg.toLowerCase().includes("connection") || msg.toLowerCase().includes("failed");
      toast(
        isConn
          ? "AI unavailable — open http://127.0.0.1:8000/debug to diagnose. Likely: Windows Firewall blocking Python → api.groq.com"
          : `${tx.backendErr}: ${msg}`,
        "error"
      );
    }
    setLoading(false);
  }

  function downloadPDF() {
    const doc   = new jsPDF();
    const PW    = 190;
    const ML    = 10;
    const PH    = 280;
    let   y     = 10;

    const checkPage = (needed=10) => {
      if (y + needed > PH) { doc.addPage(); y = 12; }
    };

    const pdfSection = (title, body, color=[60,60,60]) => {
      checkPage(16);
      doc.setFontSize(8); doc.setTextColor(...color);
      doc.text(title, ML, y); y += 5;
      doc.setDrawColor(...color); doc.line(ML, y, ML+PW, y); y += 4;
      doc.setFontSize(9); doc.setTextColor(30,30,30);
      // Strip chars outside latin-1 range (0-255) — jsPDF default font is latin only
      const safe = (body||"—")
        .replace(/[*#◈•→←↑↓]/g, "")          // known problem symbols
        .replace(/[^\x00-\xFF]/g, "")          // anything outside latin-1
        .trim();
      const lines = doc.splitTextToSize(safe || "—", PW);
      lines.forEach(ln => { checkPage(5); doc.text(ln, ML, y); y += 5; });
      y += 4;
    };

    doc.setFontSize(18); doc.setTextColor(220,30,30);
    doc.text("NexaMed - Patient Care Report", ML, y); y += 7;
    doc.setFontSize(7.5); doc.setTextColor(110,110,110);
    const emt = userProfile?.displayName || currentUser?.displayName || "N/A";
    doc.text(`${new Date().toLocaleString("en-PK")}  |  EMT: ${emt}  |  PCR-${Date.now()}`, ML, y); y += 6;
    doc.setDrawColor(220,30,30); doc.setLineWidth(0.5);
    doc.line(ML, y, ML+PW, y); y += 6;

    doc.setFontSize(9.5); doc.setTextColor(20,20,20); doc.setLineWidth(0.2);
    [
      `Patient : ${form.name || "N/A"}`,
      `CNIC    : ${form.cnic || "N/A"}   Gender: ${form.gender}   Age: ${form.age || "N/A"} yrs`,
      `Location: ${form.location || "N/A"}`,
      `Vitals  : HR ${form.heart_rate||"N/A"} bpm  BP ${form.blood_pressure||"N/A"}  SpO2 ${form.oxygen_saturation||"N/A"}%  AVPU: ${form.consciousness_level}`,
    ].forEach(line => { checkPage(6); doc.text(line, ML, y); y += 6; });

    // Allergies / Medical Alerts — flagged in an accent color when present
    // so clinical staff can't miss a real alert on the printed page.
    const allergiesText = form.allergies?.trim() || "None Reported";
    const hasAllergies  = Boolean(form.allergies?.trim());
    checkPage(6);
    doc.setFont(undefined, hasAllergies ? "bold" : "normal");
    doc.setTextColor(...(hasAllergies ? [200,30,30] : [20,20,20]));
    doc.text(`Allergies / Medical Alerts: ${allergiesText}`, ML, y); y += 6;
    doc.setFont(undefined, "normal");
    doc.setTextColor(20,20,20);
    y += 3;

    if (!result) {
      doc.setFontSize(10); doc.setTextColor(180,0,0);
      doc.text("No AI analysis generated yet.", ML, y);
    } else {
      const parsedForPdf = tryParseJSON(result);
      if (parsedForPdf) {
        const secs = [
          ["CLASSIFICATION",       parsedForPdf.classification,       [180,0,0]],
          ["TRIAGE LEVEL",         parsedForPdf.triage_level,         [180,0,0]],
          ["RECOMMENDED FACILITY", parsedForPdf.recommended_facility, [80,80,180]],
          ["INSTRUCTIONS",         parsedForPdf.instructions,         [0,100,180]],
          ["EQUIPMENT ADVICE",     parsedForPdf.equipment_advice,     [160,100,0]],
          ["SOAP NOTE",            parsedForPdf.soap_note,           [0,140,80]],
          ["PHYSICAL CONDITION",   parsedForPdf.physical_condition,   [120,0,180]],
          ["OPTIMIZED ROUTE",      parsedForPdf.optimized_route,     [180,60,0]],
        ];
        // Use ASCII ">>" instead of ◈ — jsPDF default font doesn't support Unicode symbols
        secs.forEach(([key, text, color]) => { if (text) pdfSection(`>> ${key}`, text, color); });
      } else {
        // AI didn't return valid JSON — print the raw response as a single section
        pdfSection(">> AI ANALYSIS (RAW)", result, [90,90,90]);
      }
    }

    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(6.5); doc.setTextColor(160,160,160);
      doc.text(`NexaMed PCR  |  Page ${p} of ${totalPages}  |  Confidential Medical Record`, ML, 292);
    }

    doc.save(`NexaMed_PCR_${(form.name||"Patient").replace(/\s+/g,"_")}_${Date.now()}.pdf`);
  }

  // Style helpers — always LTR for form inputs
  const IN  = { background:C.subtle, border:`1px solid ${C.border}`, borderRadius:10, color:C.text, padding:"11px 14px", width:"100%", outline:"none", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", direction:"ltr" };
  const BTN = (col,x={}) => ({ padding:"9px 14px", borderRadius:10, background:col, border:"none", color:"white", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontWeight:700, fontSize:12, whiteSpace:"nowrap", fontFamily:"inherit", ...x });
  const TAB = a => ({ padding:"8px 13px", borderRadius:8, fontSize:11, fontWeight:a?800:600, cursor:"pointer", border:"none", background:a?"#ef4444":"transparent", color:a?"white":C.text, opacity:a?1:0.55, transition:"all 0.15s", fontFamily:"inherit" });
  const LB  = { fontSize:10, fontWeight:700, opacity:0.45, letterSpacing:"1.5px", display:"block", marginBottom:6, direction:dir };
  const VC  = { idle:"#3b82f6", speaking:"#f59e0b", listening:"#22c55e", processing:"#8b5cf6", saved:"#10b981", done:"#10b981", error:"#ef4444" };

  const voiceLabel = () => {
    if (voice.status==="speaking")   return tx.speaking;
    if (voice.status==="listening")  return tx.listening;
    if (voice.status==="processing") return tx.processing;
    if (voice.status==="saved")      return tx.voiceSaved;
    if (voice.status==="done")       return tx.done;
    if (voice.status==="error")      return tx.voiceError;
    return tx.voiceQA;
  };

  // FIX 4: resolve voice error message through tx
  const voiceErrMsg = voice.errMsg==="noSR"       ? tx.voiceErr
                    : voice.errMsg==="micDenied" ? tx.micDenied
                    : voice.errMsg;

  // GPS error: if raw "gps" key → show translated panel; otherwise show raw msg
  const hospErrToShow = hErr==="gps" ? "gps" : hErr;

  return (
    <div style={{ backgroundColor:C.bg, color:C.text, minHeight:"100vh", fontFamily:'"IBM Plex Mono","Courier New",monospace', overflowX:"hidden", direction:dir }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}}
        @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#3b82f6!important}
        input::placeholder,textarea::placeholder{opacity:0.35}
      `}</style>

      {showCNIC && <CNICModal onClose={()=>setShowCNIC(false)} onSuccess={applyCNIC} darkMode={dark} tx={tx}/>}

      {notif && (
        <div style={{ position:"fixed", top:18, right:18, zIndex:2000, background:notif.type==="error"?"#ef4444":"#22c55e", color:"white", padding:"11px 18px", borderRadius:12, fontSize:12, fontWeight:700, boxShadow:"0 8px 28px rgba(0,0,0,0.4)", maxWidth:380, lineHeight:1.4, direction:"ltr" }}>
          {notif.msg}
        </div>
      )}

      {/* ── HEADER (always LTR) ── */}
      <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 26px", borderBottom:`1px solid ${C.border}`, background:dark?"rgba(6,13,24,0.96)":"white", position:"sticky", top:0, zIndex:100, backdropFilter:"blur(12px)", direction:"ltr" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ background:"linear-gradient(135deg,#ef4444,#b91c1c)", padding:9, borderRadius:12, display:"flex", boxShadow:"0 0 18px rgba(239,68,68,0.4)" }}>
            <Ambulance size={21} color="white"/>
          </div>
          <div>
            <div style={{ fontWeight:900, fontSize:17 }}>NexaMed <span style={{ color:"#ef4444" }}>Command</span></div>
            <div style={{ fontSize:9, opacity:0.3, letterSpacing:"2px" }}>{tx.appSub}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ fontSize:10, opacity:0.5, display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:backendOk===true?"#22c55e":backendOk===false?"#ef4444":"#f59e0b" }}/>
            {backendOk===true?tx.online:backendOk===false?tx.offline:tx.checking}
          </div>
          {currentUser && (
            <div style={{ display:"flex", alignItems:"center", gap:8, background:C.subtle, border:`1px solid ${C.border}`, borderRadius:10, padding:"7px 12px", fontSize:11 }}>
              <User size={13}/><span style={{ fontWeight:700 }}>{userProfile?.displayName||currentUser.displayName||currentUser.email}</span>
              <span style={{ opacity:0.45 }}>· {userProfile?.role||"EMT"}</span>
            </div>
          )}
          {/* FIX 4: language switcher — 3 options */}
          <select value={lang} onChange={e=>setLang(e.target.value)}
            style={{ background:"#6366f1", color:"white", border:"none", padding:"7px 12px", borderRadius:8, fontWeight:700, fontSize:12, cursor:"pointer" }}>
            <option value="en">🇺🇸 English</option>
            <option value="ur">🇵🇰 اردو</option>
            <option value="ru">Roman Urdu</option>
          </select>
          <button onClick={()=>setDark(!dark)} style={BTN(dark?"#1e3a5f":"#e2e8f0",{color:C.text})}>
            {dark?<Sun size={15}/>:<Moon size={15}/>}
          </button>

          <button onClick={logout} style={BTN("#374151")} title="Sign out"><LogOut size={14}/></button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ display:"grid", gridTemplateColumns:"430px 1fr", minHeight:"calc(100vh - 61px)" }}>

        {/* LEFT PANEL */}
        <aside style={{ borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", overflowY:"auto", direction:"ltr" }}>

          {/* Tabs */}
          <div style={{ display:"flex", gap:3, padding:"12px 14px 0", borderBottom:`1px solid ${C.border}`, background:dark?"#060d18":"#f8fafc" }}>
            {tx.tabs.map((label,i)=>{
              const ids  =["intake","hospitals","history","vitals"];
              const icons=[<Stethoscope size={12}/>,<MapPin size={12}/>,<History size={12}/>,<Activity size={12}/>];
              return <button key={ids[i]} onClick={()=>setTab(ids[i])} style={TAB(tab===ids[i])}>{icons[i]} {label}</button>;
            })}
          </div>

          <div style={{ padding:20, flex:1, overflowY:"auto" }}>

            {/* ── INTAKE TAB ── */}
            {tab==="intake" && (
              <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
              <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:13 }}>

                {/* FIX 3+4: voice error in translated language.
                    Deliberately calm/neutral styling, not a red alarm banner —
                    "aborted" (our own self-triggered abort calls) never reaches
                    here at all now; what does reach here (mic denied, an
                    unrecognized SR error) is real and should say so plainly.
                    The field is left blank for honest manual entry — this is
                    a clinical intake form, so silently inserting placeholder
                    symptom/vitals text here would misrepresent real patient
                    data, not just smooth over a UI hiccup. */}
                {voice.status==="error" && (
                  <div style={{ background:C.subtle, border:`1px solid ${C.border}`, borderRadius:10, padding:"10px 14px", fontSize:11, color:C.text, opacity:0.75, direction:dir }}>
                    🎙 {voiceErrMsg}
                  </div>
                )}

                {/* Voice progress bar */}
                {voice.isActive && (() => {
                  const vColor = VC[voice.status] || "#22c55e";
                  // "error" is the stuck-on-step state (both cloud STT and
                  // the browser fallback failed) — Skip Question must stay
                  // available here, otherwise the EMT has no way forward
                  // short of aborting the whole voice session.
                  const canSkip = voice.status === "listening" || voice.status === "speaking" || voice.status === "error";
                  const canSubmit = voice.status === "listening";
                  const statusLine =
                    voice.status==="speaking"   ? "🔊 Listen to the question…" :
                    voice.status==="processing" ? tx.processing :
                    voice.status==="saved"      ? tx.voiceSaved :
                    voice.status==="error"      ? "⚠️ Type this field manually or tap Skip Question…" :
                    "🎤 Speak your answer, then tap Submit…";
                  return (
                  <div style={{ background:"rgba(34,197,94,0.06)", border:`1px solid ${vColor}66`, borderRadius:10, padding:"12px 14px", transition:"border-color 0.3s" }}>
                    {/* Status row */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ color:vColor, fontWeight:800, fontSize:11, direction:"ltr" }}>
                        {voiceLabel()} — {tx.voiceStep} {voice.stepIdx+1} {tx.voiceOf} {voice.totalSteps}
                      </div>
                      {/* Animated indicator: speaker wave when speaking, mic pulse when listening/processing */}
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        {voice.status==="speaking"
                          ? <Volume2 size={13} style={{ color:vColor, animation:"none" }}/>
                          : <div style={{ width:8, height:8, borderRadius:"50%", background:vColor, animation:"micPulse 1.2s ease-in-out infinite" }}/>
                        }
                      </div>
                    </div>
                    {/* Question text — large and readable. Uses the theme-aware
                        C.subtle/C.text pair (not a hardcoded light color) so it
                        stays readable in both light and dark theme. */}
                    <div style={{ fontSize:13, fontWeight:700, lineHeight:1.55, padding:"10px 12px", background:C.subtle, borderRadius:8, marginBottom:8, direction:lang==="ur"?"rtl":"ltr", color:C.text }}>
                      {voice.currentPrompt}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ fontSize:10, opacity:0.4 }}>
                        {statusLine}
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        {canSubmit && (
                          <button type="button" onClick={voice.submitAnswer}
                            style={{ background:"#22c55e", border:"none", color:"white", cursor:"pointer", fontSize:10, fontWeight:800, borderRadius:6, padding:"3px 9px" }}>
                            ✅ Submit Answer
                          </button>
                        )}
                        {canSkip && (
                          <button type="button" onClick={voice.skip}
                            style={{ background:"transparent", border:`1px solid ${C.border}`, color:C.text, opacity:0.6, cursor:"pointer", fontSize:10, fontWeight:700, borderRadius:6, padding:"3px 9px" }}>
                            Skip Question →
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ display:"flex", gap:5, direction:"ltr" }}>
                      {Array.from({length:voice.totalSteps}).map((_,i)=>(
                        <div key={i} style={{ height:3, flex:1, borderRadius:2, background:i<voice.stepIdx?"#22c55e":i===voice.stepIdx?vColor:C.border }}/>
                      ))}
                    </div>
                  </div>
                  );
                })()}

                {/* CNIC + Voice buttons */}
                <div style={{ display:"flex", gap:8 }}>
                  <button type="button" onClick={()=>setShowCNIC(true)} style={BTN("#6366f1",{flex:1})}><Camera size={13}/> {tx.scanCNIC}</button>
                  <button type="button" onClick={voice.isActive?voice.stop:voice.start} style={BTN(VC[voice.status]||"#3b82f6",{flex:1})}>
                    {voice.isActive?<><Square size={13}/>{tx.stop}</>:<><Mic size={13}/>{tx.voiceQA}</>}
                  </button>
                </div>

                {/* ── BIOMETRIC LOOKUP ROW + JOHN DOE PROTOCOL BANNER ─────────── */}

                {/* ── Hardware Device Simulator ─────────────────────────────── */}
                <BiometricPanel
                  onVerificationSuccess={handleBiometricSuccess}
                  onVerificationFailure={handleBiometricFailure}
                />

                {/* John Doe Protocol banner — driven by anonBanner state */}
                {anonBanner === "notfound" && (
                  <div
                    id="john-doe-protocol-banner"
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(245,158,11,0.5)",
                      background: "linear-gradient(135deg,rgba(245,158,11,0.12),rgba(234,88,12,0.08))",
                      padding: "13px 16px",
                      display: "flex", flexDirection:"column", gap:8,
                      animation: "slideDown 0.35s cubic-bezier(.4,0,.2,1)",
                    }}
                  >
                    {/* Title row */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, fontWeight:900, color:"#fbbf24", letterSpacing:0.4 }}>
                        ⚠️ Identity not found in NADRA. Switching to Emergency John Doe Protocol.
                      </span>
                      <button
                        type="button"
                        onClick={() => { setAnonBanner(null); setIsAnonymous(false); setForm(p=>({...p,name:""})); }}
                        style={{ background:"none", border:"none", color:"#fbbf24", cursor:"pointer", fontSize:14, lineHeight:1, padding:"0 2px" }}
                        title="Dismiss"
                      >×</button>
                    </div>
                    {/* Status pills */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {[
                        ["🟡", "Anonymous Mode",  "#f59e0b"],
                        ["✏️", "Fields Editable", "#3b82f6"],
                        ["📋", "Name Pre-filled",  "#8b5cf6"],
                        ["🔓", "All Inputs Open",  "#22c55e"],
                      ].map(([icon,label,col]) => (
                        <span key={label} style={{
                          fontSize:9, fontWeight:800, letterSpacing:0.6,
                          background:`${col}22`, color:col,
                          border:`1px solid ${col}55`, borderRadius:20,
                          padding:"3px 8px",
                        }}>{icon} {label}</span>
                      ))}
                    </div>
                    {/* Instructions */}
                    <div style={{ fontSize:10, color:"rgba(251,191,36,0.75)", lineHeight:1.6 }}>
                      Patient name set to <strong style={{ color:"#fbbf24" }}>"Unidentified John Doe"</strong>.
                      Age, Gender, CNIC and all vitals are fully editable.
                      Override any field before generating the PCR report.
                    </div>
                  </div>
                )}

                {/* Verified identity banner */}
                {anonBanner === "found" && (
                  <div style={{
                    borderRadius:10, border:"1px solid rgba(34,197,94,0.4)",
                    background:"rgba(34,197,94,0.08)", padding:"10px 14px",
                    fontSize:11, fontWeight:700, color:"#4ade80",
                    display:"flex", alignItems:"center", gap:8,
                    animation:"slideDown 0.3s ease",
                  }}>
                    <CheckCircle size={14}/>
                    NADRA Identity Verified — patient data auto-filled from registry.
                  </div>
                )}

                {/* Error banner */}
                {anonBanner === "error" && (
                  <div style={{
                    borderRadius:10, border:"1px solid rgba(239,68,68,0.4)",
                    background:"rgba(239,68,68,0.08)", padding:"10px 14px",
                    fontSize:11, fontWeight:700, color:"#f87171",
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    animation:"slideDown 0.3s ease",
                  }}>
                    <span>⚠ NADRA service unavailable. Please fill fields manually.</span>
                    <button type="button" onClick={()=>setAnonBanner(null)}
                      style={{ background:"none", border:"none", color:"#f87171", cursor:"pointer", fontSize:14 }}>×</button>
                  </div>
                )}

                {/* Location */}
                <div>
                  <label style={LB}>{tx.location}</label>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <MapPin size={14} style={{ color:"#ef4444", flexShrink:0 }}/>
                    <input style={IN} placeholder={tx.locationPh} value={form.location} onChange={e=>sf("location")(e.target.value)}/>
                  </div>
                </div>

                {/* Chief Complaint */}
                <div>
                  <label style={LB}>{tx.complaint}</label>
                  <textarea style={{...IN,resize:"vertical",direction:lang==="ur"?"rtl":"ltr"}} rows={3} required
                    placeholder={tx.complaintPh} value={form.description} onChange={e=>sf("description")(e.target.value)}/>
                </div>

                {/* Name + Gender */}
                <div style={{ display:"grid", gridTemplateColumns:"3fr 2fr", gap:10 }}>
                  <div>
                    <label style={LB}>
                      {tx.patientName}
                      {/* Anonymous mode badge — only shows when biometric lookup returned 404 */}
                      {isAnonymous && (
                        <span style={{
                          marginLeft: 8, fontSize: 9, fontWeight: 700,
                          background: "#f59e0b22", color: "#f59e0b",
                          border: "1px solid #f59e0b55", borderRadius: 4,
                          padding: "1px 6px", letterSpacing: 0.5,
                        }}>
                          ANONYMOUS
                        </span>
                      )}
                    </label>
                    {/* Name input — always fully editable (never disabled).
                        In anonymous mode the value starts as "Unidentified John Doe"
                        but the operator can freely overwrite it with any partial ID. */}
                    <input
                      style={{
                        ...IN,
                        ...(isAnonymous ? {
                          borderColor: "#f59e0b",
                          background:  "rgba(245,158,11,0.06)",
                        } : {}),
                      }}
                      placeholder={tx.namePh}
                      value={form.name}
                      onChange={e => sf("name")(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={LB}>{tx.gender}</label>
                    <select style={{...IN,cursor:"pointer"}} value={form.gender} onChange={e=>sf("gender")(e.target.value)}>
                      <option value="Male">{tx.gender_m}</option>
                      <option value="Female">{tx.gender_f}</option>
                      <option value="Other">{tx.gender_o}</option>
                    </select>
                  </div>
                </div>

                {/* Father / Husband Name — auto-filled from CNIC scan */}
                <div>
                  <label style={LB}>FATHER / HUSBAND NAME</label>
                  <input style={IN} placeholder="Auto-filled from CNIC scan"
                    value={form.father_name} onChange={e=>sf("father_name")(e.target.value)}/>
                </div>

                {/* CNIC + Age */}
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
                  <div>
                    <label style={LB}>{tx.cnicLabel}</label>
                    <input style={IN} placeholder={tx.cnicPh} value={form.cnic} onChange={e=>sf("cnic")(e.target.value)}/>
                  </div>
                  <div>
                    <label style={LB}>
                      {tx.age}
                      {isAnonymous && (
                        <span style={{ marginLeft:6, fontSize:8, fontWeight:800,
                          background:"rgba(245,158,11,0.15)", color:"#f59e0b",
                          border:"1px solid rgba(245,158,11,0.3)", borderRadius:3,
                          padding:"1px 5px", verticalAlign:"middle" }}>ESTIMATE</span>
                      )}
                    </label>
                    <input
                      style={{
                        ...IN,
                        ...(isAnonymous ? { borderColor:"#f59e0b", background:"rgba(245,158,11,0.05)" } : {}),
                      }}
                      placeholder={isAnonymous ? "Estimated age" : tx.agePh}
                      type="number" value={form.age}
                      onChange={e=>sf("age")(e.target.value)}
                    />
                  </div>
                </div>

                {/* Vitals */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                  {[["heart_rate",tx.hrLabel,<Heart size={10}/>],["blood_pressure",tx.bpLabel,<Stethoscope size={10}/>],["oxygen_saturation",tx.spo2Label,<Thermometer size={10}/>]].map(([f,l,ic])=>(
                    <div key={f}>
                      <label style={{...LB,display:"flex",alignItems:"center",gap:4}}>{ic} {l}</label>
                      <input style={IN} placeholder={l} value={form[f]} onChange={e=>sf(f)(e.target.value)}/>
                    </div>
                  ))}
                </div>

                {/* Allergies */}
                <div>
                  <label style={LB}>ALLERGIC TO</label>
                  <input style={IN} placeholder="e.g. Penicillin, Aspirin — leave blank if none"
                    value={form.allergies} onChange={e=>sf("allergies")(e.target.value)}/>
                </div>

                {/* AVPU */}
                <div>
                  <label style={LB}>{tx.avpu}</label>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, direction:"ltr" }}>
                    {["Alert","Verbal","Pain","Unresponsive"].map((lvl,i)=>{
                      const cols={Alert:"#22c55e",Verbal:"#3b82f6",Pain:"#f59e0b",Unresponsive:"#ef4444"};
                      const a = form.consciousness_level===lvl;
                      return (
                        <div key={lvl} onClick={()=>sf("consciousness_level")(lvl)}
                          style={{ padding:"8px 4px", borderRadius:8, cursor:"pointer", textAlign:"center", fontSize:9, fontWeight:800, border:`2px solid ${a?cols[lvl]:"transparent"}`, background:a?`${cols[lvl]}20`:C.subtle, color:a?cols[lvl]:C.text, transition:"all 0.15s" }}>
                          {tx.avpuLevels[i]}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Submit */}
                <button type="submit" disabled={loading}
                  style={{ padding:"14px", borderRadius:12, background:loading?"#374151":"linear-gradient(135deg,#ef4444,#b91c1c)", color:"white", fontWeight:900, border:"none", cursor:loading?"not-allowed":"pointer", fontSize:13, letterSpacing:"2px", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginTop:4, boxShadow:loading?"none":"0 4px 18px rgba(239,68,68,0.3)", fontFamily:"inherit" }}>
                  {loading
                    ?<><span style={{width:15,height:15,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid white",display:"inline-block",animation:"spin 1s linear infinite"}}/>{tx.generating}</>
                    :<><Ambulance size={16}/>{tx.generate}</>}
                </button>
              </form>

              </div>
            )}
            {tab==="hospitals" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {/* Header row */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", direction:"ltr" }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, opacity:0.4, letterSpacing:"2px" }}>{tx.nearbyTitle}</div>
                    {form.location && (
                      <div style={{ fontSize:10, color:"#3b82f6", marginTop:3, display:"flex", alignItems:"center", gap:4 }}>
                        <MapPin size={9}/> {form.location}
                      </div>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>loadHospitals(formLocRef.current)} style={BTN("#3b82f6",{fontSize:11,padding:"7px 11px"})}><RefreshCw size={11}/> {tx.refreshGPS}</button>
                    <button onClick={searchByTypedLocation} style={BTN("#6366f1",{fontSize:11,padding:"7px 11px"})} title={tx.searchByLoc}><MapPin size={11}/></button>
                  </div>
                </div>

                {/* Interactive Emergency Map */}
                {(incidentCoords || (coords && Math.abs(coords.lat) > 0.1)) && hospitals.length > 0 && (
                  <div style={{ borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}` }}>
                    <EmergencyMap
                      incidentLat={(incidentCoords || coords)?.lat}
                      incidentLng={(incidentCoords || coords)?.lng}
                      incidentLabel={form.location || "Incident Location"}
                      hospitals={hospitals.slice(0, 5)}
                      triageColor={result ? triageColor(tryParseJSON(result)?.triage_level) : "#ef4444"}
                    />
                    <div style={{ padding:"8px 12px", background:dark?"rgba(6,13,24,0.9)":"rgba(240,244,248,0.95)", fontSize:10, opacity:0.6, display:"flex", gap:14, direction:"ltr" }}>
                      <span>🔴 Incident</span>
                      <span>🔵 Nearest hospital</span>
                      <span>⬜ Other hospitals</span>
                      <span>— Route (OSRM)</span>
                    </div>
                  </div>
                )}

                {coords && Math.abs(coords.lat) > 0.1 && (
                  <div style={{ fontSize:10, opacity:0.35, direction:"ltr" }}>📍 Resolved: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</div>
                )}

                <HospitalPanel
                  hospitals={hospitals} loading={hLoad}
                  error={hospErrToShow}
                  onRefresh={()=>loadHospitals(formLocRef.current)}
                  onSearchByLoc={searchByTypedLocation}
                  darkMode={dark} tx={tx}
                  triageLevel={tryParseJSON(result)?.triage_level || ""}
                />
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {tab==="history" && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, opacity:0.4, letterSpacing:"2px", marginBottom:14, direction:dir }}>
                  {tx.historyTitle} {form.cnic&&`— ${form.cnic}`}
                </div>
                {history.length===0
                  ?<div style={{ opacity:0.35, fontSize:13, textAlign:"center", padding:"36px 0", direction:dir }}>{form.cnic?tx.noHistory:tx.scanFirst}</div>
                  :[...history].sort((a,b)=>historyTimestamp(b)-historyTimestamp(a)).map((r,i,arr)=>{
                    const ts2=new Date(historyTimestamp(r)||Date.now());
                    return (
                      <div key={r.id} style={{ padding:14, borderRadius:12, background:C.subtle, border:`1px solid ${C.border}`, marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <div style={{ fontWeight:800, fontSize:13 }}>{tx.visit}{arr.length-i}</div>
                            <div style={{ fontSize:11, opacity:0.5, marginTop:2, direction:"ltr" }}>{ts2.toLocaleString("en-PK")}</div>
                          </div>
                          {r.triage_level&&<div style={{ fontSize:9, background:triageColor(r.triage_level), color:"white", padding:"3px 8px", borderRadius:6, fontWeight:800 }}>{r.triage_level}</div>}
                        </div>
                        <div style={{ fontSize:12, marginTop:8, opacity:0.75, lineHeight:1.5 }}>{(r.description||"").slice(0,120)}{(r.description||"").length>120?"…":""}</div>
                        <div style={{ display:"flex", gap:14, marginTop:8, fontSize:11, opacity:0.5, direction:"ltr" }}>
                          {r.heart_rate&&<span>❤ {r.heart_rate}</span>}
                          {r.blood_pressure&&<span>⚡ {r.blood_pressure}</span>}
                          {r.oxygen_saturation&&<span>🫁 {r.oxygen_saturation}%</span>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* ── VITALS TAB ── */}
            {tab==="vitals" && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, opacity:0.4, letterSpacing:"2px", marginBottom:14, direction:dir }}>
                  {tx.vitalsTitle} — {form.name||"Patient"}
                </div>
                <VitalsChart history={history} darkMode={dark}/>

                {/* ── Slidable telemetry timeline — most recent capture first ── */}
                <div style={{ fontSize:10, fontWeight:700, opacity:0.4, letterSpacing:"2px", margin:"18px 0 10px", direction:dir }}>
                  TELEMETRY TIMELINE
                </div>
                {history.length===0 ? (
                  <div style={{ opacity:0.35, fontSize:13, textAlign:"center", padding:"24px 0", direction:dir }}>{form.cnic?tx.noHistory:tx.scanFirst}</div>
                ) : (
                  <div style={{
                    display:"flex", overflowX:"auto", scrollSnapType:"x mandatory",
                    gap:16, padding:10, WebkitOverflowScrolling:"touch",
                  }}>
                    {[...history].sort((a,b)=>historyTimestamp(b)-historyTimestamp(a)).map((r,i) => (
                      <div key={r.id||i} style={{
                        scrollSnapAlign:"start", flex:"0 0 auto", minWidth:170,
                        padding:14, borderRadius:12, background:C.subtle, border:`1px solid ${C.border}`,
                        direction:"ltr",
                      }}>
                        <div style={{ fontSize:9, opacity:0.4, letterSpacing:"1px", marginBottom:8 }}>
                          {new Date(historyTimestamp(r)||Date.now()).toLocaleString("en-PK")}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", gap:6, fontSize:12 }}>
                          <span>❤ HR: {r.heart_rate || "—"}</span>
                          <span>⚡ BP: {r.blood_pressure || "—"}</span>
                          <span>🫁 SpO2: {r.oxygen_saturation ? `${r.oxygen_saturation}%` : "—"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT — RESULTS PANEL (always LTR, medical content is English) */}
        <main style={{ padding:24, overflowY:"auto", direction:"ltr", display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <span style={{ fontWeight:900, fontSize:10, letterSpacing:"3px", color:"#ef4444" }}>◈ AI PCR ANALYSIS & DISPATCH</span>
            {result && (
              <div style={{ display:"flex", gap:8 }}>
                <button style={BTN(speaking?"#ef4444":"#10b981")} onClick={()=>{
                  if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
                  const narrateLang = lang==="ur" ? "ur-PK" : lang==="ru" ? "ur-PK" : "en-US";
                  const parsedForSpeech = tryParseJSON(result);
                  const speechText = parsedForSpeech
                    ? [
                        parsedForSpeech.classification && `Condition: ${parsedForSpeech.classification}.`,
                        parsedForSpeech.triage_level && `Triage level: ${parsedForSpeech.triage_level}.`,
                        parsedForSpeech.instructions,
                        parsedForSpeech.soap_note,
                      ].filter(Boolean).join(" ")
                    : result.replace(/[*#•\-]/g,"");
                  const u = new SpeechSynthesisUtterance(speechText);
                  u.lang = narrateLang; u.rate = 0.88; u.pitch = 1; u.volume = 1;
                  // Pick best voice for this language
                  const voices = window.speechSynthesis.getVoices();
                  const best = voices.find(v=>v.lang===narrateLang) || voices.find(v=>v.lang.startsWith(narrateLang.slice(0,2)));
                  if (best) u.voice = best;
                  u.onend = () => setSpeaking(false);
                  u.onerror = () => setSpeaking(false);
                  window.speechSynthesis.speak(u);
                  setSpeaking(true);
                }}>{speaking?<><Square size={13}/>{tx.stop}</>:<><Volume2 size={13}/>{tx.narrate}</>}</button>
                <button style={BTN("#3b82f6")} onClick={downloadPDF}><Download size={13}/> {tx.pdf}</button>
              </div>
            )}
          </div>

          {!result&&!loading&&(
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"68vh", opacity:0.1 }}>
              <Ambulance size={80}/>
              <div style={{ marginTop:18, fontWeight:700, letterSpacing:"4px", fontSize:13 }}>{tx.awaiting}</div>
            </div>
          )}

          {loading&&(
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"68vh" }}>
              <div style={{ width:60, height:60, borderRadius:"50%", border:"4px solid rgba(239,68,68,0.12)", borderTop:"4px solid #ef4444", animation:"spin 1s linear infinite" }}/>
              <div style={{ marginTop:22, fontWeight:700, letterSpacing:"2px", color:"#ef4444", fontSize:14 }}>{tx.generating}</div>
            </div>
          )}

          {result&&!loading&&(() => {
            const parsed = tryParseJSON(result);

            // ── Fallback: AI didn't return valid JSON — show ONE clean,
            // scrollable raw-text card. No secondary/duplicate container,
            // so there is nothing left to overlap or bleed sideways.
            if (!parsed) {
              return (
                <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
                  <div style={{
                    padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}`,
                    maxHeight:"64vh", overflowY:"auto",
                  }}>
                    <div style={{ fontSize:10, fontWeight:900, color:"#ef4444", letterSpacing:"2px", marginBottom:9 }}>
                      ⚠ AI RESPONSE (UNSTRUCTURED — RAW OUTPUT)
                    </div>
                    <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.8, margin:0 }}>{result}</pre>
                  </div>
                </div>
              );
            }

            const tColor = triageColor(parsed.triage_level);

            return (
              <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
                {/* Triage Banner */}
                <div style={{ padding:"19px 22px", borderRadius:16, background:`${tColor}12`, border:`2px solid ${tColor}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, opacity:0.45, letterSpacing:"2px" }}>{tx.condition}</div>
                    <div style={{ fontSize:19, fontWeight:900, marginTop:4 }}>{parsed.classification || "—"}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, fontWeight:700, opacity:0.45, letterSpacing:"2px" }}>{tx.triage}</div>
                    <div style={{ fontSize:19, fontWeight:900, color:tColor, marginTop:4 }}>{parsed.triage_level || "—"}</div>
                  </div>
                </div>

                {/* Narration status bar — visible when narrating */}
                {speaking && (
                  <div style={{ padding:"12px 16px", borderRadius:12, background:"rgba(16,185,129,0.12)", border:"1.5px solid #10b981", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:"#10b981", animation:"micPulse 1.2s ease-in-out infinite" }}/>
                      <span style={{ fontWeight:800, fontSize:12, color:"#10b981" }}>{tx.narratingMsg}</span>
                    </div>
                    <button style={BTN("#ef4444",{fontSize:11,padding:"6px 12px"})} onClick={()=>{ window.speechSynthesis.cancel(); setSpeaking(false); }}>
                      <Square size={11}/> {tx.stop}
                    </button>
                  </div>
                )}

                {/* Optimized Route + Nearest Hospital */}
                {parsed.optimized_route && (
                  <div style={{padding:"14px 17px",borderRadius:13,background:"rgba(239,68,68,0.06)",border:"2px solid rgba(239,68,68,0.4)",borderLeft:"5px solid #ef4444"}}>
                    <div style={{fontSize:10,fontWeight:900,color:"#ef4444",letterSpacing:"2px",marginBottom:7}}>{tx.optimRoute}</div>
                    <div style={{fontSize:13,fontWeight:700,lineHeight:1.6,color:"#f87171"}}>🚑 {parsed.optimized_route}</div>
                    {hospitals.length>0&&(
                      <div style={{marginTop:11,paddingTop:11,borderTop:"1px solid rgba(239,68,68,0.18)"}}>
                        <div style={{fontSize:9,opacity:0.4,letterSpacing:"1.5px",marginBottom:6}}>NEAREST VERIFIED HOSPITAL</div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:800}}>{hospitals[0].name}</div>
                            <div style={{fontSize:11,opacity:0.55,marginTop:2}}>📍 {hospitals[0].dist_km} km{hospitals[0].address?` · ${hospitals[0].address}`:""}</div>
                            {hospitals[0].phone&&hospitals[0].phone!=="N/A"&&(
                              <a href={`tel:${hospitals[0].phone}`}
                                style={{fontSize:11,color:"#22c55e",display:"inline-flex",alignItems:"center",gap:4,marginTop:4,textDecoration:"none"}}>
                                <PhoneCall size={11}/> {hospitals[0].phone}
                              </a>
                            )}
                          </div>
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${hospitals[0].lat},${hospitals[0].lng}&travelmode=driving`}
                            target="_blank" rel="noopener noreferrer"
                            style={{background:"#ef4444",color:"white",padding:"9px 14px",borderRadius:9,
                              fontSize:11,fontWeight:800,textDecoration:"none",
                              display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                            <Navigation size={12}/> Navigate
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Instructions + Equipment */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13 }}>
                  {[[tx.fieldInstr,parsed.instructions,"#3b82f6"],[tx.equipMeds,parsed.equipment_advice,"#f59e0b"]].map(([title,text,col])=>(
                    <div key={title} style={{ padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}` }}>
                      <div style={{ fontSize:10, fontWeight:900, color:col, letterSpacing:"2px", marginBottom:9 }}>{title}</div>
                      <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.8, margin:0 }}>{text || "—"}</pre>
                    </div>
                  ))}
                </div>

                {/* SOAP Note */}
                <div style={{ padding:17, borderRadius:13, background:C.subtle, border:"1px solid rgba(34,197,94,0.3)", borderLeft:"5px solid #22c55e" }}>
                  <div style={{ fontSize:10, fontWeight:900, color:"#22c55e", letterSpacing:"2px", marginBottom:9 }}>{tx.soapNote}</div>
                  <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.9, margin:0 }}>{parsed.soap_note || "—"}</pre>
                </div>

                {/* Nearby Hospitals inline */}
                {hospitals.length>0&&(
                  <div style={{ padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:10, fontWeight:900, color:"#ef4444", letterSpacing:"2px", marginBottom:12 }}>{tx.nearFacility}</div>
                    <HospitalPanel hospitals={hospitals.slice(0,2)} loading={false} error="" onRefresh={()=>loadHospitals(formLocRef.current)} onSearchByLoc={searchByTypedLocation} darkMode={dark} tx={tx} triageLevel={parsed.triage_level}/>
                  </div>
                )}

                {/* Physical Assessment */}
                <div style={{ padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:10, fontWeight:900, color:"#a855f7", letterSpacing:"2px", marginBottom:9 }}>{tx.physAssess}</div>
                  <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.8, margin:0 }}>{parsed.physical_condition || "—"}</pre>
                </div>
              </div>
            );
          })()}
        </main>
      </div>
    </div>
  );
}