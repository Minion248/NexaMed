//  NexaMed v3.8 — App.tsx  (TypeScript + Tailwind CSS)
// GPS FIX: Unified searchHospitals() — works for any typed location AND device GPS
// TSX FIXES: React import added, invalid Tailwind classes removed, hook order fixed

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { jsPDF } from 'jspdf'
import {
  Ambulance, PhoneCall, Stethoscope,
  Moon, Sun, Mic, Volume2, Square, Download, Navigation,
  MapPin, CheckCircle, Camera, Upload, History, RefreshCw,
  LogOut, X,
} from 'lucide-react'
// ── Auth (self-contained, no external dependency) ────────────────────────────

interface AuthCtx {
  currentUser: { uid: string; email: string | null } | null
  signIn: (email: string, pw: string) => Promise<void>
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthCtx | null>(null)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [cu, setCu] = React.useState<AuthCtx['currentUser']>(null)
  return (
    <AuthContext.Provider value={{
      currentUser: cu,
      signIn: async (email) => setCu({ uid: btoa(email), email }),
      signOut: async () => setCu(null),
    }}>
      {children}
    </AuthContext.Provider>
  )
}
function useAuth() {
  const c = useContext(AuthContext)
  if (!c) throw new Error('useAuth must be inside AuthProvider')
  return c
}

// ── Voice hook (self-contained) ───────────────────────────────────────────────
const VOICE_QS = {
  en: [
    { field: 'name',               q: "Patient's full name?" },
    { field: 'age',                q: "Patient's age?" },
    { field: 'gender',             q: "Gender — male or female?" },
    { field: 'location',           q: 'Incident location?' },
    { field: 'description',        q: 'Chief complaint and mechanism?' },
    { field: 'heart_rate',         q: 'Heart rate in bpm?' },
    { field: 'blood_pressure',     q: 'Blood pressure?' },
    { field: 'oxygen_saturation',  q: 'SpO2 percentage?' },
    { field: 'consciousness_level',q: 'AVPU — Alert, Voice, Pain or Unresponsive?' },
  ],
  ur: [
    { field: 'name',               q: 'مریض کا پورا نام؟' },
    { field: 'age',                q: 'مریض کی عمر؟' },
    { field: 'gender',             q: 'مریض کی جنس؟' },
    { field: 'location',           q: 'واقعے کا مقام؟' },
    { field: 'description',        q: 'مرض کی تفصیل؟' },
    { field: 'heart_rate',         q: 'دل کی دھڑکن؟' },
    { field: 'blood_pressure',     q: 'بلڈ پریشر؟' },
    { field: 'oxygen_saturation',  q: 'آکسیجن؟' },
    { field: 'consciousness_level',q: 'شعوری سطح؟' },
  ],
  ru: [
    { field: 'name',               q: 'Mareez ka naam?' },
    { field: 'age',                q: 'Umar?' },
    { field: 'gender',             q: 'Jinss?' },
    { field: 'location',           q: 'Jagah?' },
    { field: 'description',        q: 'Bimari ki tafseelaat?' },
    { field: 'heart_rate',         q: 'Dil ki dhadkan?' },
    { field: 'blood_pressure',     q: 'Blood pressure?' },
    { field: 'oxygen_saturation',  q: 'Oxygen?' },
    { field: 'consciousness_level',q: 'Hosh ki satah?' },
  ],
} as const
const LANG_CODE = { en: 'en-US', ur: 'ur-PK', ru: 'ur-PK' } as const

function useVoice(
  lang: Lang,
  onField: (f: string, v: string) => void,
  onFinish: (all: Record<string, string>) => void
) {
  const [status, setStatus] = React.useState<'idle'|'speaking'|'listening'|'done'>('idle')
  const [stepIdx, setStepIdx] = React.useState(-1)
  const collected = React.useRef<Record<string, string>>({})
  const recRef    = React.useRef<any>(null)
  const prompts   = VOICE_QS[lang] ?? VOICE_QS.en

  const stop = useCallback(() => {
    try { recRef.current?.stop() } catch(_e) { /* ok */ }
    window.speechSynthesis?.cancel()
    setStatus('idle'); setStepIdx(-1); collected.current = {}
  }, [])

  const speak = useCallback((text: string, lc: string) =>
    new Promise<void>(res => {
      window.speechSynthesis?.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lc; u.onend = () => res(); u.onerror = () => res()
      window.speechSynthesis?.speak(u)
    }), [])

  const listen = useCallback((lc: string) =>
    new Promise<string>(res => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR) { res(''); return }
      const rec: any = new SR()
      recRef.current = rec
      rec.lang = lc; rec.interimResults = false; rec.maxAlternatives = 1
      const t = setTimeout(() => { try { rec.stop() } catch(_e){} res('') }, 8000)
      rec.onresult = (e: any) => { clearTimeout(t); res(e.results[0][0].transcript) }
      rec.onerror  = () => { clearTimeout(t); res('') }
      try { rec.start() } catch(_e) { res('') }
    }), [])

  const start = useCallback(async () => {
    collected.current = {}; setStatus('speaking')
    const lc = LANG_CODE[lang]
    for (let i = 0; i < prompts.length; i++) {
      setStepIdx(i); setStatus('speaking')
      await speak(prompts[i].q, lc)
      setStatus('listening')
      const ans = await listen(lc)
      if (ans) { collected.current[prompts[i].field] = ans; onField(prompts[i].field, ans) }
    }
    setStatus('done'); onFinish({ ...collected.current })
  }, [lang, prompts, speak, listen, onField, onFinish])

  useEffect(() => () => { try { recRef.current?.stop() } catch(_e){} window.speechSynthesis?.cancel() }, [])

  return { status, stepIdx, totalSteps: prompts.length, start, stop }
}

const BACKEND = 'http://127.0.0.1:8000'

type Lang = 'en' | 'ur' | 'ru'

interface PatientForm {
  name: string; cnic: string; gender: string; age: string
  location: string; description: string
  heart_rate: string; blood_pressure: string
  oxygen_saturation: string; consciousness_level: string
}
interface Hospital {
  name: string; name_ur: string; type: string; phone: string
  emergency: boolean; lat: number; lng: number
  dist_km: number; address: string; source: string
}
interface HistoryRecord {
  id: number; timestamp: string; patient_name: string; cnic: string
  gender: string; age: number; location: string; description: string
  heart_rate: number; blood_pressure: string; oxygen_saturation: number
  consciousness_level: string; ai_analysis: string
  triage_level: string; classification: string
}
interface Coords { lat: number; lng: number }

