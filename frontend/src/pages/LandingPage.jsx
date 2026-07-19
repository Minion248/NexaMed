import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();
  const cxRef = useRef(null);
  const crRef = useRef(null);
  const ocanRef = useRef(null);
  const wcCrRef = useRef(null);
  const wcUrRef = useRef(null);
  const wcStRef = useRef(null);
  const [typewriterText, setTypewriterText] = useState("");
  const typewDelRef = useRef(false);
  const typewCiRef = useRef(0);
  const typewPiRef = useRef(0);

  useEffect(() => {
    // Inject CSS
    const styleId = "landing-page-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        .lp-root { --bg:#0a0b10;--surface:#0f1119;--surface2:#141622;--border:rgba(255,255,255,0.07);--borderl:rgba(255,255,255,0.13);--red:#dc3545;--redg:rgba(220,53,69,0.3);--cyan:#17a2b8;--cyag:rgba(23,162,184,0.25);--gold:#f59e0b;--text:#eef2f7;--text2:rgba(238,242,247,0.6);--text3:rgba(238,242,247,0.33);--fdis:'Space Grotesk',sans-serif;--fmono:'JetBrains Mono',monospace; background:var(--bg);color:var(--text);font-family:var(--fdis);overflow-x:hidden;cursor:none; min-height:100vh; position:relative; }
        .lp-root * { box-sizing:border-box;margin:0;padding:0 }
        .lp-root::-webkit-scrollbar{width:5px;background:var(--bg)}
        .lp-root::-webkit-scrollbar-thumb{background:rgba(220,53,69,0.4);border-radius:3px}
        /* Custom cursor */
        #cx{position:fixed;width:8px;height:8px;background:var(--red);border-radius:50%;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);transition:transform .08s;mix-blend-mode:screen}
        #cr{position:fixed;width:38px;height:38px;border:1.5px solid rgba(23,162,184,0.5);border-radius:50%;pointer-events:none;z-index:9998;transform:translate(-50%,-50%);transition:all .14s ease;mix-blend-mode:screen}
        #cr.h{width:56px;height:56px;border-color:rgba(220,53,69,0.55);background:rgba(220,53,69,0.07)}
        /* Grid bg */
        .lp-root::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(23,162,184,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(23,162,184,0.035) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
        /* Ambient glows */
        .agl{position:absolute;border-radius:50%;filter:blur(130px);pointer-events:none;z-index:0;opacity:.1}
        .agl1{width:700px;height:700px;background:var(--red);top:-220px;left:-160px}
        .agl2{width:600px;height:600px;background:var(--cyan);bottom:10%;right:-180px}
        /* NAV */
        .lp-nav{position:fixed;top:0;left:0;right:0;z-index:1000;display:flex;align-items:center;justify-content:space-between;padding:16px 44px;background:rgba(10,11,16,0.72);backdrop-filter:blur(24px);border-bottom:1px solid var(--border);transition:background .3s}
        .lp-nav.scrolled{background:rgba(10,11,16,0.92)}
        .nlogo{display:flex;align-items:center;gap:10px;font-family:var(--fmono);font-size:15px;font-weight:700;letter-spacing:-.5px;text-decoration:none;color:var(--text)}
        .nlogo-ic{width:30px;height:30px;background:linear-gradient(135deg,#dc3545,#b91c1c);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 18px rgba(220,53,69,0.5)}
        .nlogo span{color:var(--red)}
        .nbadge{font-family:var(--fmono);font-size:9px;background:rgba(220,53,69,.13);color:var(--red);border:1px solid rgba(220,53,69,.3);padding:3px 8px;border-radius:4px;letter-spacing:1.5px}
        .nlinks{display:flex;align-items:center;gap:30px;list-style:none}
        .nlinks a{text-decoration:none;color:var(--text2);font-size:13px;font-weight:500;letter-spacing:.3px;transition:color .2s}
        .nlinks a:hover{color:var(--text)}
        .btn-enter{background:var(--red);color:#fff;border:none;border-radius:10px;padding:10px 22px;font-family:var(--fmono);font-size:12px;font-weight:700;letter-spacing:1.5px;cursor:pointer;transition:all .2s;box-shadow:0 4px 16px rgba(220,53,69,.35);text-decoration:none;display:inline-block}
        .btn-enter:hover{background:#b91c1c;transform:translateY(-1px);box-shadow:0 8px 24px rgba(220,53,69,.5)}
        /* MAIN */
        .lp-main{position:relative;z-index:1}
        .lp-section{padding:96px 44px;max-width:1280px;margin:0 auto}
        /* HERO */
        .hero{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:56px;padding-top:120px}
        .hbadge{display:inline-flex;align-items:center;gap:8px;font-family:var(--fmono);font-size:9.5px;letter-spacing:2px;font-weight:700;color:var(--cyan);background:rgba(23,162,184,.1);border:1px solid rgba(23,162,184,.25);padding:6px 14px;border-radius:100px;margin-bottom:26px}
        .hbadge::before{content:'';width:6px;height:6px;background:var(--cyan);border-radius:50%;box-shadow:0 0 7px var(--cyan);animation:pdot 2s ease-in-out infinite}
        @keyframes pdot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.65)}}
        .hh1{font-size:clamp(36px,5vw,68px);font-weight:700;line-height:1.04;letter-spacing:-2.5px;margin-bottom:22px}
        .hh1 .ar{color:var(--red)}.hh1 .ac{color:var(--cyan)}
        .twr-wrap{font-family:var(--fmono);font-size:14.5px;color:var(--cyan);background:rgba(23,162,184,.06);border:1px solid rgba(23,162,184,.15);border-left:3px solid var(--cyan);padding:13px 17px;border-radius:0 8px 8px 0;margin-bottom:26px;min-height:48px;display:flex;align-items:center}
        .twr-cur{display:inline-block;width:2px;height:15px;background:var(--cyan);margin-left:3px;animation:blink 1s step-end infinite;vertical-align:middle}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        .hdesc{color:var(--text2);font-size:15.5px;line-height:1.72;margin-bottom:38px;max-width:480px}
        .hacts{display:flex;gap:12px;flex-wrap:wrap}
        .btn-sos{position:relative;background:linear-gradient(135deg,#dc3545,#b91c1c);color:#fff;border:none;border-radius:12px;padding:15px 26px;font-family:var(--fmono);font-size:12.5px;font-weight:700;letter-spacing:.8px;cursor:pointer;overflow:hidden;transition:all .3s;box-shadow:0 8px 30px rgba(220,53,69,.4);text-decoration:none;display:inline-flex;align-items:center;gap:7px}
        .btn-sos:hover{transform:translateY(-2px);box-shadow:0 16px 48px rgba(220,53,69,.55)}
        .btn-sos::after{content:'';position:absolute;inset:0;background:rgba(255,255,255,.1);opacity:0;transition:opacity .2s}
        .btn-sos:hover::after{opacity:1}
        .sos-ring{position:absolute;inset:-3px;border:2px solid rgba(220,53,69,.4);border-radius:15px;animation:sring 2s ease-out infinite}
        @keyframes sring{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.14);opacity:0}}
        .btn-sec{background:transparent;color:var(--text);border:1px solid var(--borderl);border-radius:12px;padding:15px 26px;font-family:var(--fmono);font-size:12.5px;font-weight:600;letter-spacing:.3px;cursor:pointer;transition:all .2s;backdrop-filter:blur(10px);text-decoration:none;display:inline-flex;align-items:center;gap:7px}
        .btn-sec:hover{border-color:rgba(255,255,255,.28);background:rgba(255,255,255,.05);transform:translateY(-1px)}
        /* Canvas */
        .hcwrap{position:relative;display:flex;align-items:center;justify-content:center}
        #ocan{width:100%;max-width:460px;height:460px;display:block}
        .olabel{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);font-family:var(--fmono);font-size:8.5px;color:var(--text3);letter-spacing:2px;white-space:nowrap}
        /* STATS BAR */
        .statsbar{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:16px;overflow:hidden;max-width:1200px;margin:0 auto 72px}
        .si{background:var(--surface);padding:26px;text-align:center;transition:background .2s}
        .si:hover{background:var(--surface2)}
        .sv{font-family:var(--fmono);font-size:34px;font-weight:700;line-height:1;margin-bottom:5px}
        .su{font-size:17px;color:var(--text3)}
        .sl{font-size:10.5px;color:var(--text3);letter-spacing:1.5px;font-weight:500}
        /* SECTION LABELS */
        .slabel{font-family:var(--fmono);font-size:9.5px;letter-spacing:3px;color:var(--text3);font-weight:600;margin-bottom:12px}
        .stitle{font-size:clamp(26px,3.5vw,46px);font-weight:700;letter-spacing:-1.5px;line-height:1.1;margin-bottom:14px}
        .sdesc{color:var(--text2);font-size:15.5px;line-height:1.7;max-width:560px;margin-bottom:60px}
        /* TIMELINE */
        .tline{position:relative;display:flex;flex-direction:column}
        .tline::before{content:'';position:absolute;left:38px;top:0;bottom:0;width:1px;background:linear-gradient(to bottom,transparent,var(--borderl) 10%,var(--borderl) 90%,transparent)}
        .phase{display:grid;grid-template-columns:78px 1fr;gap:28px;padding:28px 0;opacity:0;transform:translateX(-18px);transition:all .6s cubic-bezier(.22,1,.36,1)}
        .phase.vis{opacity:1;transform:translateX(0)}
        .pnode{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px}
        .pdot{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid;flex-shrink:0;position:relative;z-index:1}
        .pdot.r{background:rgba(220,53,69,.12);border-color:var(--red);color:var(--red);box-shadow:0 0 18px rgba(220,53,69,.22)}
        .pdot.c{background:rgba(23,162,184,.12);border-color:var(--cyan);color:var(--cyan);box-shadow:0 0 18px rgba(23,162,184,.22)}
        .pnum{font-family:var(--fmono);font-size:8.5px;color:var(--text3);letter-spacing:1px}
        .pcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:26px;position:relative;overflow:hidden;transition:border-color .2s,transform .2s}
        .pcard:hover{border-color:var(--borderl);transform:translateX(4px)}
        .pcard::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px}
        .pcard.r::before{background:var(--red)}.pcard.c::before{background:var(--cyan)}
        .ptag{font-family:var(--fmono);font-size:8.5px;letter-spacing:2px;font-weight:700;margin-bottom:7px}
        .ptag.r{color:var(--red)}.ptag.c{color:var(--cyan)}
        .ptitle{font-size:19px;font-weight:700;letter-spacing:-.4px;margin-bottom:9px}
        .pdesc{color:var(--text2);font-size:13.5px;line-height:1.7;margin-bottom:18px}
        .pviz{font-family:var(--fmono);font-size:10.5px;color:var(--text3);background:rgba(0,0,0,.28);border-radius:8px;padding:11px 14px;display:flex;flex-direction:column;gap:7px}
        .pvrow{display:flex;align-items:center;gap:8px}
        .vbar{flex:1;height:3.5px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden}
        .vbf{height:100%;border-radius:2px;animation:vfill 2.4s ease-in-out infinite}
        @keyframes vfill{0%{width:0}55%{width:100%}75%{width:100%}100%{width:0}}
        .vping{width:7px;height:7px;border-radius:50%;animation:vping 1.5s ease-in-out infinite}
        @keyframes vping{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.55)}}
        .ppipe{display:flex;align-items:center;gap:4px;flex:1;margin-left:8px}
        .ppd{width:5.5px;height:5.5px;border-radius:50%;background:var(--cyan);animation:ppf 1.4s ease-in-out infinite}
        .ppd:nth-child(2){animation-delay:.2s}.ppd:nth-child(4){animation-delay:.4s}
        .ppd:nth-child(6){animation-delay:.6s}.ppd:nth-child(8){animation-delay:.8s}
        .ppl{flex:1;height:1px;background:linear-gradient(to right,transparent,var(--cyan),transparent)}
        @keyframes ppf{0%,100%{opacity:.2;transform:scale(.65)}50%{opacity:1;transform:scale(1)}}
        .efly{font-size:18px;animation:fly 2s ease-in-out infinite}
        @keyframes fly{0%{transform:translateX(0) rotate(0);opacity:1}65%{transform:translateX(42px) rotate(-6deg);opacity:0}66%{transform:translateX(-22px) rotate(-6deg);opacity:0}100%{transform:translateX(0) rotate(0);opacity:1}}
        /* BROWSER MOCKUP */
        .msec{text-align:center}
        .mwrap{perspective:1200px;margin:0 auto;max-width:880px}
        .bmock{background:var(--surface);border:1px solid var(--borderl);border-radius:15px;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.055);transform:rotateX(22deg) rotateY(-9deg) scale(.9);transform-style:preserve-3d;transition:transform .85s cubic-bezier(.22,1,.36,1),opacity .6s;opacity:0}
        .bmock.vis{opacity:1}.bmock.flat{transform:rotateX(0) rotateY(0) scale(1)}
        .bchrome{background:rgba(0,0,0,.48);padding:11px 15px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--border)}
        .cdots{display:flex;gap:5px}
        .cd{width:11px;height:11px;border-radius:50%}
        .cdr{background:#ff5f57}.cdy{background:#ffc030}.cdg{background:#28c840}
        .cbar{flex:1;background:rgba(255,255,255,.06);border-radius:6px;padding:5px 12px;font-family:var(--fmono);font-size:10.5px;color:var(--text3)}
        .bcont{position:relative;height:420px;background:linear-gradient(135deg,#0d1117 0%,#0f1a2e 50%,#0a1520 100%);overflow:hidden;display:flex;align-items:center;justify-content:center}
        .mock-db{width:100%;height:100%;display:grid;grid-template-columns:210px 1fr;opacity:.85}
        .mock-sb{background:rgba(0,0,0,.4);border-right:1px solid var(--border);padding:18px;display:flex;flex-direction:column;gap:7px}
        .sb-item{background:rgba(255,255,255,.04);border-radius:7px;padding:9px 13px;font-family:var(--fmono);font-size:9.5px;color:var(--text3);display:flex;align-items:center;gap:7px}
        .sb-item.act{background:rgba(220,53,69,.12);color:var(--red);border:1px solid rgba(220,53,69,.25)}
        .mock-mn{padding:18px;display:flex;flex-direction:column;gap:11px}
        .mhdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px}
        .mt{font-size:12.5px;font-weight:700;letter-spacing:-.2px}
        .mb{background:rgba(220,53,69,.15);color:var(--red);border:1px solid rgba(220,53,69,.3);padding:3px 8px;border-radius:4px;font-family:var(--fmono);font-size:8.5px;letter-spacing:1px}
        .mcards{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
        .mc{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:9px;padding:13px}
        .mcv{font-size:18px;font-weight:700;font-family:var(--fmono)}
        .mcl{font-size:8.5px;color:var(--text3);letter-spacing:1px;margin-top:2px}
        .mmap{background:rgba(23,162,184,.05);border:1px solid rgba(23,162,184,.12);border-radius:9px;flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
        .mgrid{position:absolute;inset:0;background-image:linear-gradient(rgba(23,162,184,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(23,162,184,.06) 1px,transparent 1px);background-size:22px 22px}
        .mpin{width:9px;height:9px;border-radius:50%;background:var(--red);box-shadow:0 0 9px var(--red);position:absolute;animation:pinp 2s ease-in-out infinite}
        @keyframes pinp{0%,100%{box-shadow:0 0 0 0 rgba(220,53,69,.6)}50%{box-shadow:0 0 0 8px rgba(220,53,69,0)}}
        /* Play overlay */
        .povl{position:absolute;inset:0;background:rgba(10,11,16,.58);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .3s;z-index:2}
        .povl:hover{background:rgba(10,11,16,.38)}
        .pbtn{width:76px;height:76px;border-radius:50%;background:rgba(220,53,69,.9);display:flex;align-items:center;justify-content:center;font-size:26px;transition:transform .2s,box-shadow .2s;box-shadow:0 0 0 15px rgba(220,53,69,.1),0 0 0 30px rgba(220,53,69,.05)}
        .povl:hover .pbtn{transform:scale(1.1);box-shadow:0 0 0 20px rgba(220,53,69,.14),0 0 0 40px rgba(220,53,69,.06)}
        .ptxt{position:absolute;bottom:22px;font-family:var(--fmono);font-size:10.5px;color:var(--text2);letter-spacing:2px}
        /* METRICS */
        .mgrid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        .mpanel{background:var(--surface);border:1px solid var(--border);border-radius:15px;padding:26px;position:relative;overflow:hidden;transition:border-color .2s,transform .3s;opacity:0;transform:translateY(28px)}
        .mpanel.vis{opacity:1;transform:translateY(0)}
        .mpanel:hover{border-color:var(--borderl);transform:translateY(-4px)}
        .mpanel::after{content:'';position:absolute;top:-1px;left:0;right:0;height:2px}
        .mpanel.cr::after{background:var(--red)}
        .mpanel.ur::after{background:var(--gold)}
        .mpanel.st::after{background:var(--cyan)}
        .mpanel.cr{background:radial-gradient(ellipse at 50% -20%,rgba(220,53,69,.07) 0%,var(--surface) 58%)}
        .mpanel.ur{background:radial-gradient(ellipse at 50% -20%,rgba(245,158,11,.07) 0%,var(--surface) 58%)}
        .mpanel.st{background:radial-gradient(ellipse at 50% -20%,rgba(23,162,184,.07) 0%,var(--surface) 58%)}
        .mphdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .mstat{font-family:var(--fmono);font-size:8.5px;letter-spacing:2px;font-weight:700;padding:4px 9px;border-radius:100px}
        .mstat.cr{background:rgba(220,53,69,.14);color:var(--red)}
        .mstat.ur{background:rgba(245,158,11,.14);color:var(--gold)}
        .mstat.st{background:rgba(23,162,184,.14);color:var(--cyan)}
        .micon{font-size:20px}
        .mval{font-family:var(--fmono);font-size:50px;font-weight:700;line-height:1;margin-bottom:4px;letter-spacing:-2px}
        .mval.cr{color:var(--red)}.mval.ur{color:var(--gold)}.mval.st{color:var(--cyan)}
        .mlbl{font-size:10.5px;color:var(--text3);letter-spacing:1px;font-weight:500;margin-bottom:18px}
        .mwwrap{position:relative;height:56px;overflow:hidden;border-radius:7px}
        .wcan{width:100%;height:56px;display:block}
        .sbeam{position:absolute;top:0;bottom:0;width:38px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);animation:scan 2.5s linear infinite;pointer-events:none}
        @keyframes scan{0%{left:-38px}100%{left:100%}}
        .mtrend{display:flex;align-items:center;gap:5px;margin-top:10px;font-family:var(--fmono);font-size:9.5px;color:var(--text3)}
        .tup{color:var(--red)}.tdn{color:var(--cyan)}
        /* CTA */
        .ctacard{background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:76px 56px;max-width:780px;margin:0 auto;position:relative;overflow:hidden;text-align:center}
        .ctacard::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(220,53,69,.08) 0%,transparent 58%)}
        .ctatitle{font-size:clamp(30px,4vw,50px);font-weight:700;letter-spacing:-2px;margin-bottom:18px}
        .ctadesc{color:var(--text2);font-size:15.5px;line-height:1.7;margin-bottom:38px}
        /* FOOTER */
        .lp-footer{border-top:1px solid var(--border);padding:28px 44px;display:flex;align-items:center;justify-content:space-between;font-family:var(--fmono);font-size:10.5px;color:var(--text3);position:relative;z-index:1}
        /* REVEAL */
        .rv{opacity:0;transform:translateY(22px);transition:all .68s cubic-bezier(.22,1,.36,1)}
        .rv.vis{opacity:1;transform:translateY(0)}
        .rv.d1{transition-delay:.1s}.rv.d2{transition-delay:.2s}.rv.d3{transition-delay:.3s}
        /* RESPONSIVE */
        @media(max-width:1024px){.hero{grid-template-columns:1fr}.hcwrap{order:-1}#ocan{max-width:340px;height:340px;margin:0 auto}.statsbar{grid-template-columns:repeat(2,1fr)}.mgrid3{grid-template-columns:1fr}}
        @media(max-width:768px){.lp-nav{padding:13px 18px}.nlinks{display:none}.lp-section{padding:56px 18px}.hero{padding-top:96px}.statsbar{grid-template-columns:1fr 1fr}.ctacard{padding:44px 22px}}
        @keyframes rout{to{transform:scale(1);opacity:0}}
      `;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    // Cursor
    const handleMouseMove = (e) => {
      if (cxRef.current) {
        cxRef.current.style.left = e.clientX + 'px';
        cxRef.current.style.top = e.clientY + 'px';
      }
      if (crRef.current) {
        crRef.current.style.left = e.clientX + 'px';
        crRef.current.style.top = e.clientY + 'px';
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Typewriter
    const phrases = ['Seconds Save Lives.','Zero Data Gaps.','NADRA Framework Aligned.','Llama-3 Clinical Intelligence.','n8n Automation Pipeline Active.'];
    let typeTimeout;
    const tstep = () => {
      const p = phrases[typewPiRef.current];
      if (!typewDelRef.current) {
        typewCiRef.current++;
        setTypewriterText(p.slice(0, typewCiRef.current));
        if (typewCiRef.current === p.length) {
          typewDelRef.current = true;
          typeTimeout = setTimeout(tstep, 2000);
          return;
        }
        typeTimeout = setTimeout(tstep, 50 + Math.random() * 40);
      } else {
        typewCiRef.current--;
        setTypewriterText(p.slice(0, typewCiRef.current));
        if (typewCiRef.current === 0) {
          typewDelRef.current = false;
          typewPiRef.current = (typewPiRef.current + 1) % phrases.length;
          typeTimeout = setTimeout(tstep, 380);
          return;
        }
        typeTimeout = setTimeout(tstep, 24);
      }
    };
    tstep();

    // Intersection Observers
    const io = new IntersectionObserver(e=>e.forEach(en=>{
      if(en.isIntersecting){en.target.classList.add('vis');io.unobserve(en.target);}
    }),{threshold:.1});
    document.querySelectorAll('.rv').forEach(el=>io.observe(el));

    const pio = new IntersectionObserver(e=>e.forEach(en=>{
      if(en.isIntersecting){en.target.classList.add('vis');pio.unobserve(en.target);}
    }),{threshold:.14});
    document.querySelectorAll('.phase').forEach(el=>pio.observe(el));

    const mio = new IntersectionObserver(e=>e.forEach(en=>{
      if(en.isIntersecting){
        en.target.classList.add('vis');
        const id=en.target.id;
        if(id==='mp-cr')animCnt('cnt-cr',47,1400);
        if(id==='mp-ur')animCnt('cnt-ur',124,1500);
        if(id==='mp-st')animCnt('cnt-st',389,1900);
        mio.unobserve(en.target);
      }
    }),{threshold:.18});
    document.querySelectorAll('.mpanel').forEach(el=>mio.observe(el));

    const bio = new IntersectionObserver(e=>e.forEach(en=>{
      if(en.isIntersecting){
        en.target.classList.add('vis');
        setTimeout(()=>en.target.classList.add('flat'),420);
        bio.unobserve(en.target);
      }
    }),{threshold:.38});
    const bm = document.getElementById('bmock');
    if(bm)bio.observe(bm);

    function animCnt(id,target,dur){
      const el=document.getElementById(id);if(!el)return;
      const s=performance.now();
      function step(n){
        const p=Math.min((n-s)/dur,1),e=1-Math.pow(1-p,3);
        el.textContent=Math.round(e*target);
        if(p<1)requestAnimationFrame(step);
      }requestAnimationFrame(step);
    }

    // Nav Scroll
    const handleScroll = () => {
      const nav = document.getElementById('lp-nav');
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll);

    // Particle Orb
    let animId;
    if (ocanRef.current) {
      const can = ocanRef.current;
      const ctx = can.getContext('2d'), W = can.width, H = can.height, cx = W / 2, cy = H / 2;
      let mx = cx, my = cy, rY = 0, rX = 0, tY = 0, tX = 0, t = 0;
      const R = 148, N = 210;
      const pts = [];
      for(let i=0;i<N;i++){
        const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
        pts.push({th,ph,sp:(Math.random()-.5)*.0028,sz:Math.random()*1.6+.5,ct:Math.random()});
      }
      function rot3(x,y,z,rx,ry){
        const x1=x*Math.cos(ry)+z*Math.sin(ry),z1=-x*Math.sin(ry)+z*Math.cos(ry);
        const y2=y*Math.cos(rx)-z1*Math.sin(rx),z2=y*Math.sin(rx)+z1*Math.cos(rx);
        return{x:x1,y:y2,z:z2};
      }
      function proj(x,y,z){
        const f=580,s=f/(f+z+200);return{x:x*s+cx,y:y*s+cy,s};
      }
      function lc(t,a){
        const r=Math.round(220+(23-220)*t),g=Math.round(53+(162-53)*t),b=Math.round(69+(184-69)*t);
        return `rgba(${r},${g},${b},${a})`;
      }
      function drawOrb(){
        ctx.clearRect(0,0,W,H);t+=.006;
        const dx=mx-cx,dy=my-cy;
        tY=dx*.0028;tX=dy*.0028;
        rY+=(tY-rY)*.038;rX+=(tX-rX)*.038;
        const br=1+.042*Math.sin(t*1.7);
        const projected=pts.map(p=>{
          p.th+=p.sp;
          const r=R*br;
          const x=r*Math.sin(p.ph)*Math.cos(p.th),y=r*Math.cos(p.ph),z=r*Math.sin(p.ph)*Math.sin(p.th);
          const ro=rot3(x,y,z,rX,rY+t*.08);
          const pr=proj(ro.x,ro.y,ro.z);
          const zn=(ro.z+R)/(R*2);
          return{px:pr.x,py:pr.y,pz:ro.z,s:pr.s,zn,ct:p.ct,sz:p.sz};
        });
        projected.sort((a,b)=>a.pz-b.pz);
        const th=50;
        for(let i=0;i<projected.length;i++){
          let c=0;
          for(let j=i+1;j<projected.length&&c<4;j++){
            const ddx=projected[i].px-projected[j].px,ddy=projected[i].py-projected[j].py;
            const d=Math.sqrt(ddx*ddx+ddy*ddy);
            if(d<th){c++;
              const a=(1-d/th)*.16*projected[i].zn;
              ctx.beginPath();ctx.strokeStyle=lc((projected[i].ct+projected[j].ct)*.5,a);
              ctx.lineWidth=.55;ctx.moveTo(projected[i].px,projected[i].py);
              ctx.lineTo(projected[j].px,projected[j].py);ctx.stroke();
            }
          }
        }
        projected.forEach(p=>{
          const a=.22+p.zn*.78,sz=p.sz*p.s*1.7;
          const g=ctx.createRadialGradient(p.px,p.py,0,p.px,p.py,sz*3.2);
          g.addColorStop(0,lc(p.ct,a*.48));g.addColorStop(1,lc(p.ct,0));
          ctx.beginPath();ctx.fillStyle=g;ctx.arc(p.px,p.py,sz*3.2,0,Math.PI*2);ctx.fill();
          ctx.beginPath();ctx.fillStyle=lc(p.ct,a);ctx.arc(p.px,p.py,sz,0,Math.PI*2);ctx.fill();
        });
        animId = requestAnimationFrame(drawOrb);
      }
      const wrap = can.parentElement;
      if (wrap) {
        wrap.addEventListener('mousemove', e => {
          const rc = can.getBoundingClientRect();
          mx = ((e.clientX - rc.left) / rc.width) * W;
          my = ((e.clientY - rc.top) / rc.height) * H;
        });
        wrap.addEventListener('mouseleave', () => { mx = cx; my = cy; });
      }
      drawOrb();
    }

    // Wave Animation
    let waveAnimId;
    const cfg = [
      {id:'wc-cr', color:'rgba(220,53,69,', amp:12, fr:.024, ph:0, ref: wcCrRef},
      {id:'wc-ur', color:'rgba(245,158,11,', amp:9,  fr:.017, ph:2, ref: wcUrRef},
      {id:'wc-st', color:'rgba(23,162,184,', amp:11, fr:.021, ph:4, ref: wcStRef},
    ];
    const cs = cfg.map(c => {
      const el = c.ref.current;
      return el ? { ctx: el.getContext('2d'), w: el.width, h: el.height, ...c } : null;
    }).filter(Boolean);
    let waveT = 0;
    function waveTick() {
      waveT += .04;
      cs.forEach(c => {
        const { ctx, w, h, color, amp, fr, ph } = c;
        ctx.clearRect(0, 0, w, h);
        ctx.beginPath(); ctx.moveTo(0, h/2);
        for(let x=0;x<=w;x++){
          const y = h/2 + amp*Math.sin(x*fr+waveT+ph) + amp*.38*Math.sin(x*fr*1.7+waveT*1.3+ph);
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color + '.82)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h/2);
        for(let x=0;x<=w;x++){
          const y = h/2 + amp*.55*Math.sin(x*fr*1.2-waveT*.7+ph+1) + amp*.28*Math.cos(x*fr*2+waveT+ph);
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color + '.22)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h);
        for(let x=0;x<=w;x++){
          const y = h/2 + amp*Math.sin(x*fr+waveT+ph) + amp*.38*Math.sin(x*fr*1.7+waveT*1.3+ph);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        const gr = ctx.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, color + '.1)'); gr.addColorStop(1, color + '0)');
        ctx.fillStyle = gr; ctx.fill();
      });
      waveAnimId = requestAnimationFrame(waveTick);
    }
    waveTick();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(typeTimeout);
      if (animId) cancelAnimationFrame(animId);
      if (waveAnimId) cancelAnimationFrame(waveAnimId);
      io.disconnect();
      pio.disconnect();
      mio.disconnect();
      bio.disconnect();
    };
  }, []);

  const onMouseEnterCursor = () => crRef.current && crRef.current.classList.add('h');
  const onMouseLeaveCursor = () => crRef.current && crRef.current.classList.remove('h');
  const rippleBtn = (e) => {
    const btn = e.currentTarget;
    const rp = document.createElement('span');
    rp.style.cssText = 'position:absolute;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.18);top:'+(e.nativeEvent.offsetY-90)+'px;left:'+(e.nativeEvent.offsetX-90)+'px;transform:scale(0);animation:rout .58s ease-out forwards;pointer-events:none';
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.appendChild(rp);
    setTimeout(() => rp.remove(), 600);
    navigate('/login');
  };

  const handleCardMouseMove = (e, ref) => {
    if (!ref) return;
    const r = ref.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width/2)/r.width;
    const dy = (e.clientY - r.top - r.height/2)/r.height;
    ref.style.transform = `perspective(760px) rotateY(${dx*6}deg) rotateX(${-dy*4}deg) translateX(4px)`;
  };
  const handleCardMouseLeave = (ref) => { if(ref) ref.style.transform = ''; };

  return (
    <div className="lp-root">
      <div id="cx" ref={cxRef}></div>
      <div id="cr" ref={crRef}></div>
      <div className="agl agl1"></div>
      <div className="agl agl2"></div>

      <nav id="lp-nav" className="lp-nav">
        <a href="#/" onClick={(e)=>{e.preventDefault();navigate('/');}} className="nlogo" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
          <div className="nlogo-ic">&#x1F691;</div>
          Nexa<span>Med</span>
          <div className="nbadge">v3.2</div>
        </a>
        <ul className="nlinks">
          <li><a href="#sec-timeline" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>System Flow</a></li>
          <li><a href="#sec-demo" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>Live Demo</a></li>
          <li><a href="#sec-metrics" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>Analytics</a></li>
          <li><a href="#/" onClick={(e)=>{e.preventDefault();navigate('/login');}} onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>EMT Portal</a></li>
        </ul>
        <button onClick={rippleBtn} className="btn-enter" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>ENTER SYSTEM &#x2192;</button>
      </nav>

      <main className="lp-main">
        {/* HERO */}
        <section className="lp-section hero" style={{maxWidth: '1280px'}}>
          <div className="hleft">
            <div className="hbadge">NEXAMED // AGENTIC AI EMERGENCY COMMAND SYSTEM</div>
            <h1 className="hh1">
              THE FUTURE<br/>
              OF <span className="ar">DISPATCH</span><br/>
              IS <span className="ac">AGENTIC</span>
            </h1>
            <div className="twr-wrap">
              <span id="tw">{typewriterText}</span><span className="twr-cur"></span>
            </div>
            <p className="hdesc">Enterprise-grade AI triage command infrastructure. Llama&#x2011;3 powered clinical analysis, NADRA biometric identity verification, and real-time n8n dispatch pipelines&mdash;converging into a single unified EMT canvas.</p>
            <div className="hacts">
              <div style={{position: 'relative'}}>
                <span className="sos-ring"></span>
                <button onClick={rippleBtn} className="btn-sos" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F6A8; TRIGGER LIVE SOS DEMO</button>
              </div>
              <button onClick={(e)=>{e.preventDefault();navigate('/login');}} className="btn-sec" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F510; EMT SECURE LOGIN</button>
            </div>
          </div>
          <div className="hcwrap">
            <canvas id="ocan" ref={ocanRef} width="460" height="460"></canvas>
            <div className="olabel">NEURAL DISPATCH MATRIX // AI ACTIVE</div>
          </div>
        </section>

        {/* STATS BAR */}
        <div className="statsbar" style={{margin: '0 44px 72px', maxWidth: '1200px', marginLeft: 'auto', marginRight: 'auto'}}>
          <div className="si"><div className="sv" style={{color: '#dc3545'}}>4.2<span className="su">s</span></div><div className="sl">AVG TRIAGE RESPONSE</div></div>
          <div className="si"><div className="sv" style={{color: '#17a2b8'}}>99.97<span className="su">%</span></div><div className="sl">SYSTEM UPTIME</div></div>
          <div className="si"><div className="sv" style={{color: '#f59e0b'}}>3.2K<span className="su">+</span></div><div className="sl">INCIDENTS PROCESSED</div></div>
          <div className="si"><div className="sv" style={{color: '#a78bfa'}}>8</div><div className="sl">AI MODEL FALLBACKS</div></div>
        </div>

        {/* TIMELINE */}
        <section id="sec-timeline" className="lp-section">
          <div className="slabel rv">// SYSTEM LIFECYCLE TELEMETRY</div>
          <h2 className="stitle rv d1">Incident to Resolution<br/><span style={{color: 'var(--text3)'}}>in Milliseconds.</span></h2>
          <p className="sdesc rv d2">Every emergency signal traverses a hardened, multi-stage agentic pipeline &mdash; from raw GPS coordinates to clinical dispatch in under 5 seconds.</p>
          <div className="tline">
            <div className="phase" id="p1">
              <div className="pnode"><div className="pdot r">&#x1F4E1;</div><div className="pnum">01</div></div>
              <div className="pcard r" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
                <div className="ptag r">PHASE 01 // INPUT CAPTURE</div>
                <div className="ptitle">Distress Signal Capture</div>
                <div className="pdesc">Citizen panic button triggers geolocation acquisition and structured JSON payload assembly. Raw GPS coordinates, emergency description, and ISO&#x2011;8601 timestamp are captured simultaneously.</div>
                <div className="pviz">
                  <div className="pvrow"><div className="vping" style={{background: 'var(--red)', boxShadow: '0 0 6px var(--red)'}}></div><span style={{color: 'var(--red)', fontSize: '9.5px'}}>SIGNAL LOCKED</span><span style={{marginLeft: 'auto', fontSize: '8.5px'}}>31.5204&deg;N, 74.3587&deg;E</span></div>
                  <div className="pvrow"><span style={{fontSize: '8.5px'}}>PAYLOAD</span><div className="vbar"><div className="vbf" style={{background: 'var(--red)'}}></div></div></div>
                  <div className="pvrow"><span style={{fontSize: '8.5px'}}>TIMESTAMP</span><div className="vbar"><div className="vbf" style={{background: 'rgba(220,53,69,.5)', animationDelay: '.35s'}}></div></div></div>
                </div>
              </div>
            </div>
            <div className="phase" id="p2" style={{transitionDelay: '.12s'}}>
              <div className="pnode"><div className="pdot c">&#x26A1;</div><div className="pnum">02</div></div>
              <div className="pcard c" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
                <div className="ptag c">PHASE 02 // ASYNC PIPELINE</div>
                <div className="ptitle">Asynchronous Webhook Dispatch</div>
                <div className="pdesc">n8n production automation cluster receives the structured payload with zero&#x2011;delay HTTP forwarding. Parallel execution triggers notification chains, database writes, and EMT alert broadcasts simultaneously.</div>
                <div className="pviz">
                  <div className="pvrow"><span style={{fontSize: '8.5px'}}>n8n PIPELINE</span><div className="ppipe"><div className="ppd"></div><div className="ppl"></div><div className="ppd"></div><div className="ppl"></div><div className="ppd"></div><div className="ppl"></div><div className="ppd"></div><div className="ppl"></div><div className="ppd"></div></div><span style={{color: 'var(--cyan)', fontSize: '8.5px'}}>LIVE</span></div>
                  <div className="pvrow" style={{fontSize: '8.5px'}}><span>SOS_WEBHOOK</span><span style={{margin: '0 5px', color: 'var(--cyan)'}}>&rarr;</span><span>BROADCAST</span><span style={{margin: '0 5px', color: 'var(--cyan)'}}>&rarr;</span><span>FIRESTORE</span></div>
                </div>
              </div>
            </div>
            <div className="phase" id="p3" style={{transitionDelay: '.24s'}}>
              <div className="pnode"><div className="pdot r">&#x1F9E0;</div><div className="pnum">03</div></div>
              <div className="pcard r" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
                <div className="ptag r">PHASE 03 // AI DIAGNOSTICS</div>
                <div className="ptitle">Agentic AI Clinical Sorting</div>
                <div className="pdesc">Llama&#x2011;3 70B compiles structured clinical summaries from voice intake and biometric data. NADRA identity verification runs concurrently &mdash; safely activating John Doe protocols for unverified profiles, children, or missing&#x2011;data patients.</div>
                <div className="pviz">
                  <div className="pvrow"><span style={{fontSize: '8.5px'}}>LLAMA-3 70B</span><div className="vbar"><div className="vbf" style={{background: 'linear-gradient(90deg,var(--red),#f59e0b)', animationDelay: '.1s'}}></div></div><span style={{color: 'var(--red)', fontSize: '8.5px'}}>ANALYZING</span></div>
                  <div className="pvrow"><span style={{fontSize: '8.5px'}}>NADRA BIO</span><div className="vbar"><div className="vbf" style={{background: 'rgba(220,53,69,.6)', animationDelay: '.5s'}}></div></div><span style={{fontSize: '8.5px'}}>VERIFIED</span></div>
                </div>
              </div>
            </div>
            <div className="phase" id="p4" style={{transitionDelay: '.36s'}}>
              <div className="pnode"><div className="pdot c">&#x1F4E7;</div><div className="pnum">04</div></div>
              <div className="pcard c" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
                <div className="ptag c">PHASE 04 // DISSEMINATION</div>
                <div className="ptitle">Instant Cloud Alert Broadcast</div>
                <div className="pdesc">An adaptive HTML triage email carrying the full clinical summary, GPS coordinates, and patient priority level is dispatched instantly to all registered response networks and nearby hospital nodes.</div>
                <div className="pviz">
                  <div className="pvrow"><span className="efly">&#x1F4E7;</span><span style={{fontSize: '8.5px', marginLeft: '7px'}}>DISPATCHING TO 12 RESPONSE NODES</span></div>
                  <div className="pvrow"><span style={{fontSize: '8.5px', color: 'var(--cyan)'}}>&#x2713;</span><span style={{fontSize: '8.5px', marginLeft: '4px'}}>DHQ Hospital Lahore &mdash; ETA 4.2 min</span></div>
                  <div className="pvrow"><span style={{fontSize: '8.5px', color: 'var(--cyan)'}}>&#x2713;</span><span style={{fontSize: '8.5px', marginLeft: '4px'}}>Rescue 1122 Unit 7 &mdash; ETA 2.8 min</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BROWSER MOCKUP */}
        <section id="sec-demo" className="lp-section msec">
          <div className="slabel rv">// LIVE SYSTEM PREVIEW</div>
          <h2 className="stitle rv d1">See the Command Canvas<br/><span style={{color: 'var(--text3)'}}>in Full Operation.</span></h2>
          <p className="sdesc rv d2" style={{margin: '0 auto 44px', textAlign: 'center'}}>The NexaMed EMT canvas delivers a multi-panel clinical workspace with real-time map tracking, AI analysis, and one-click PDF report generation.</p>
          <div className="mwrap rv d3">
            <div className="bmock" id="bmock">
              <div className="bchrome">
                <div className="cdots"><div className="cd cdr"></div><div className="cd cdy"></div><div className="cd cdg"></div></div>
                <div className="cbar">nexamed.command // 127.0.0.1:5173 // EMT CANVAS &bull; ACTIVE</div>
              </div>
              <div className="bcont">
                <div className="mock-db">
                  <div className="mock-sb">
                    <div style={{fontFamily: 'var(--fmono)', fontSize: '8.5px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '7px', padding: '0 3px'}}>MODULES</div>
                    <div className="sb-item act">&#x1F6A8; Active Triage</div>
                    <div className="sb-item" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F5FA;&#xFE0F; Incident Map</div>
                    <div className="sb-item" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F9E0; AI Analysis</div>
                    <div className="sb-item" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1FA96; NADRA Scan</div>
                    <div className="sb-item" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F4CB; PCR Reports</div>
                    <div className="sb-item" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F4CA; Analytics</div>
                  </div>
                  <div className="mock-mn">
                    <div className="mhdr"><div className="mt">Active Incident &mdash; Lahore Central</div><div className="mb">CRITICAL</div></div>
                    <div className="mcards">
                      <div className="mc"><div className="mcv" style={{color: 'var(--red)'}}>78</div><div className="mcl">HEART RATE</div></div>
                      <div className="mc"><div className="mcv" style={{color: 'var(--cyan)'}}>94%</div><div className="mcl">SpO2</div></div>
                      <div className="mc"><div className="mcv" style={{color: 'var(--gold)'}}>120/80</div><div className="mcl">BLOOD PRESSURE</div></div>
                    </div>
                    <div className="mmap" style={{flex: 1}}>
                      <div className="mgrid"></div>
                      <div className="mpin" style={{top: '40%', left: '45%'}}></div>
                      <div className="mpin" style={{top: '58%', left: '62%', background: 'var(--cyan)', boxShadow: '0 0 9px var(--cyan)', animationDelay: '.5s'}}></div>
                      <div style={{fontFamily: 'var(--fmono)', fontSize: '8.5px', color: 'var(--text3)', letterSpacing: '1px', zIndex: 1}}>LIVE MAP // 2 UNITS ACTIVE</div>
                    </div>
                  </div>
                </div>
                <div className="povl" id="povl" onClick={(e)=>e.currentTarget.style.display='none'}>
                  <div><div className="pbtn">&#x25B6;</div><div className="ptxt">WATCH SYSTEM DEMO</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* METRICS */}
        <section id="sec-metrics" className="lp-section">
          <div className="slabel rv">// REAL-TIME INCIDENT MATRIX</div>
          <h2 className="stitle rv d1">Live Emergency<br/><span style={{color: 'var(--text3)'}}>Case Distribution.</span></h2>
          <p className="sdesc rv d2">Continuously monitored incident classification across all active network nodes.</p>
          <div className="mgrid3">
            <div className="mpanel cr" id="mp-cr" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
              <div className="mphdr"><div className="mstat cr">CRITICAL</div><div className="micon">&#x1F534;</div></div>
              <div className="mval cr" id="cnt-cr">0</div>
              <div className="mlbl">ACTIVE CRITICAL INCIDENTS</div>
              <div className="mwwrap"><canvas className="wcan" id="wc-cr" ref={wcCrRef} width="400" height="56"></canvas><div className="sbeam" style={{background: 'linear-gradient(90deg,transparent,rgba(220,53,69,.13),transparent)'}}></div></div>
              <div className="mtrend"><span className="tup">&uarr; 12%</span><span>from last hour</span></div>
            </div>
            <div className="mpanel ur" id="mp-ur" style={{transitionDelay: '.12s'}} onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
              <div className="mphdr"><div className="mstat ur">URGENT</div><div className="micon">&#x1F7E1;</div></div>
              <div className="mval ur" id="cnt-ur">0</div>
              <div className="mlbl">ESCALATED PRIORITY CASES</div>
              <div className="mwwrap"><canvas className="wcan" id="wc-ur" ref={wcUrRef} width="400" height="56"></canvas><div className="sbeam" style={{background: 'linear-gradient(90deg,transparent,rgba(245,158,11,.13),transparent)', animationDelay: '.85s'}}></div></div>
              <div className="mtrend"><span className="tdn">&darr; 5%</span><span>from last hour</span></div>
            </div>
            <div className="mpanel st" id="mp-st" style={{transitionDelay: '.24s'}} onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>
              <div className="mphdr"><div className="mstat st">STABLE</div><div className="micon">&#x1F535;</div></div>
              <div className="mval st" id="cnt-st">0</div>
              <div className="mlbl">RESOLVED STABLE CASES</div>
              <div className="mwwrap"><canvas className="wcan" id="wc-st" ref={wcStRef} width="400" height="56"></canvas><div className="sbeam" style={{background: 'linear-gradient(90deg,transparent,rgba(23,162,184,.13),transparent)', animationDelay: '1.7s'}}></div></div>
              <div className="mtrend"><span className="tdn">&uarr; 28%</span><span>resolution rate</span></div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{padding: '72px 44px'}}>
          <div className="ctacard rv">
            <div className="slabel" style={{marginBottom: '18px'}}>// COMMAND READY</div>
            <h2 className="ctatitle">Deploy the Future of<br/><span style={{color: 'var(--red)'}}>Emergency Response</span></h2>
            <p className="ctadesc">Your EMT unit deserves mission-critical infrastructure. NexaMed is combat-ready &mdash; authenticate and activate the full agentic pipeline in under 60 seconds.</p>
            <div style={{display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap'}}>
              <button onClick={rippleBtn} className="btn-sos" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F680; ACTIVATE SYSTEM NOW</button>
              <button onClick={(e)=>{e.preventDefault();navigate('/login');}} className="btn-sec" onMouseEnter={onMouseEnterCursor} onMouseLeave={onMouseLeaveCursor}>&#x1F4CB; VIEW DOCUMENTATION</button>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div>NEXAMED COMMAND SYSTEM // v3.2 // AGENTIC EMT INFRASTRUCTURE</div>
        <div>&copy; 2026 NexaMed &middot; All Rights Reserved</div>
        <div style={{color: 'var(--red)'}}>SYSTEM: ONLINE</div>
      </footer>
    </div>
  );
}