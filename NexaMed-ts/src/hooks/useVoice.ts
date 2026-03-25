import { useState, useRef, useCallback, useEffect } from 'react'

type LangCode = 'en' | 'ur' | 'ru'

const VOICE_QS: Record<LangCode, Array<{ field: string; q: string }>> = {
  en: [
    { field: 'name',               q: "Patient's full name?" },
    { field: 'age',                q: "Patient's age?" },
    { field: 'gender',             q: "Patient's gender, male or female?" },
    { field: 'location',           q: 'Incident location?' },
    { field: 'description',        q: 'Chief complaint and mechanism of injury?' },
    { field: 'heart_rate',         q: 'Heart rate in beats per minute?' },
    { field: 'blood_pressure',     q: 'Blood pressure, systolic over diastolic?' },
    { field: 'oxygen_saturation',  q: 'Oxygen saturation percentage?' },
    { field: 'consciousness_level',q: 'Consciousness level: Alert, Voice, Pain, or Unresponsive?' },
  ],
  ur: [
    { field: 'name',               q: 'مریض کا پورا نام؟' },
    { field: 'age',                q: 'مریض کی عمر؟' },
    { field: 'gender',             q: 'مریض کی جنس؟' },
    { field: 'location',           q: 'واقعے کا مقام؟' },
    { field: 'description',        q: 'مرض کی تفصیل؟' },
    { field: 'heart_rate',         q: 'دل کی دھڑکن فی منٹ؟' },
    { field: 'blood_pressure',     q: 'بلڈ پریشر؟' },
    { field: 'oxygen_saturation',  q: 'آکسیجن سیچوریشن؟' },
    { field: 'consciousness_level',q: 'شعوری سطح؟' },
  ],
  ru: [
    { field: 'name',               q: 'Mareez ka poora naam?' },
    { field: 'age',                q: 'Mareez ki umar?' },
    { field: 'gender',             q: 'Mareez ka jinss?' },
    { field: 'location',           q: 'Waqiye ki jagah?' },
    { field: 'description',        q: 'Bimari ki tafseelaat?' },
    { field: 'heart_rate',         q: 'Dil ki dhadkan per minute?' },
    { field: 'blood_pressure',     q: 'Blood pressure?' },
    { field: 'oxygen_saturation',  q: 'Oxygen saturation?' },
    { field: 'consciousness_level',q: 'Shuurii satah?' },
  ],
}

const LANG_MAP: Record<LangCode, string> = { en: 'en-US', ur: 'ur-PK', ru: 'ur-PK' }

export function useVoice(
  lang: LangCode,
  onField: (field: string, val: string) => void,
  onFinish: (all: Record<string, string>) => void
) {
  const [status, setStatus] = useState<'idle'|'speaking'|'listening'|'done'>('idle')
  const [stepIdx, setStepIdx] = useState(-1)
  const collected = useRef<Record<string, string>>({})
  const recRef    = useRef<SpeechRecognition | null>(null)

  const prompts = VOICE_QS[lang] ?? VOICE_QS['en']

  const stop = useCallback(() => {
    recRef.current?.stop()
    window.speechSynthesis.cancel()
    setStatus('idle')
    setStepIdx(-1)
    collected.current = {}
  }, [])

  const speak = useCallback((text: string, langCode: string) =>
    new Promise<void>(res => {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = langCode
      u.onend = () => res()
      u.onerror = () => res()
      window.speechSynthesis.speak(u)
    }), [])

  const listenFor = useCallback((langCode: string) =>
    new Promise<string>(res => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR) { res(''); return }
      const rec = new SR() as SpeechRecognition
      recRef.current = rec
      rec.lang = langCode; rec.interimResults = false; rec.maxAlternatives = 1
      const timer = setTimeout(() => { rec.stop(); res('') }, 8000)
      rec.onresult = e => { clearTimeout(timer); res(e.results[0][0].transcript) }
      rec.onerror  = () => { clearTimeout(timer); res('') }
      rec.start()
    }), [])

  const start = useCallback(async () => {
    collected.current = {}
    setStatus('speaking')
    const langCode = LANG_MAP[lang]
    for (let i = 0; i < prompts.length; i++) {
      setStepIdx(i)
      setStatus('speaking')
      await speak(prompts[i].q, langCode)
      setStatus('listening')
      const ans = await listenFor(langCode)
      if (ans) {
        collected.current[prompts[i].field] = ans
        onField(prompts[i].field, ans)
      }
    }
    setStatus('done')
    onFinish({ ...collected.current })
  }, [lang, prompts, speak, listenFor, onField, onFinish])

  useEffect(() => () => { recRef.current?.stop(); window.speechSynthesis.cancel() }, [])

  return { status, stepIdx, totalSteps: prompts.length, start, stop }
}