const T = {
  en: {
    dir: 'ltr',
    tabs: ['Intake','Hospitals','History','Vitals'],
    scanCNIC: 'Scan CNIC', voiceQA: 'Voice Q&A', stop: 'Stop',
    location: 'INCIDENT LOCATION', locationPh: 'Village, Tehsil, District…',
    complaint: 'CHIEF COMPLAINT', complaintPh: 'Symptoms, mechanism of injury…',
    patientName: 'PATIENT NAME', namePh: 'Full name',
    age: 'AGE', gender: 'GENDER', male: 'Male', female: 'Female',
    hr: 'HEART RATE (bpm)', bp: 'BLOOD PRESSURE', spo2: 'SpO₂ (%)',
    avpu: 'AVPU', alert: 'Alert', voice: 'Voice', pain: 'Pain', unresponsive: 'Unresponsive',
    analyze: 'Generate AI PCR & Dispatch', analyzing: 'Analyzing…',
    pcrSaved: 'PCR saved', backendErr: 'Backend error',
    noHospitals: 'No facilities found nearby.',
    searchLocation: 'Search by Location', findHospitals: 'Find Nearby Hospitals',
    refreshing: 'Searching…', nearYou: 'Nearest Medical Facilities',
    noHistory: 'No records found.',
    logout: 'Logout', login: 'Login', email: 'Email', password: 'Password',
    cnicTitle: 'CNIC Scanner', cnicSub: 'Scan Pakistani National ID',
    takePhoto: 'Take Photo', uploadImg: 'Upload Image',
    cnicHint: 'Ensure CNIC is flat, well-lit, fully visible',
    holdFrame: 'Align CNIC in frame', capture: 'Capture',
    reading: 'Reading CNIC…', extracted: 'EXTRACTED DATA',
    rescan: 'Re-scan', useData: 'Use Data', back: 'Back', tryAgain: 'Try Again',
    cnicApplied: 'CNIC data applied', voiceComplete: 'Voice intake complete',
    downloadPDF: 'Download PDF', emergency: 'EMERGENCY', navigate: 'Navigate', distKm: 'km away',
  },
  ur: {
    dir: 'rtl',
    tabs: ['مریض','اسپتال','تاریخ','اشاریے'],
    scanCNIC: 'شناختی کارڈ اسکین', voiceQA: 'آواز سوال', stop: 'روکیں',
    location: 'واقعے کا مقام', locationPh: 'گاؤں، تحصیل، ضلع…',
    complaint: 'مرض کی تفصیل', complaintPh: 'علامات، چوٹ کی وجہ…',
    patientName: 'مریض کا نام', namePh: 'پورا نام',
    age: 'عمر', gender: 'جنس', male: 'مرد', female: 'عورت',
    hr: 'دل کی دھڑکن', bp: 'بلڈ پریشر', spo2: 'آکسیجن',
    avpu: 'شعور', alert: 'ہوشیار', voice: 'آواز', pain: 'درد', unresponsive: 'بے ہوش',
    analyze: 'AI تجزیہ کریں', analyzing: 'تجزیہ…',
    pcrSaved: 'PCR محفوظ', backendErr: 'خرابی',
    noHospitals: 'کوئی سہولت نہیں ملی۔',
    searchLocation: 'مقام تلاش کریں', findHospitals: 'قریبی اسپتال تلاش کریں',
    refreshing: 'تلاش…', nearYou: 'قریبی طبی مراکز',
    noHistory: 'کوئی ریکارڈ نہیں۔',
    logout: 'لاگ آؤٹ', login: 'لاگ ان', email: 'ای میل', password: 'پاس ورڈ',
    cnicTitle: 'CNIC اسکینر', cnicSub: 'شناختی کارڈ اسکین کریں',
    takePhoto: 'تصویر لیں', uploadImg: 'تصویر اپلوڈ',
    cnicHint: 'CNIC صاف اور مکمل نظر آئے',
    holdFrame: 'CNIC فریم میں رکھیں', capture: 'تصویر',
    reading: 'پڑھ رہے ہیں…', extracted: 'معلومات',
    rescan: 'دوبارہ اسکین', useData: 'استعمال کریں', back: 'واپس', tryAgain: 'دوبارہ',
    cnicApplied: 'CNIC ڈیٹا لاگو', voiceComplete: 'آواز مکمل',
    downloadPDF: 'PDF ڈاؤنلوڈ', emergency: 'ایمرجنسی', navigate: 'راستہ', distKm: 'کلومیٹر',
  },
  ru: {
    dir: 'ltr',
    tabs: ['Mareez','Aspataal','Taareekh','Sankhay'],
    scanCNIC: 'CNIC Scan', voiceQA: 'Awaz Q&A', stop: 'Band',
    location: 'WAQIYE KI JAGAH', locationPh: 'Gaon, Tehsil, Zila…',
    complaint: 'BIMARI KI TAFSEELAAT', complaintPh: 'Alamaat, chot ki wajah…',
    patientName: 'MAREEZ KA NAAM', namePh: 'Poora naam',
    age: 'UMAR', gender: 'JINSS', male: 'Mard', female: 'Aurat',
    hr: 'DIL KI DHADKAN', bp: 'BLOOD PRESSURE', spo2: 'OXYGEN',
    avpu: 'HOSH', alert: 'Hoshyaar', voice: 'Awaaz', pain: 'Dard', unresponsive: 'Be-hosh',
    analyze: 'AI Tajziya Karen', analyzing: 'Tajziya…',
    pcrSaved: 'PCR mahfooz', backendErr: 'Kharabi',
    noHospitals: 'Koi aspataal nahi mila.',
    searchLocation: 'Maqam Dhundhen', findHospitals: 'Qareeb Aspataal Dhundhen',
    refreshing: 'Dhoondh rahe hain…', nearYou: 'Qareeb Tibbi Maraakiz',
    noHistory: 'Koi record nahi.',
    logout: 'Log out', login: 'Login', email: 'Email', password: 'Password',
    cnicTitle: 'CNIC Scanner', cnicSub: 'Shnaakhti card scan karein',
    takePhoto: 'Tasweer lein', uploadImg: 'Upload karein',
    cnicHint: 'CNIC saaf aur mukammal nazar aaye',
    holdFrame: 'CNIC frame mein rakhein', capture: 'Tasweer',
    reading: 'Padh rahe hain…', extracted: 'Maloomat',
    rescan: 'Dobara scan', useData: 'Istemal karein', back: 'Wapas', tryAgain: 'Dobara',
    cnicApplied: 'CNIC data lagoo', voiceComplete: 'Awaaz mukammal',
    downloadPDF: 'PDF Download', emergency: 'EMERGENCY', navigate: 'Raasta', distKm: 'km door',
  },
} as const

