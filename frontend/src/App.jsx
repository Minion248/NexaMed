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
const VOICE_FIELDS = ["name","description","age","heart_rate","blood_pressure","oxygen_saturation"];
const VOICE_QS = {
  "en": [
    "What is the patient's full name?",
    "Describe the emergency. What are the symptoms and how did it happen?",
    "What is the patient's age in years?",
    "What is the heart rate in beats per minute?",
    "What is the blood pressure? Say systolic over diastolic.",
    "What is the oxygen saturation percentage?",
  ],
  "ur": [
    "مریض کا پورا نام کیا ہے؟",
    "ایمرجنسی کیا ہے؟ علامات کیا ہیں؟",
    "مریض کی عمر کتنی ہے؟",
    "دل کی دھڑکن فی منٹ کتنی ہے؟",
    "بلڈ پریشر کیا ہے؟",
    "آکسیجن کی سطح کیا ہے؟",
  ],
  "ru": [
    "Mareez ka poora naam kya hai?",
    "Emergency kya hai? Alamat kya hain aur kaise hua?",
    "Mareez ki umar kitni saal hai?",
    "Dil ki dhadkan per minute kitni hai?",
    "Blood pressure kya hai? Systolic over diastolic bolein.",
    "Oxygen saturation kitni hai?",
  ],
};
// Speech-recognition language codes
// Roman Urdu: people speak Urdu words but in Latin script — SR "ur-PK" captures spoken Urdu,
// which is what they're saying even if they type in Roman. So ur-PK is correct for speaking.
const SR_LANG = { "en": "en-US", "ur": "ur-PK", "ru": "ur-PK" };

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
// FIX 1 — CNIC SCANNER via FREE Groq backend (no Anthropic key needed)
// ═══════════════════════════════════════════════════════════════════════════
async function scanCNICviaBackend(file) {
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error("File read failed"));
    r.onload  = e => res(e.target.result.split(",")[1]);
    r.readAsDataURL(file);
  });

  const resp = await fetch(`${BACKEND}/cnic/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: b64, media_type: file.type || "image/jpeg" }),
    signal: AbortSignal.timeout(35000),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(
      err.detail ||
      `Backend error ${resp.status}. Make sure uvicorn is running and GROQ_API_KEY is in .env`
    );
  }
  const json = await resp.json();
  if (!json.data) throw new Error("No data returned from backend");
  return json.data;
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE ENGINE — Speak question aloud THEN listen for answer
// Works in Chrome on localhost. Chrome TTS bug (stall) worked around with
// a periodic resume() kick and a hard 10s timeout fallback.
// All stale closures eliminated via refs.
// ═══════════════════════════════════════════════════════════════════════════
function useVoice(lang, onFieldUpdate, onFinish) {
  const [stepIdx, setStepIdx] = useState(-1);
  const [status,  setStatus]  = useState("idle"); // idle|speaking|listening|done|error
  const [errMsg,  setErrMsg]  = useState("");

  const recRef       = useRef(null);
  const doneRef      = useRef(false);
  const stoppedRef   = useRef(false);  // user pressed Stop — block all callbacks
  const collRef      = useRef({});
  const langRef      = useRef(lang);
  const onUpdateRef  = useRef(onFieldUpdate);
  const onFinishRef  = useRef(onFinish);
  const micStreamRef = useRef(null);
  const resumeTimer  = useRef(null); // Chrome TTS stall-kick timer
  const stepIdxRef   = useRef(-1);

  useEffect(() => { langRef.current    = lang; },          [lang]);
  useEffect(() => { onUpdateRef.current = onFieldUpdate; }, [onFieldUpdate]);
  useEffect(() => { onFinishRef.current = onFinish; },      [onFinish]);
  useEffect(() => { stepIdxRef.current  = stepIdx; },       [stepIdx]);

  const prompts = VOICE_QS[lang] || VOICE_QS["en"];

  // Pick the best available TTS voice for the current language
  // On Windows, Urdu voice is named "Microsoft Urdu" — match by name too
  const getBestVoice = useCallback((langCode) => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const lc = langCode.toLowerCase();
    const prefix = lc.slice(0, 2); // "ur", "en", etc.
    return (
      voices.find(v => v.lang.toLowerCase() === lc) ||
      voices.find(v => v.name.toLowerCase().includes(prefix === "ur" ? "urdu" : prefix)) ||
      voices.find(v => v.lang.toLowerCase().startsWith(prefix)) ||
      null  // return null — don't fall back to wrong language voice
    );
  }, []);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimer.current) { clearInterval(resumeTimer.current); resumeTimer.current = null; }
  }, []);

  const killAll = useCallback(() => {
    stoppedRef.current = true;   // block any pending callbacks immediately
    clearResumeTimer();
    window.speechSynthesis?.cancel();
    try { recRef.current?.stop(); } catch {}
    try { recRef.current?.abort(); } catch {}
    recRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
  }, [clearResumeTimer]);

  const stop = useCallback(() => {
    killAll();
    setStepIdx(-1); stepIdxRef.current = -1;
    setStatus("idle"); setErrMsg("");
    collRef.current = {};
    // Reset stopped flag so a new session can start
    setTimeout(() => { stoppedRef.current = false; }, 100);
  }, [killAll]);

  // ── listenAtStep: start SpeechRecognition for step i ─────────────────────
  const listenAtStep = useCallback((i) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus("error"); setErrMsg("noSR"); return; }

    const curLang = langRef.current;
    const curQs   = VOICE_QS[curLang] || VOICE_QS["en"];
    const srCode  = SR_LANG[curLang] || "en-US";
    const total   = curQs.length;

    // Abort any previous recognition
    try { recRef.current?.abort(); } catch {}

    const rec = new SR();
    recRef.current      = rec;
    rec.lang            = srCode;
    rec.continuous      = false;
    rec.interimResults  = false;
    rec.maxAlternatives = 1;
    doneRef.current     = false;

    const advance = () => {
      if (stoppedRef.current) return;  // user pressed Stop — don't advance
      const next = i + 1;
      if (next >= total) {
        killAll();
        setStatus("done");
        onFinishRef.current({ ...collRef.current });
        setStepIdx(-1); stepIdxRef.current = -1;
      } else {
        setStepIdx(next); stepIdxRef.current = next;
      }
    };

    rec.onresult = e => {
      if (doneRef.current) return;
      doneRef.current = true;
      const val = e.results[0]?.[0]?.transcript?.trim() || "";
      collRef.current[VOICE_FIELDS[i]] = val;
      onUpdateRef.current(VOICE_FIELDS[i], val);
      advance();
    };

    rec.onerror = e => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (e.error === "no-speech")                             advance();
      else if (e.error === "not-allowed" || e.error === "audio-capture")
        { setStatus("error"); setErrMsg("micDenied"); }
      else { setStatus("error"); setErrMsg(`Mic error: ${e.error}`); }
    };

    rec.onend = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      advance();
    };

    setStatus("listening");
    try { rec.start(); }
    catch (e) { setStatus("error"); setErrMsg(`Mic start failed: ${e.message}`); }
  }, [killAll]);

  // ── speakThenListen: TTS speaks question, then recognition starts ─────────
  const speakThenListen = useCallback((i) => {
    clearResumeTimer();
    window.speechSynthesis.cancel();

    const curLang = langRef.current;
    const curQs   = VOICE_QS[curLang] || VOICE_QS["en"];
    const srCode  = SR_LANG[curLang] || "en-US";
    if (i >= curQs.length) return;

    setStatus("speaking");

    const doSpeak = () => {
      const utt    = new SpeechSynthesisUtterance(curQs[i]);
      utt.lang     = srCode;
      utt.rate     = 0.88;
      utt.pitch    = 1;
      utt.volume   = 1;

      // Assign best available voice for language
      const voice = getBestVoice(srCode);
      if (voice) utt.voice = voice;

      let done = false;

      const startListening = () => {
        if (done || stoppedRef.current) return;  // stopped → don't start listening
        done = true;
        clearResumeTimer();
        // 350ms gap between TTS end and mic start — prevents Chrome audio overlap
        setTimeout(() => { if (!stoppedRef.current) listenAtStep(i); }, 350);
      };

      utt.onend   = startListening;
      utt.onerror = startListening; // if TTS fails for any reason, still listen

      window.speechSynthesis.speak(utt);

      // Chrome TTS bug: speechSynthesis.speaking can stall silently on localhost.
      // Fix: kick resume() every 2s. Also hard-timeout at 10s → skip to listen.
      resumeTimer.current = setInterval(() => {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 2000);

      setTimeout(() => {
        if (!done) {
          clearResumeTimer();
          window.speechSynthesis.cancel();
          startListening();
        }
      }, 10000); // 10s max for any question TTS
    };

    // Chrome requires a tiny pause after .cancel() before .speak() works
    setTimeout(doSpeak, 150);
  }, [clearResumeTimer, getBestVoice, listenAtStep]);

  // Drive the interview: each stepIdx change triggers speak+listen
  useEffect(() => {
    if (stepIdx >= 0) speakThenListen(stepIdx);
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      setStatus("error"); setErrMsg("noSR"); return;
    }
    // Get mic permission first — keeps stream alive so Chrome doesn't re-block
    stoppedRef.current = false;  // clear stop flag for new session
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        micStreamRef.current = stream;
        collRef.current = {};
        setErrMsg("");
        setStatus("idle");
        // Wait for voices to load (Chrome loads them async)
        const kick = () => { setStepIdx(0); stepIdxRef.current = 0; };
        if (window.speechSynthesis.getVoices().length > 0) {
          setTimeout(kick, 150);
        } else {
          window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; setTimeout(kick, 150); };
          setTimeout(kick, 800); // fallback if onvoiceschanged never fires
        }
      })
      .catch(() => { setStatus("error"); setErrMsg("micDenied"); });
  }, []);

  return {
    status, errMsg, stepIdx,
    totalSteps:    prompts.length,
    isActive:      stepIdx >= 0 && status !== "done" && status !== "error",
    currentPrompt: stepIdx >= 0 && stepIdx < prompts.length ? prompts[stepIdx] : "",
    start, stop,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2 — LEAFLET MAP (OpenStreetMap, no API key)
// ═══════════════════════════════════════════════════════════════════════════
function LeafletMap({ lat, lng, name }) {
  const containerId = useRef(`lmap-${Math.random().toString(36).slice(2)}`);
  const mapRef      = useRef(null);

  useEffect(() => {
    if (!lat || !lng) return;

    const init = async () => {
      // Load Leaflet if not already loaded
      if (!window.L) {
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css"; link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        await new Promise(res => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          s.onload = res; document.head.appendChild(s);
        });
      }
      const el = document.getElementById(containerId.current);
      if (!el || mapRef.current) return;
      const L   = window.L;
      const map = L.map(el, { zoomControl:true, scrollWheelZoom:false }).setView([lat, lng], 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      L.marker([lat, lng]).addTo(map).bindPopup(`<b>${name || "Hospital"}</b>`).openPopup();
      mapRef.current = map;
    };

    init().catch(console.error);
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, name]);

  return <div id={containerId.current} style={{ width:"100%", height:200 }} />;
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
      // scan_method is enforced by BACKEND:
      //  "local" → EasyOCR only, Groq API is NEVER called
      //  "groq"  → Groq Vision only
      //  "auto"  → EasyOCR → Groq fallback
      const resp = await fetch(`${BACKEND}/cnic/scan`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({image_base64:b64,media_type:file.type||"image/jpeg",scan_method:scanMethod}),
        signal:AbortSignal.timeout(50000),
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
// GOOGLE TRANSLATE WIDGET — proper implementation, no feedback bar
// ═══════════════════════════════════════════════════════════════════════════
const GT_LANGS = [
  ["af","Afrikaans"],["sq","Albanian"],["am","Amharic"],["ar","Arabic"],
  ["hy","Armenian"],["az","Azerbaijani"],["eu","Basque"],["be","Belarusian"],
  ["bn","Bengali"],["bs","Bosnian"],["bg","Bulgarian"],["ca","Catalan"],
  ["ceb","Cebuano"],["ny","Chichewa"],["zh-CN","Chinese (Simplified)"],
  ["zh-TW","Chinese (Traditional)"],["co","Corsican"],["hr","Croatian"],
  ["cs","Czech"],["da","Danish"],["nl","Dutch"],["en","English"],
  ["eo","Esperanto"],["et","Estonian"],["tl","Filipino"],["fi","Finnish"],
  ["fr","French"],["fy","Frisian"],["gl","Galician"],["ka","Georgian"],
  ["de","German"],["el","Greek"],["gu","Gujarati"],["ht","Haitian Creole"],
  ["ha","Hausa"],["haw","Hawaiian"],["iw","Hebrew"],["hi","Hindi"],
  ["hmn","Hmong"],["hu","Hungarian"],["is","Icelandic"],["ig","Igbo"],
  ["id","Indonesian"],["ga","Irish"],["it","Italian"],["ja","Japanese"],
  ["jw","Javanese"],["kn","Kannada"],["kk","Kazakh"],["km","Khmer"],
  ["ko","Korean"],["ku","Kurdish"],["ky","Kyrgyz"],["lo","Lao"],
  ["la","Latin"],["lv","Latvian"],["lt","Lithuanian"],["lb","Luxembourgish"],
  ["mk","Macedonian"],["mg","Malagasy"],["ms","Malay"],["ml","Malayalam"],
  ["mt","Maltese"],["mi","Maori"],["mr","Marathi"],["mn","Mongolian"],
  ["my","Myanmar (Burmese)"],["ne","Nepali"],["no","Norwegian"],
  ["ps","Pashto"],["fa","Persian"],["pl","Polish"],["pt","Portuguese"],
  ["pa","Punjabi"],["ro","Romanian"],["ru","Russian"],["sm","Samoan"],
  ["gd","Scots Gaelic"],["sr","Serbian"],["st","Sesotho"],["sn","Shona"],
  ["sd","Sindhi"],["si","Sinhala"],["sk","Slovak"],["sl","Slovenian"],
  ["so","Somali"],["es","Spanish"],["su","Sundanese"],["sw","Swahili"],
  ["sv","Swedish"],["tg","Tajik"],["ta","Tamil"],["te","Telugu"],
  ["th","Thai"],["tr","Turkish"],["uk","Ukrainian"],["ur","Urdu"],
  ["uz","Uzbek"],["vi","Vietnamese"],["cy","Welsh"],["xh","Xhosa"],
  ["yi","Yiddish"],["yo","Yoruba"],["zu","Zulu"],
];

function GTWidget({ dark, C }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const wrapRef = useRef(null);

  // Load Google Translate script once
  useEffect(() => {
    if (window.__gtScriptLoaded) return;
    window.__gtScriptLoaded = true;
    // Suppress the translate toolbar/badge
    const style = document.createElement("style");
    style.textContent = `
      .goog-te-banner-frame, .goog-te-balloon-frame { display:none!important; }
      body { top:0!important; }
      .goog-te-gadget-icon, .goog-logo-link { display:none!important; }
      .goog-te-gadget { font-size:0!important; }
      .goog-te-combo { display:none!important; }
      #google_translate_element { display:none!important; }
    `;
    document.head.appendChild(style);

    window.googleTranslateElementInit = function() {
      try {
        new window.google.translate.TranslateElement(
          { pageLanguage:"en", autoDisplay:false },
          "google_translate_element"
        );
      } catch(e) { console.warn("GT init:", e); }
    };
    const s = document.createElement("script");
    s.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function applyLang(code, name) {
    setActive(name);
    setOpen(false);
    setSearch("");
    // Use Google Translate cookie approach — most reliable method
    if (code === "en") {
      // Reset to English: clear cookie and reload
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=" + location.hostname;
      window.location.reload();
      return;
    }
    // Set cookie for Google Translate
    const val = `/en/${code}`;
    document.cookie = `googtrans=${val}; path=/`;
    document.cookie = `googtrans=${val}; path=/; domain=${location.hostname}`;
    // Trigger translation via the hidden select element
    const tryTranslate = () => {
      const sel = document.querySelector(".goog-te-combo");
      if (sel) {
        sel.value = code;
        sel.dispatchEvent(new Event("change"));
        return true;
      }
      return false;
    };
    if (!tryTranslate()) {
      // Script not loaded yet — wait and retry
      let tries = 0;
      const interval = setInterval(() => {
        if (tryTranslate() || ++tries > 20) clearInterval(interval);
      }, 250);
    }
  }

  const filtered = search
    ? GT_LANGS.filter(([c,n]) => n.toLowerCase().includes(search.toLowerCase()) || c.toLowerCase().includes(search.toLowerCase()))
    : GT_LANGS;

  return (
    <div ref={wrapRef} style={{position:"relative",zIndex:500}}>
      {/* Hidden GT element needed by the API */}
      <div id="google_translate_element" style={{display:"none"}}/>

      <button
        onClick={()=>setOpen(o=>!o)}
        style={{padding:"6px 11px",borderRadius:8,border:`1px solid ${dark?"#1e3a5f":"#dadce0"}`,
          cursor:"pointer",background:dark?"#0d1b2e":"#fff",
          color:dark?"#e2e8f0":"#3c4043",
          display:"flex",alignItems:"center",gap:6,
          fontWeight:700,fontSize:11,fontFamily:"inherit",
          boxShadow:"0 1px 3px rgba(0,0,0,0.15)",
          minWidth:90}}>
        <svg width="13" height="13" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {active || "Translate"}
      </button>

      {open && (
        <div style={{position:"absolute",top:"110%",right:0,
          background:dark?"#0a1628":"#fff",
          border:`1px solid ${dark?"#1e3a5f":"#e2e8f0"}`,
          borderRadius:13,boxShadow:"0 12px 40px rgba(0,0,0,0.35)",
          width:230,maxHeight:380,display:"flex",flexDirection:"column",
          overflow:"hidden",zIndex:600}}>
          <div style={{padding:"10px 12px",borderBottom:`1px solid ${dark?"#1e3a5f":"#f0f0f0"}`}}>
            <div style={{fontSize:8,letterSpacing:"2px",opacity:0.4,marginBottom:7}}>TRANSLATE PAGE</div>
            <input
              autoFocus
              value={search}
              onChange={e=>setSearch(e.target.value)}
              placeholder="Search language…"
              style={{width:"100%",background:dark?"rgba(255,255,255,0.05)":"#f5f5f5",
                border:"none",borderRadius:7,padding:"7px 10px",
                color:dark?"#e2e8f0":"#1e293b",fontSize:12,outline:"none",
                fontFamily:"inherit"}}
            />
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {/* English reset option */}
            <div onClick={()=>applyLang("en","English")}
              style={{padding:"9px 14px",cursor:"pointer",fontSize:12,
                fontWeight:active===""||active==="English"?700:400,
                color:active===""||active==="English"?"#3b82f6":dark?"#e2e8f0":"#1e293b",
                background:active===""||active==="English"?"rgba(59,130,246,0.08)":"transparent",
                transition:"background 0.1s",
                borderBottom:`1px solid ${dark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.04)"}`}}
              onMouseEnter={e=>e.currentTarget.style.background=dark?"rgba(255,255,255,0.07)":"#f5f7ff"}
              onMouseLeave={e=>e.currentTarget.style.background=active===""||active==="English"?"rgba(59,130,246,0.08)":"transparent"}>
              🔄 Reset to English
            </div>
            {filtered.filter(([c])=>c!=="en").map(([code, name]) => (
              <div key={code} onClick={()=>applyLang(code, name)}
                style={{padding:"8px 14px",cursor:"pointer",fontSize:12,
                  fontWeight:active===name?700:400,
                  color:active===name?"#3b82f6":dark?"#e2e8f0":"#1e293b",
                  background:active===name?"rgba(59,130,246,0.08)":"transparent",
                  transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=dark?"rgba(255,255,255,0.05)":"#f5f7ff"}
                onMouseLeave={e=>e.currentTarget.style.background=active===name?"rgba(59,130,246,0.08)":"transparent"}>
                {name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2 — HOSPITAL PANEL with GPS denied guide + location-name fallback
// ═══════════════════════════════════════════════════════════════════════════
function HospitalPanel({ hospitals, loading, error, onRefresh, onSearchByLoc, darkMode, tx }) {
  const bd = darkMode?"#1e3a5f":"#e2e8f0";
  const sb = darkMode?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)";
  const tc = darkMode?"#e2e8f0":"#1e293b";

  if (loading) return (
    <div style={{ padding:"28px 0", textAlign:"center", opacity:0.5, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
      <span style={{ width:15, height:15, borderRadius:"50%", border:"2px solid rgba(59,130,246,0.2)", borderTop:"2px solid #3b82f6", display:"inline-block", animation:"spin 1s linear infinite" }}/>
      Locating nearby hospitals…
    </div>
  );

  if (error) return (
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

  if (!hospitals.length) return (
    <div style={{ padding:"26px 0", textAlign:"center", opacity:0.4, fontSize:13 }}>
      Click <strong>{tx.refreshGPS}</strong> to find hospitals near you
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, direction:"ltr" }}>
      {hospitals.map((h, i) => (
        <div key={i} style={{ border:`1px solid ${i===0?"#ef4444":bd}`, borderRadius:14, overflow:"hidden", background:i===0?"rgba(239,68,68,0.04)":sb }}>
          <div style={{ padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:4 }}>
                {i===0 && <span style={{ background:"#ef4444", color:"white", fontSize:9, padding:"2px 7px", borderRadius:4, fontWeight:800 }}>{tx.nearest}</span>}
                {h.emergency && <span style={{ background:"#f59e0b", color:"white", fontSize:9, padding:"2px 7px", borderRadius:4, fontWeight:800 }}>ER</span>}
                <span style={{ background:sb, color:tc, fontSize:9, padding:"2px 7px", borderRadius:4, border:`1px solid ${bd}`, opacity:0.7 }}>{h.type||"hospital"}</span>
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
            {/* FIX 2: Navigate link → works on mobile + desktop */}
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}
              target="_blank" rel="noopener noreferrer"
              style={{ background:"#3b82f6", color:"white", padding:"9px 12px", borderRadius:10, fontSize:11, fontWeight:700, textDecoration:"none", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", flexShrink:0 }}>
              <Navigation size={12}/> {tx.navigate}
            </a>
          </div>
          {/* Interactive Leaflet map for nearest hospital */}
          {i===0 && <LeafletMap lat={h.lat} lng={h.lng} name={h.name}/>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function getSection(text, title) {
  if (!text) return "—";
  const m = text.match(new RegExp(`${title}[:\\s*]+([\\s\\S]*?)(?=\\n[A-Z][A-Z\\s]{3,}:|$)`,"i"));
  return m ? m[1].replace(/[*#•\-]/g,"").trim() : "—";
}
function triageColor(l) {
  const s=(l||"").toLowerCase();
  if (s.includes("red")||s.includes("critical")) return "#ef4444";
  if (s.includes("yellow")||s.includes("urgent")) return "#f59e0b";
  if (s.includes("green")||s.includes("minor"))   return "#22c55e";
  return "#6b7280";
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function NexaMedApp() {
  const { currentUser, userProfile, logout } = useAuth();

  const [dark,      setDark]      = useState(true);
  const [lang,      setLang]      = useState("en");  // "en" | "ur" | "ru"
  const [form,      setForm]      = useState({
    name:"", cnic:"", father_name:"", gender:"Male", age:"", description:"",
    heart_rate:"", blood_pressure:"", oxygen_saturation:"",
    consciousness_level:"Alert", location:"",
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
    // When switching to hospitals tab, use the typed incident location
    // Pass via ref to avoid stale closure (form.location captured at mount time)
    if (tab === "hospitals" && !hLoad) loadHospitals(formLocRef.current);
  }, [tab]); // eslint-disable-line

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
  async function loadHospitals(locOverride) {
    setHLoad(true); setHErr("");
    const locText = locOverride !== undefined ? locOverride : form.location;
    const coords = await getCoordinates(locText);
    if (!coords) { setHErr("gps"); setHLoad(false); return; }
    const { lat, lng, source } = coords;
    setCoords({ lat, lng });
    // Show user which location was used
    if (source === "typed" && locText) {
      console.log("Hospitals: using typed location →", locText, lat, lng);
    }
    try {
      // Always send loc= text so backend can re-geocode and correct wrong coords
      const locParam = locText ? `&loc=${encodeURIComponent(locText)}` : "";
      const r = await fetch(`${BACKEND}/hospitals/nearby?lat=${lat}&lng=${lng}&radius_km=10${locParam}`);
      if (!r.ok) throw new Error(`Backend error ${r.status}. Is uvicorn running?`);
      const d = await r.json();
      // Backend may have corrected lat/lng — update our cached coords
      if (d.lat_used && d.lng_used) {
        setCoords({ lat: d.lat_used, lng: d.lng_used });
        lastCoordsRef.current = { lat: d.lat_used, lng: d.lng_used };
      }
      setHospitals(d.hospitals || []);
      if (!(d.hospitals || []).length) setHErr(tx.gpsNoResult);
    } catch (e) {
      setHErr(e.message || tx.gpsNoResult);
    }
    setHLoad(false);
  }

  // Manual typed-location search — backend does the geocoding, not frontend
  async function searchByTypedLocation() {
    const loc = form.location.trim();
    if (!loc) { toast("Type an incident location first", "error"); return; }
    setHLoad(true); setHErr("");
    try {
      // Pass lat=0&lng=0 and loc= — backend will geocode correctly with disambiguation
      const r = await fetch(`${BACKEND}/hospitals/nearby?lat=0&lng=0&radius_km=10&loc=${encodeURIComponent(loc)}`);
      if (!r.ok) throw new Error(`Backend error ${r.status}. Is uvicorn running?`);
      const d = await r.json();
      if (d.lat_used && d.lng_used) {
        setCoords({ lat: d.lat_used, lng: d.lng_used });
        lastCoordsRef.current = { lat: d.lat_used, lng: d.lng_used };
      }
      setHospitals(d.hospitals || []);
      if ((d.hospitals || []).length) setTab("hospitals");
      else setHErr(`No hospitals found near "${loc}". Try adding district name.`);
    } catch (e) {
      setHErr(e.message || tx.gpsNoResult);
    }
    setHLoad(false);
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
      const rid = await fsSave({...form,analysis:d.analysis,triage_level:d.triage_level,classification:d.classification},currentUser?.uid||"");
      toast(`${tx.pcrSaved}${rid?` — ${rid.slice(0,8)}`:""}`);
      if (form.cnic) await loadHistory(form.cnic);  // reload: newest appears at top
      if (!hospitals.length) loadHospitals(form.location);
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
    y += 3;

    if (!result) {
      doc.setFontSize(10); doc.setTextColor(180,0,0);
      doc.text("No AI analysis generated yet.", ML, y);
    } else {
      const secs = [
        ["CLASSIFICATION",      [180,0,0]],
        ["TRIAGE LEVEL",        [180,0,0]],
        ["RECOMMENDED FACILITY",[80,80,180]],
        ["INSTRUCTIONS",        [0,100,180]],
        ["EQUIPMENT ADVICE",    [160,100,0]],
        ["SOAP NOTE",           [0,140,80]],
        ["PHYSICAL CONDITION",  [120,0,180]],
        ["OPTIMIZED ROUTE",     [180,60,0]],
      ];
      secs.forEach(([key, color]) => {
        const text = getSection(result, key);
        // Use ASCII ">>" instead of ◈ — jsPDF default font doesn't support Unicode symbols
        if (text && text !== "—") pdfSection(`>> ${key}`, text, color);
      });
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
  const VC  = { idle:"#3b82f6", speaking:"#f59e0b", listening:"#22c55e", done:"#10b981", error:"#ef4444" };

  const voiceLabel = () => {
    if (voice.status==="speaking")  return tx.speaking;
    if (voice.status==="listening") return tx.listening;
    if (voice.status==="done")      return tx.done;
    if (voice.status==="error")     return tx.voiceError;
    return tx.voiceQA;
  };

  // FIX 4: resolve voice error message through tx
  const voiceErrMsg = voice.errMsg==="noSR"    ? tx.voiceErr
                    : voice.errMsg==="micDenied" ? tx.micDenied
                    : voice.errMsg;

  // GPS error: if raw "gps" key → show translated panel; otherwise show raw msg
  const hospErrToShow = hErr==="gps" ? "gps" : hErr;

  return (
    <div style={{ backgroundColor:C.bg, color:C.text, minHeight:"100vh", fontFamily:'"IBM Plex Mono","Courier New",monospace', overflowX:"hidden", direction:dir }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes micPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}}
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

          {/* ── Google Translate: full language list, no feedback bar ── */}
          <GTWidget dark={dark} C={C}/>

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

                {/* FIX 3+4: voice error in translated language */}
                {voice.status==="error" && (
                  <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:"10px 14px", fontSize:11, color:"#f87171", direction:dir }}>
                    ⚠ {voiceErrMsg}
                  </div>
                )}

                {/* Voice progress bar */}
                {voice.isActive && (
                  <div style={{ background:"rgba(34,197,94,0.06)", border:`1px solid ${voice.status==="speaking"?"rgba(245,158,11,0.4)":"rgba(34,197,94,0.3)"}`, borderRadius:10, padding:"12px 14px", transition:"border-color 0.3s" }}>
                    {/* Status row */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ color:voice.status==="speaking"?"#f59e0b":"#22c55e", fontWeight:800, fontSize:11, direction:"ltr" }}>
                        {voiceLabel()} — {tx.voiceStep} {voice.stepIdx+1} {tx.voiceOf} {voice.totalSteps}
                      </div>
                      {/* Animated indicator: speaker wave when speaking, mic pulse when listening */}
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        {voice.status==="speaking"
                          ? <Volume2 size={13} style={{ color:"#f59e0b", animation:"none" }}/>
                          : <div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", animation:"micPulse 1.2s ease-in-out infinite" }}/>
                        }
                      </div>
                    </div>
                    {/* Question text — large and readable */}
                    <div style={{ fontSize:13, fontWeight:700, lineHeight:1.55, padding:"10px 12px", background:"rgba(255,255,255,0.05)", borderRadius:8, marginBottom:8, direction:lang==="ur"?"rtl":"ltr", color:"#e2e8f0" }}>
                      {voice.currentPrompt}
                    </div>
                    <div style={{ fontSize:10, opacity:0.4, marginBottom:8 }}>
                      {voice.status==="speaking" ? "🔊 Listen to the question…" : "🎤 Speak your answer now…"}
                    </div>
                    {/* Progress bar */}
                    <div style={{ display:"flex", gap:5, direction:"ltr" }}>
                      {Array.from({length:voice.totalSteps}).map((_,i)=>(
                        <div key={i} style={{ height:3, flex:1, borderRadius:2, background:i<voice.stepIdx?"#22c55e":i===voice.stepIdx?voice.status==="speaking"?"#f59e0b":"#22c55e":C.border }}/>
                      ))}
                    </div>
                  </div>
                )}

                {/* CNIC + Voice buttons */}
                <div style={{ display:"flex", gap:8 }}>
                  <button type="button" onClick={()=>setShowCNIC(true)} style={BTN("#6366f1",{flex:1})}><Camera size={13}/> {tx.scanCNIC}</button>
                  <button type="button" onClick={voice.isActive?voice.stop:voice.start} style={BTN(VC[voice.status]||"#3b82f6",{flex:1})}>
                    {voice.isActive?<><Square size={13}/>{tx.stop}</>:<><Mic size={13}/>{tx.voiceQA}</>}
                  </button>
                </div>

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
                    <label style={LB}>{tx.patientName}</label>
                    <input style={IN} placeholder={tx.namePh} value={form.name} onChange={e=>sf("name")(e.target.value)}/>
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
                    <label style={LB}>{tx.age}</label>
                    <input style={IN} placeholder={tx.agePh} type="number" value={form.age} onChange={e=>sf("age")(e.target.value)}/>
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
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, direction:"ltr" }}>
                  <div style={{ fontSize:10, fontWeight:700, opacity:0.4, letterSpacing:"2px" }}>{tx.nearbyTitle}</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>loadHospitals(form.location)} style={BTN("#3b82f6",{fontSize:11,padding:"7px 11px"})}><RefreshCw size={11}/> {tx.refreshGPS}</button>
                    <button onClick={searchByTypedLocation} style={BTN("#6366f1",{fontSize:11,padding:"7px 11px"})} title={tx.searchByLoc}><MapPin size={11}/></button>
                  </div>
                </div>
                {coords && <div style={{ fontSize:10, opacity:0.35, marginBottom:10, direction:"ltr" }}>📍 {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div>}
                <HospitalPanel
                  hospitals={hospitals} loading={hLoad}
                  error={hospErrToShow}
                  onRefresh={()=>loadHospitals(form.location)}
                  onSearchByLoc={searchByTypedLocation}
                  darkMode={dark} tx={tx}
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
                  :history.map((r,i)=>{
                    const ts2=r.createdAt?.toDate?r.createdAt.toDate():r.savedAt?new Date(r.savedAt):r.timestamp?new Date(r.timestamp):new Date();
                    return (
                      <div key={r.id} style={{ padding:14, borderRadius:12, background:C.subtle, border:`1px solid ${C.border}`, marginBottom:10 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                          <div>
                            <div style={{ fontWeight:800, fontSize:13 }}>{tx.visit}{history.length-i}</div>
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
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT — RESULTS PANEL (always LTR, medical content is English) */}
        <main style={{ padding:24, overflowY:"auto", direction:"ltr" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <span style={{ fontWeight:900, fontSize:10, letterSpacing:"3px", color:"#ef4444" }}>◈ AI PCR ANALYSIS & DISPATCH</span>
            {result && (
              <div style={{ display:"flex", gap:8 }}>
                <button style={BTN(speaking?"#ef4444":"#10b981")} onClick={()=>{
                  if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
                  const narrateLang = lang==="ur" ? "ur-PK" : lang==="ru" ? "ur-PK" : "en-US";
                  const u = new SpeechSynthesisUtterance(result.replace(/[*#•\-]/g,""));
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

          {result&&!loading&&(
            <div style={{ display:"flex", flexDirection:"column", gap:15 }}>
              {/* Triage Banner */}
              <div style={{ padding:"19px 22px", borderRadius:16, background:`${triageColor(getSection(result,"TRIAGE LEVEL"))}12`, border:`2px solid ${triageColor(getSection(result,"TRIAGE LEVEL"))}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, opacity:0.45, letterSpacing:"2px" }}>{tx.condition}</div>
                  <div style={{ fontSize:19, fontWeight:900, marginTop:4 }}>{getSection(result,"CLASSIFICATION")}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:10, fontWeight:700, opacity:0.45, letterSpacing:"2px" }}>{tx.triage}</div>
                  <div style={{ fontSize:19, fontWeight:900, color:triageColor(getSection(result,"TRIAGE LEVEL")), marginTop:4 }}>{getSection(result,"TRIAGE LEVEL")}</div>
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

              {/* Optimized Route + Hospital Contact */}
              {getSection(result,"OPTIMIZED ROUTE")!=="—" && getSection(result,"OPTIMIZED ROUTE") && (
                <div style={{padding:"14px 17px",borderRadius:13,background:"rgba(239,68,68,0.06)",border:"2px solid rgba(239,68,68,0.4)",borderLeft:"5px solid #ef4444"}}>
                  <div style={{fontSize:10,fontWeight:900,color:"#ef4444",letterSpacing:"2px",marginBottom:7}}>{tx.optimRoute}</div>
                  <div style={{fontSize:13,fontWeight:700,lineHeight:1.6,color:"#f87171"}}>🚑 {getSection(result,"OPTIMIZED ROUTE")}</div>
                  {/* Nearest hospital contact from GPS data */}
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
                        <a href={`https://www.google.com/maps/dir/?api=1&destination=${hospitals[0].lat},${hospitals[0].lng}`}
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
                {[[tx.fieldInstr,"INSTRUCTIONS","#3b82f6"],[tx.equipMeds,"EQUIPMENT ADVICE","#f59e0b"]].map(([title,key,col])=>(
                  <div key={key} style={{ padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:10, fontWeight:900, color:col, letterSpacing:"2px", marginBottom:9 }}>{title}</div>
                    <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.8, margin:0 }}>{getSection(result,key)}</pre>
                  </div>
                ))}
              </div>

              {/* SOAP Note */}
              <div style={{ padding:17, borderRadius:13, background:C.subtle, border:"1px solid rgba(34,197,94,0.3)", borderLeft:"5px solid #22c55e" }}>
                <div style={{ fontSize:10, fontWeight:900, color:"#22c55e", letterSpacing:"2px", marginBottom:9 }}>{tx.soapNote}</div>
                <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.9, margin:0 }}>{getSection(result,"SOAP NOTE")}</pre>
              </div>

              {/* Nearby Hospitals inline */}
              {hospitals.length>0&&(
                <div style={{ padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:10, fontWeight:900, color:"#ef4444", letterSpacing:"2px", marginBottom:12 }}>{tx.nearFacility}</div>
                  <HospitalPanel hospitals={hospitals.slice(0,2)} loading={false} error="" onRefresh={()=>loadHospitals(form.location)} onSearchByLoc={searchByTypedLocation} darkMode={dark} tx={tx}/>
                </div>
              )}

              {/* Physical Assessment */}
              <div style={{ padding:17, borderRadius:13, background:C.subtle, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, fontWeight:900, color:"#a855f7", letterSpacing:"2px", marginBottom:9 }}>{tx.physAssess}</div>
                <pre style={{ fontFamily:"inherit", fontSize:12, whiteSpace:"pre-wrap", lineHeight:1.8, margin:0 }}>{getSection(result,"PHYSICAL CONDITION")}</pre>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}