import React from 'react';
// Added Shield to the import list below
import { ArrowRight, Play, CheckCircle, Shield } from 'lucide-react';

export const Hero = ({ onStart }: { onStart: () => void }) => (
  <div className="relative pt-40 pb-20 lg:pt-56 lg:pb-32 bg-slate-950 overflow-hidden">
    <div className="container mx-auto px-6 relative z-10 text-center">
      {/* The Shield icon now works because it is imported above */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8 animate-fade-in">
        <Shield size={16} /> Now deployed for Punjab EMS Beta
      </div>
      
      <h1 className="text-6xl lg:text-8xl font-bold text-white mb-8 tracking-tighter leading-[1.1]">
        Emergency Response <br />
        <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Re-imagined with AI.</span>
      </h1>
      
      <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
        Autonomous dispatcher system using Agentic AI to reduce ambulance response times by 40% through real-time geolocation and hospital load balancing.
      </p>
      
      <div className="flex flex-col sm:flex-row gap-5 justify-center">
        <button onClick={onStart} className="group px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold transition-all flex items-center justify-center gap-2 text-lg">
          Get Started <ArrowRight className="group-hover:translate-x-1 transition-transform" />
        </button>
        <button className="px-8 py-4 bg-slate-900 text-white rounded-full font-bold border border-slate-800 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-lg">
          <Play size={18} fill="currentColor" /> Watch Demo
        </button>
      </div>
    </div>
    
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_30%_20%,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent opacity-50"></div>
  </div>
);