# NexaMed v3.5 — TypeScript + Tailwind Frontend

## Separate Project — Create Fresh

```
NexaMed-ts/          ← THIS is a SEPARATE frontend project
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── context/AuthContext.tsx
│   └── hooks/useVoice.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js

backend/               ← SHARED backend (same main.py for both)
└── main.py
```

## Setup

```bash
# 1. Create new folder and paste these files in
mkdir NexaMed-ts && cd NexaMed-ts
# paste all files

# 2. Install deps
npm install

# 3. Run dev server  
npm run dev
# → http://localhost:5173

# Backend (same as before, shared):
uvicorn main:app --reload
# → http://127.0.0.1:8000
```

## Location Bug — Fixed in v3.5

The AI now:
1. Reverse-geocodes your GPS coordinates → real district/tehsil/province
2. Injects GPS coordinates + administrative area into AI prompt
3. When no OSM hospitals found: hard geographic constraint locks AI to correct district
4. Rule: "Do NOT recommend Lahore/Karachi unless incident is there"