interface Tx {
  dir: string
  tabs: readonly string[]
  scanCNIC: string; voiceQA: string; stop: string
  location: string; locationPh: string
  complaint: string; complaintPh: string
  patientName: string; namePh: string
  age: string; gender: string; male: string; female: string
  hr: string; bp: string; spo2: string
  avpu: string; alert: string; voice: string; pain: string; unresponsive: string
  analyze: string; analyzing: string
  pcrSaved: string; backendErr: string
  noHospitals: string; searchLocation: string; findHospitals: string
  refreshing: string; nearYou: string; noHistory: string
  logout: string; login: string; email: string; password: string
  cnicTitle: string; cnicSub: string
  takePhoto: string; uploadImg: string; cnicHint: string
  holdFrame: string; capture: string
  reading: string; extracted: string
  rescan: string; useData: string; back: string; tryAgain: string
  cnicApplied: string; voiceComplete: string
  downloadPDF: string; emergency: string; navigate: string; distKm: string
}

function ascii(s: string): string {
  return (s || '').replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim()
}

// ═══════════════════════════════════════════════════════════════════════════════
type ToastType = 'ok' | 'error'

export default function App() {
  const { currentUser, signIn, signOut } = useAuth()
  const [dark,  setDark]  = useState(true)
  const [lang,  setLang]  = useState<Lang>('en')
  const [tab,   setTab]   = useState(0)

  const [form, setForm] = useState<PatientForm>({
    name:'', cnic:'', gender:'Male', age:'',
    location:'', description:'',
    heart_rate:'', blood_pressure:'', oxygen_saturation:'',
    consciousness_level:'Alert',
  })
  const setF = (k: keyof PatientForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<string | null>(null)
  const [hospitals,  setHospitals]  = useState<Hospital[]>([])
  const [hLoad,      setHLoad]      = useState(false)
  const [hErr,       setHErr]       = useState('')
  const [hStatus,    setHStatus]    = useState('')
  const [history,    setHistory]    = useState<HistoryRecord[]>([])
  const [coords,     setCoords]     = useState<Coords | null>(null)
  const [toastMsg,   setToastMsg]   = useState<string | null>(null)
  const [toastType,  setToastType]  = useState<ToastType>('ok')
  const [showCNIC,   setShowCNIC]   = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPw,    setLoginPw]    = useState('')

  // Refs — declared before functions that use them (avoids TS no-use-before-define)
  const lastCoordsRef = useRef<Coords | null>(null)
  const formLocRef    = useRef('')   // always holds latest form.location

  const tx = T[lang] as Tx   // cast: T is as const so union can't auto-widen to Tx

  const toast = useCallback((msg: string, type: ToastType = 'ok') => {
    setToastMsg(msg); setToastType(type)
    setTimeout(() => setToastMsg(null), 4000)
  }, [])

  // Keep ref synced with form.location
  useEffect(() => { formLocRef.current = form.location }, [form.location])

  // Health check
  useEffect(() => {
    fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(d => { if (!d.ai_ready) toast('Backend online but GROQ_API_KEY missing', 'error') })
      .catch(() => toast('Backend offline — run: uvicorn main:app --reload', 'error'))
  }, []) // eslint-disable-line

  // Auto-search when switching to hospitals tab
  useEffect(() => {
    if (tab === 1 && !hLoad) searchHospitals(formLocRef.current || undefined)
  }, [tab]) // eslint-disable-line

  // ── searchHospitals: ONE function — typed location OR live GPS ──────────────
  async function searchHospitals(locText?: string) {
    setHLoad(true); setHErr(''); setHospitals([])
    const loc = (locText ?? '').trim()

    // PATH A: typed text → backend geocodes via district table ─────────────────
    if (loc) {
      try {
        const r = await fetch(
          `${BACKEND}/hospitals/nearby?lat=0&lng=0&radius_km=50&loc=${encodeURIComponent(loc)}`
        )
        if (!r.ok) throw new Error(`HTTP ${r.status} — is uvicorn running?`)
        const d = await r.json()
        if (d.lat_used && Math.abs(d.lat_used) > 0.1) {
          const c = { lat: d.lat_used, lng: d.lng_used }
          setCoords(c); lastCoordsRef.current = c
        }
        setHospitals(d.hospitals ?? [])
        if (!(d.hospitals ?? []).length)
          setHErr((d.message ?? `No facilities found near "${loc}".`) +
            '')
      } catch (e: any) {
        setHErr(`Search failed: ${e.message ?? 'unknown'}. Is uvicorn running?`)
      }
      setHLoad(false)
      return
    }

    // PATH B: no text → GPS → cached → IP ─────────────────────────────────────
    let gpsCoords: Coords | null = null

    // Step 1: Browser GPS — callback style, resolves null on denial/timeout
    setHStatus('📡 Getting GPS location…')
    if (navigator.geolocation) {
      gpsCoords = await new Promise<Coords | null>(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          _err => resolve(null),
          { timeout: 15000, enableHighAccuracy: true, maximumAge: 60000 }
        )
      })
      if (gpsCoords) lastCoordsRef.current = gpsCoords
    }

    // Step 2: Cached from previous search
    if (!gpsCoords && lastCoordsRef.current) {
      gpsCoords = lastCoordsRef.current
      setHStatus('📡 Using last known location…')
    }

    // Step 3: IP geolocation
    if (!gpsCoords) {
      setHStatus('🌐 Getting location via IP…')
      try {
        const r = await fetch(`${BACKEND}/ipgeo`)
        const d = await r.json()
        if (d.found && d.lat && d.lng) {
          gpsCoords = { lat: d.lat, lng: d.lng }
          lastCoordsRef.current = gpsCoords
        }
      } catch (_e) { /* network error */ }
    }

    setHStatus('')
    if (!gpsCoords) {
      setHErr('no_location'); setHLoad(false); return
    }

    // Got coords — update map and search
    setHStatus('🔍 Searching nearby hospitals…')
    setCoords(gpsCoords)
    try {
      const r = await fetch(
        `${BACKEND}/hospitals/nearby?lat=${gpsCoords.lat}&lng=${gpsCoords.lng}&radius_km=50`
      )
      if (!r.ok) throw new Error(`HTTP ${r.status} — is uvicorn running?`)
      const d = await r.json()
      if (d.lat_used && Math.abs(d.lat_used) > 0.1) {
        const c = { lat: d.lat_used, lng: d.lng_used }
        setCoords(c); lastCoordsRef.current = c
      }
      setHospitals(d.hospitals ?? [])
      if (!(d.hospitals ?? []).length)
        setHErr('No hospitals found near your GPS location. Type the incident location in the Intake tab.')
    } catch (e: any) {
      setHErr(`Search failed: ${e.message ?? 'unknown'}. Is uvicorn running?`)
    }
    setHStatus('')
    setHLoad(false)
  }

  function searchByLocation() { searchHospitals(form.location.trim() || undefined) }

  async function loadHistory(cnic?: string) {
    if (!cnic) return
    try {
      const r = await fetch(`${BACKEND}/history?cnic=${encodeURIComponent(cnic)}&limit=30`)
      setHistory(await r.json())
    } catch { /* ignore */ }
  }

  const voice = useVoice(
    lang,
    (field, val) => setF(field as keyof PatientForm, val),
    (all) => { setForm(p => ({ ...p, ...all })); toast(tx.voiceComplete) }
  )

  function applyCNIC(d: any) {
    if (d.name)   setF('name',   d.name)
    if (d.cnic)   setF('cnic',   d.cnic)
    if (d.age)    setF('age',    String(d.age))
    if (d.gender) setF('gender', d.gender)
    toast(`${tx.cnicApplied}: ${d.name ?? 'Patient'}`)
    if (d.cnic) loadHistory(d.cnic)
  }

  async function handleSubmit() {
    if (!form.description.trim()) { toast('Please describe the emergency', 'error'); return }
    setLoading(true); setResult(null)
    const langCode = lang === 'ur' ? 'ur-PK' : lang === 'ru' ? 'ru-PK' : 'en-US'
    try {
      const r = await fetch(`${BACKEND}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, language: langCode, lat: 0, lng: 0,
          age: parseInt(form.age) || 0,
          heart_rate: parseInt(form.heart_rate) || 0,
          oxygen_saturation: parseInt(form.oxygen_saturation) || 0,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error((err as any).detail ?? `HTTP ${r.status}`)
      }
      const d = await r.json()
      setResult(d.analysis); toast(tx.pcrSaved)
      if (form.cnic) loadHistory(form.cnic)
      if (!hospitals.length) searchHospitals(form.location || undefined)
    } catch (e: any) {
      const msg = e.message ?? 'Unknown error'
      toast(
        msg.includes('503') || msg.toLowerCase().includes('unavailable')
          ? 'AI unavailable — open http://127.0.0.1:8000/debug. Likely: Windows Firewall blocking Python → api.groq.com'
          : `${tx.backendErr}: ${msg}`,
        'error'
      )
    }
    setLoading(false)
  }

  function downloadPDF() {
    const doc = new jsPDF(); let y = 10
    doc.setFontSize(14); doc.setFont('helvetica','bold')
    doc.text(' NexaMed — PATIENT CARE REPORT', 10, y); y += 8
    doc.setFontSize(9); doc.setFont('helvetica','normal')
    const fields: [string,string][] = [
      ['Patient',form.name],['CNIC',form.cnic],['Age',form.age],
      ['Gender',form.gender],['Location',form.location],['Chief Complaint',form.description],
      ['HR',form.heart_rate],['BP',form.blood_pressure],
      ['SpO2',form.oxygen_saturation],['AVPU',form.consciousness_level],
    ]
    for (const [k,v] of fields) {
      if (!v) continue
      doc.setFont('helvetica','bold'); doc.text(`${k}:`,10,y)
      doc.setFont('helvetica','normal'); doc.text(ascii(v),45,y); y+=6
    }
    if (result) {
      y+=4; doc.setFont('helvetica','bold'); doc.text('AI ANALYSIS:',10,y); y+=6
      doc.setFont('helvetica','normal')
      for (const line of result.split('\n')) {
        for (const l of doc.splitTextToSize(ascii(line),185)) {
          if (y>280) { doc.addPage(); y=12 }
          doc.text(l,10,y); y+=5
        }
      }
    }
    doc.save(`PCR_${ascii(form.name||'patient')}_${Date.now()}.pdf`)
  }

  function triageColour(text: string) {
    const t = text.toLowerCase()
    if (t.includes('red'))    return 'border-l-4 border-red-500 bg-red-950/30'
    if (t.includes('yellow')) return 'border-l-4 border-yellow-500 bg-yellow-950/30'
    if (t.includes('green'))  return 'border-l-4 border-green-500 bg-green-950/30'
    if (t.includes('black'))  return 'border-l-4 border-slate-400 bg-slate-900/60'
    return 'border-l-4 border-blue-500 bg-blue-950/30'
  }

  // ── Login ─────────────────────────────────────────────────────────────────────
  if (!currentUser) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${dark?'bg-slate-950':'bg-slate-100'}`}>
        <div className={`w-full max-w-sm rounded-2xl p-8 shadow-2xl ${dark?'bg-slate-900 border border-slate-800':'bg-white border border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
              <Ambulance size={20} className="text-white"/>
            </div>
            <div>
              <div className="font-black text-lg tracking-tight"> NexaMed</div>
              <div className="text-xs opacity-40 font-semibold tracking-widest">EMT DISPATCH</div>
            </div>
          </div>
          <div className="space-y-4">
            <input className="w-full rounded-xl px-4 py-3 text-sm bg-slate-800 border border-slate-700 focus:outline-none focus:border-blue-500 placeholder:opacity-40"
              placeholder={tx.email} type="email" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}/>
            <input className="w-full rounded-xl px-4 py-3 text-sm bg-slate-800 border border-slate-700 focus:outline-none focus:border-blue-500 placeholder:opacity-40"
              placeholder={tx.password} type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)}/>
            <button onClick={()=>signIn(loginEmail,loginPw).catch(()=>toast('Login failed','error'))}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl py-3 transition-colors">
              {tx.login}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const bgPage  = dark?'bg-slate-950 text-slate-100':'bg-slate-50 text-slate-900'
  const bgCard  = dark?'bg-slate-900 border-slate-800':'bg-white border-slate-200'
  const bgInput = dark?'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500':'bg-slate-100 border-slate-300 text-slate-900'
  const dir     = tx.dir

  return (
    <div className={`min-h-screen ${bgPage}`} dir={dir}>
      {toastMsg&&(
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl max-w-sm text-center
          ${toastType==='error'?'bg-red-600 text-white':'bg-green-600 text-white'}`}>
          {toastMsg}
        </div>
      )}
      {showCNIC&&<CNICModal onClose={()=>setShowCNIC(false)} onSuccess={applyCNIC} dark={dark} tx={tx}/>}

      <header className={`sticky top-0 z-30 border-b ${dark?'bg-slate-950/90 border-slate-800':'bg-white/90 border-slate-200'} backdrop-blur-md`}>
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <Ambulance size={16} className="text-white"/>
            </div>
            <span className="font-black text-sm tracking-tight"> NexaMed</span>
            <span className="text-xs opacity-30 font-semibold tracking-widest hidden sm:inline">v3.8</span>
          </div>
          <div className="flex items-center gap-2">
            {(['en','ur','ru'] as Lang[]).map(l=>(
              <button key={l} onClick={()=>setLang(l)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${lang===l?'bg-blue-600 text-white':'opacity-40 hover:opacity-70'}`}>
                {l==='en'?'EN':l==='ur'?'اردو':'RM'}
              </button>
            ))}
            <button onClick={()=>setDark(!dark)} className="p-2 rounded-lg opacity-50 hover:opacity-100 transition-opacity">
              {dark?<Sun size={16}/>:<Moon size={16}/>}
            </button>
            <button onClick={signOut} className="p-2 rounded-lg opacity-50 hover:opacity-100 transition-opacity">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </header>

      <div className={`border-b ${dark?'border-slate-800':'border-slate-200'}`}>
        <div className="max-w-2xl mx-auto px-4 flex">
          {tx.tabs.map((label,i)=>(
            <button key={i} onClick={()=>setTab(i)}
              className={`px-4 py-3 text-xs font-bold tracking-wider transition-colors border-b-2
                ${tab===i?'border-red-500 text-red-500':'border-transparent opacity-40 hover:opacity-70'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* TAB 0: INTAKE */}
        {tab===0&&(
          <>
            <div className="flex gap-2">
              <button onClick={()=>setShowCNIC(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl py-3 transition-colors">
                <Camera size={14}/> {tx.scanCNIC}
              </button>
              {(voice.status==='idle'||voice.status==='done')?(
                <button onClick={voice.start}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl py-3 transition-colors">
                  <Mic size={14}/> {tx.voiceQA}
                </button>
              ):(
                <button onClick={voice.stop}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl py-3 transition-colors animate-pulse">
                  <Square size={14}/> {tx.stop}
                  {(voice.status==='speaking'||voice.status==='listening')&&<span className="text-xs opacity-70">{voice.stepIdx+1}/{voice.totalSteps}</span>}
                </button>
              )}
            </div>

            {voice.status!=='idle'&&voice.status!=='done'&&(
              <div className={`rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2
                ${dark?'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50':'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                {voice.status==='speaking'?<Volume2 size={14} className="animate-pulse"/>:<Mic size={14} className="animate-pulse"/>}
                {voice.status==='speaking'?'Speaking…':'Listening…'}
              </div>
            )}

            <div className={`rounded-2xl border p-5 space-y-4 ${bgCard}`}>
              <Label dark={dark}>📋 PATIENT INFO</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FieldLabel dark={dark}>{tx.patientName}</FieldLabel>
                  <input className={`w-full rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                    placeholder={tx.namePh} value={form.name} onChange={e=>setF('name',e.target.value)}/>
                </div>
                <div>
                  <FieldLabel dark={dark}>{tx.age}</FieldLabel>
                  <input type="number" className={`w-full rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                    placeholder="0" value={form.age} onChange={e=>setF('age',e.target.value)}/>
                </div>
                <div>
                  <FieldLabel dark={dark}>{tx.gender}</FieldLabel>
                  <select className={`w-full rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                    value={form.gender} onChange={e=>setF('gender',e.target.value)}>
                    <option value="Male">{tx.male}</option>
                    <option value="Female">{tx.female}</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <FieldLabel dark={dark}>CNIC</FieldLabel>
                  <input className={`w-full rounded-xl px-3 py-2 text-sm border font-mono ${bgInput} focus:outline-none focus:border-blue-500`}
                    placeholder="XXXXX-XXXXXXX-X" value={form.cnic} onChange={e=>setF('cnic',e.target.value)}/>
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border p-5 space-y-4 ${bgCard}`}>
              <Label dark={dark}>📍 {tx.location}</Label>
              <div className="flex gap-2">
                <input className={`flex-1 rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                  placeholder={tx.locationPh} value={form.location} onChange={e=>setF('location',e.target.value)} dir="ltr"/>
                <button onClick={searchByLocation} title={tx.searchLocation}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors">
                  <MapPin size={14}/>
                </button>
              </div>
              <textarea className={`w-full rounded-xl px-3 py-2 text-sm border min-h-20 resize-none ${bgInput} focus:outline-none focus:border-blue-500`}
                placeholder={tx.complaintPh} value={form.description} onChange={e=>setF('description',e.target.value)}/>
            </div>

            <div className={`rounded-2xl border p-5 space-y-4 ${bgCard}`}>
              <Label dark={dark}>❤️ VITALS</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  [tx.hr,'heart_rate','number','72'],
                  [tx.bp,'blood_pressure','text','120/80'],
                  [tx.spo2,'oxygen_saturation','number','98'],
                ] as [string,keyof PatientForm,string,string][]).map(([label,key,type,ph])=>(
                  <div key={key}>
                    <FieldLabel dark={dark}>{label}</FieldLabel>
                    <input type={type} className={`w-full rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                      placeholder={ph} value={form[key]} onChange={e=>setF(key,e.target.value)} dir="ltr"/>
                  </div>
                ))}
                <div>
                  <FieldLabel dark={dark}>{tx.avpu}</FieldLabel>
                  <select className={`w-full rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                    value={form.consciousness_level} onChange={e=>setF('consciousness_level',e.target.value)}>
                    {[tx.alert,tx.voice,tx.pain,tx.unresponsive].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={loading}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-sm rounded-2xl py-4 transition-colors flex items-center justify-center gap-2">
              {loading?(
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>{tx.analyzing}</>
              ):(
                <><Stethoscope size={16}/>{tx.analyze}</>
              )}
            </button>

            {result&&(
              <div className="space-y-3">
                {/* AI PCR Analysis card */}
                <div className={`rounded-2xl border p-5 ${triageColour(result)}`}>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black tracking-widest opacity-60">AI PCR ANALYSIS</span>
                    <button onClick={downloadPDF}
                      className="flex items-center gap-1 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition-colors">
                      <Download size={12}/> {tx.downloadPDF}
                    </button>
                  </div>
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap font-sans">{result}</pre>
                </div>

                {/* GPS Navigate to Hospitals — always shown after PCR */}
                <div className={`rounded-2xl border p-4 ${dark?'bg-red-950/20 border-red-900/50':'bg-red-50 border-red-200'}`}>
                  <div className="text-xs font-black tracking-widest text-red-500 mb-3">◈ NEAREST FACILITIES (GPS)</div>
                  {hospitals.length>0?(
                    <div className="space-y-2">
                      {hospitals.slice(0,3).map((h,i)=>(
                        <div key={i} className={`rounded-xl p-3 flex items-center justify-between gap-3 ${dark?'bg-slate-800/60':'bg-white'} border ${dark?'border-slate-700':'border-slate-200'}`}>
                          <div className="flex-1 min-w-0">
                            {i===0&&<span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold mr-2">NEAREST</span>}
                            <div className="font-bold text-sm truncate mt-0.5">{h.name}</div>
                            <div className="text-xs opacity-40 mt-0.5">{h.dist_km} {tx.distKm}{h.address?` · ${h.address}`:''}</div>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <a href={`https://maps.google.com/?q=${h.lat},${h.lng}&navigate=yes`}
                              target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors">
                              <Navigation size={11}/> Navigate
                            </a>
                            {h.phone&&h.phone!=='N/A'&&(
                              <a href={`tel:${h.phone}`}
                                className="flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors px-1">
                                <PhoneCall size={11}/> {h.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                      <button onClick={()=>setTab(1)}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl py-2.5 transition-colors mt-1">
                        <MapPin size={12}/> View All on Map →
                      </button>
                    </div>
                  ):(
                    <div className="space-y-2">
                      <div className="text-xs opacity-60 mb-2">No hospitals loaded yet.</div>
                      <button onClick={()=>{ searchHospitals(form.location||undefined); setTab(1); }}
                        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl py-3 transition-colors">
                        <MapPin size={13}/> Find Nearby Hospitals
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 1: HOSPITALS */}
        {tab===1&&(
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={()=>searchHospitals(form.location||undefined)} disabled={hLoad}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl py-3 transition-colors">
                {hLoad?<><RefreshCw size={14} className="animate-spin"/> {hStatus||tx.refreshing}</>:<><MapPin size={14}/> {tx.findHospitals}</>}
              </button>
              {form.location.trim()&&(
                <button onClick={searchByLocation} disabled={hLoad}
                  className="flex items-center gap-1 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors">
                  <Navigation size={14}/> {tx.searchLocation}
                </button>
              )}
            </div>



            {hErr&&!hLoad&&(
              <div className="space-y-2">
                {hErr==='no_location'?(
                  <div className={`rounded-xl p-4 space-y-3 ${dark?'bg-indigo-950/40 border border-indigo-800/50':'bg-indigo-50 border border-indigo-200'}`}>
                    <div className="text-sm font-bold text-indigo-400">📍 How to find nearby hospitals</div>
                    <div className="text-xs opacity-70 leading-relaxed">
                      Allow location access and tap <strong>Find Nearby Hospitals</strong>, or type the incident location in the Intake tab and tap 📍.
                    </div>
                    <button onClick={()=>searchHospitals(form.location||undefined)}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl py-3 transition-colors">
                      <RefreshCw size={13}/> Try Again
                    </button>
                  </div>
                ):(
                  <>
                    <div className={`rounded-xl px-4 py-3 text-xs ${dark?'bg-red-950/40 border border-red-800/50 text-red-400':'bg-red-50 border border-red-200 text-red-700'}`}>
                      {hErr}
                    </div>
                    <button onClick={()=>searchHospitals(form.location||undefined)}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl py-2 transition-colors">
                      <RefreshCw size={13}/> Retry
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Live map — shows incident location + all hospitals */}
            {(coords || hospitals.length>0)&&(
              <HospitalsMap userCoords={coords} hospitals={hospitals} dark={dark}/>
            )}

            {hospitals.length>0&&(
              <div className="space-y-3">
                <Label dark={dark}>{tx.nearYou} ({hospitals.length})</Label>
                {hospitals.map((h,i)=>(
                  <HospitalCard key={i} h={h} dark={dark} tx={tx} nearest={i===0}/>
                ))}
              </div>
            )}

            {!hLoad&&!hErr&&hospitals.length===0&&(
              <div className="text-center py-14 opacity-30 text-sm">
                Tap <strong>{tx.findHospitals}</strong> to search
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HISTORY */}
        {tab===2&&(
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className={`flex-1 rounded-xl px-3 py-2 text-sm border ${bgInput} focus:outline-none focus:border-blue-500`}
                placeholder="Search by CNIC…" dir="ltr"
                onKeyDown={e=>{if(e.key==='Enter')loadHistory((e.target as HTMLInputElement).value)}}/>
              <button onClick={()=>loadHistory(form.cnic)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-colors">
                <History size={14}/>
              </button>
            </div>
            {history.length===0&&<div className="text-center py-12 opacity-30 text-sm">{tx.noHistory}</div>}
            {history.map(r=>(
              <div key={r.id} className={`rounded-2xl border p-4 space-y-2 ${bgCard}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-sm">{r.patient_name||'—'}</div>
                    <div className="text-xs opacity-40">{r.timestamp?.slice(0,16).replace('T',' ')}</div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg
                    ${r.triage_level?.toLowerCase().includes('red')?'bg-red-900/60 text-red-400':
                      r.triage_level?.toLowerCase().includes('yellow')?'bg-yellow-900/60 text-yellow-400':
                      'bg-green-900/60 text-green-400'}`}>
                    {r.triage_level||'—'}
                  </span>
                </div>
                <div className="text-xs opacity-60">{r.location} · {r.description?.slice(0,80)}</div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: VITALS */}
        {tab===3&&(
          <div className={`rounded-2xl border p-5 ${bgCard}`}>
            <Label dark={dark}>📈 VITALS TREND</Label>
            {history.length<2?(
              <div className="text-center py-12 opacity-30 text-sm">Need 2+ records for chart</div>
            ):(
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history.slice().reverse().map(r=>({
                    date:r.timestamp?.slice(5,10)??'',
                    HR:r.heart_rate||null,SpO2:r.oxygen_saturation||null,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dark?'#1e3a5f':'#e2e8f0'}/>
                    <XAxis dataKey="date" tick={{fontSize:10}}/>
                    <YAxis tick={{fontSize:10}}/>
                    <Tooltip/><Legend/>
                    <Line type="monotone" dataKey="HR" stroke="#ef4444" dot={false}/>
                    <Line type="monotone" dataKey="SpO2" stroke="#3b82f6" dot={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Label({children,dark}:{children:React.ReactNode;dark:boolean}){
  return <div className={`text-xs font-black tracking-widest ${dark?'text-slate-400':'text-slate-500'}`}>{children}</div>
}
function FieldLabel({children,dark}:{children:React.ReactNode;dark:boolean}){
  return <div className={`text-xs font-semibold mb-1 tracking-wider ${dark?'text-slate-500':'text-slate-400'}`}>{children}</div>
}

// ═══════════════════════════════════════════════════════════════════════════════
// HospitalsMap — full Leaflet map showing incident location + all hospitals
// ═══════════════════════════════════════════════════════════════════════════════
async function loadLeaflet(): Promise<any> {
  if ((window as any).L) return (window as any).L
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link')
    link.id = 'leaflet-css'; link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
  }
  await new Promise<void>(res => {
    if (document.getElementById('leaflet-js')) { res(); return }
    const s = document.createElement('script')
    s.id = 'leaflet-js'
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => res()
    document.head.appendChild(s)
  })
  return (window as any).L
}

function HospitalsMap({ userCoords, hospitals, dark }: {
  userCoords: Coords | null
  hospitals: Hospital[]
  dark: boolean
}) {
  const cid   = React.useRef(`hmap-${Math.random().toString(36).slice(2)}`)
  const mapRef = React.useRef<any>(null)

  React.useEffect(() => {
    const center = userCoords ??
      (hospitals.length > 0 ? { lat: hospitals[0].lat, lng: hospitals[0].lng } : null)
    if (!center) return

    let destroyed = false

    loadLeaflet().then((L: any) => {
      if (destroyed) return
      const el = document.getElementById(cid.current)
      if (!el) return

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

      const map = L.map(el, { zoomControl: true, scrollWheelZoom: false })
                   .setView([center.lat, center.lng], 13)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)

      if (userCoords) {
        const icon = L.divIcon({
          html: '<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.4)"></div>',
          iconSize: [14,14], iconAnchor: [7,7], className: '',
        })
        L.marker([userCoords.lat, userCoords.lng], { icon })
          .addTo(map).bindPopup('<b>📍 Incident Location</b>').openPopup()
      }

      hospitals.forEach((h, i) => {
        if (!h.lat || !h.lng) return
        const color = i === 0 ? '#ef4444' : '#f97316'
        const icon = L.divIcon({
          html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
          iconSize: [12,12], iconAnchor: [6,6], className: '',
        })
        L.marker([h.lat, h.lng], { icon }).addTo(map)
          .bindPopup(`<b>${h.name}</b><br/>${h.dist_km} km away${h.address ? '<br/>' + h.address : ''}`)
      })

      const pts = [
        ...(userCoords ? [[userCoords.lat, userCoords.lng]] : []),
        ...hospitals.filter(h=>h.lat&&h.lng).map(h=>[h.lat,h.lng]),
      ]
      if (pts.length > 1) {
        try { map.fitBounds(pts, { padding: [30,30], maxZoom: 15 }) } catch { /* ok */ }
      }

      mapRef.current = map
    }).catch(console.error)

    return () => {
      destroyed = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [userCoords?.lat, userCoords?.lng, hospitals.length]) // eslint-disable-line

  return (
    <div className={`rounded-xl overflow-hidden mb-3 border ${dark?'border-indigo-900/50':'border-slate-200'}`}>
      <div id={cid.current} style={{ width:'100%', height:240, background: dark?'#0d1b2e':'#e2e8f0' }}/>
    </div>
  )
}

function HospitalCard({h,dark,tx,nearest}:{h:Hospital;dark:boolean;tx:Tx;nearest?:boolean}){
  const bg=dark?'bg-slate-900 border-slate-800':'bg-white border-slate-200'
  return (
    <div className={`rounded-2xl border p-4 ${bg} ${nearest?'border-red-500/60':''}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          {nearest&&<span className="inline-block text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-bold mb-1 mr-2">NEAREST</span>}
          <div className="font-bold text-sm truncate">{h.name}</div>
          {h.name_ur&&<div className="text-xs opacity-50 font-medium" dir="rtl">{h.name_ur}</div>}
          {h.address&&<div className="text-xs opacity-40 mt-0.5 truncate">{h.address}</div>}
        </div>
        <div className="text-right ml-3 shrink-0">
          <div className="text-blue-400 font-black text-sm">{h.dist_km} {tx.distKm}</div>
          {h.emergency&&<span className="text-xs bg-red-900/60 text-red-400 px-2 py-0.5 rounded-full font-bold block mt-1">{tx.emergency}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        {h.phone&&h.phone!=='N/A'&&(
          <a href={`tel:${h.phone}`} className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
            <PhoneCall size={12}/> {h.phone}
          </a>
        )}
        <a href={`https://maps.google.com/?q=${h.lat},${h.lng}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors ml-auto">
          <Navigation size={12}/> {tx.navigate}
        </a>
      </div>
    </div>
  )
}

function CNICModal({onClose,onSuccess,dark,tx}:{onClose:()=>void;onSuccess:(d:any)=>void;dark:boolean;tx:Tx}){
  const [mode,setMode]=useState<'choose'|'camera'|'processing'|'done'|'error'>('choose')
  const [prev,setPrev]=useState<string|null>(null)
  const [result,setResult]=useState<any>(null)
  const [err,setErr]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)
  const vidRef=useRef<HTMLVideoElement>(null)
  const streamRef=useRef<MediaStream|null>(null)
  const stopCam=useCallback(()=>{streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null},[])
  useEffect(()=>()=>stopCam(),[stopCam])

  async function processFile(file:File){
    setMode('processing');setPrev(URL.createObjectURL(file))
    try{
      const b64=await new Promise<string>((res,rej)=>{
        const r=new FileReader();r.onerror=()=>rej(new Error('Read failed'))
        r.onload=e=>res((e.target!.result as string).split(',')[1]);r.readAsDataURL(file)
      })
      const resp=await fetch(`${BACKEND}/cnic/scan`,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image_base64:b64,media_type:file.type||'image/jpeg'}),signal:AbortSignal.timeout(35000)})
      if(!resp.ok){const e=await resp.json().catch(()=>({}));throw new Error((e as any).detail??`Error ${resp.status}`)}
      const j=await resp.json();if(!j.data)throw new Error('No data returned')
      setResult(j.data);setMode('done')
    }catch(e:any){setErr(e.message??'Scan failed');setMode('error')}
  }

  async function openCam(){
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
      streamRef.current=s;setMode('camera')
      setTimeout(()=>{if(vidRef.current){vidRef.current.srcObject=s;vidRef.current.play()}},80)
    }catch{setErr('Camera denied. Use Upload.');setMode('error')}
  }

  function capture(){
    const v=vidRef.current;if(!v)return
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight
    c.getContext('2d')!.drawImage(v,0,0)
    c.toBlob(b=>{stopCam();processFile(new File([b!],'cnic.jpg',{type:'image/jpeg'}))},'image/jpeg',0.93)
  }

  const bg=dark?'bg-slate-900 border-slate-800':'bg-white border-slate-200'
  const inp=dark?'bg-slate-800 border-slate-700':'bg-slate-100 border-slate-300'

  return(
    <div onClick={e=>{if(e.target===e.currentTarget){stopCam();onClose()}}}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className={`w-full max-w-sm rounded-2xl p-6 border shadow-2xl relative ${bg}`}>
        <button onClick={()=>{stopCam();onClose()}} className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity"><X size={18}/></button>
        <div className="font-black text-base mb-1">📇 {tx.cnicTitle}</div>
        <div className="text-xs opacity-40 mb-5">{tx.cnicSub}</div>

        {mode==='choose'&&(
          <div className="space-y-3">
            <BtnBlock color="bg-indigo-600 hover:bg-indigo-500" onClick={openCam}><Camera size={16}/> {tx.takePhoto}</BtnBlock>
            <BtnBlock color="bg-blue-600 hover:bg-blue-500" onClick={()=>fileRef.current?.click()}><Upload size={16}/> {tx.uploadImg}</BtnBlock>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e=>e.target.files?.[0]&&processFile(e.target.files[0])}/>
            <p className="text-xs opacity-30 text-center">{tx.cnicHint}</p>
          </div>
        )}
        {mode==='camera'&&(
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden border-2 border-indigo-500 relative">
              <video ref={vidRef} playsInline className="w-full block max-h-60 object-cover"/>
              <div className="absolute inset-2 border-2 border-dashed border-indigo-400/70 rounded-lg flex items-center justify-center pointer-events-none">
                <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-lg">{tx.holdFrame}</span>
              </div>
            </div>
            <BtnBlock color="bg-emerald-600 hover:bg-emerald-500" onClick={capture}><Camera size={16}/> {tx.capture}</BtnBlock>
            <button onClick={()=>{stopCam();setMode('choose')}} className={`w-full py-2 rounded-xl text-sm font-semibold border ${inp} transition-colors`}>{tx.back}</button>
          </div>
        )}
        {mode==='processing'&&(
          <div className="text-center py-6">
            {prev&&<img src={prev} alt="" className="w-full rounded-xl mb-4 max-h-40 object-cover"/>}
            <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
            <p className="text-sm opacity-60">{tx.reading}</p>
          </div>
        )}
        {mode==='done'&&result&&(
          <div className="space-y-3">
            {prev&&<img src={prev} alt="" className="w-full rounded-xl max-h-36 object-cover opacity-80"/>}
            <div className="rounded-xl p-4 border border-emerald-800/50 bg-emerald-950/20 space-y-2">
              <div className="text-xs text-emerald-400 font-black tracking-widest mb-2">{tx.extracted}</div>
              {[['Name',result.name],['CNIC',result.cnic],['Age',result.age],['Gender',result.gender],['DOB',result.dob]]
                .filter(([,v])=>v!=null&&v!=='')
                .map(([k,v])=>(
                  <div key={String(k)} className="flex justify-between text-xs gap-2">
                    <span className="opacity-40">{k}</span><span className="font-bold text-right">{String(v)}</span>
                  </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setMode('choose');setPrev(null);setResult(null)}}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-slate-700 hover:bg-slate-600 text-white transition-colors">{tx.rescan}</button>
              <button onClick={()=>{onSuccess(result);onClose()}}
                className="flex-1 py-2 rounded-xl text-sm font-black bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center gap-2">
                <CheckCircle size={14}/> {tx.useData}
              </button>
            </div>
          </div>
        )}
        {mode==='error'&&(
          <div className="space-y-3">
            <div className="rounded-xl p-4 border border-red-800/50 bg-red-950/20 text-red-400 text-xs leading-relaxed">
              ⚠ {err}
              {err.toLowerCase().includes('connection')&&(
                <div className="mt-3 p-3 bg-black/30 rounded-lg text-yellow-400">
                  <strong>🔧 Fix:</strong> Windows Firewall is blocking Python.<br/>
                  1. Open Windows Security → Firewall → Allow an app<br/>
                  2. Add python.exe (Private + Public)<br/>
                  3. Or check: http://127.0.0.1:8000/debug
                </div>
              )}
            </div>
            <BtnBlock color="bg-indigo-600 hover:bg-indigo-500" onClick={()=>{setErr('');setMode('choose')}}>{tx.tryAgain}</BtnBlock>
          </div>
        )}
      </div>
    </div>
  )
}

function BtnBlock({color,onClick,children}:{color:string;onClick:()=>void;children:React.ReactNode}){
  return(
    <button onClick={onClick} className={`w-full flex items-center justify-center gap-2 ${color} text-white text-sm font-bold rounded-xl py-3 transition-colors`}>
      {children}
    </button>
  )
}