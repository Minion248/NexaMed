import React, { useState, useEffect } from 'react';
import { 
  Search, MapPin, Activity, Shield, AlertCircle, 
  Navigation, Phone, Clock, Brain, Globe, 
  Heart, Star, ChevronRight, Zap, Users,
  BarChart3, Settings, LogOut, Bell
} from 'lucide-react';

// --- Types ---
interface Hospital {
  id: number;
  name: string;
  distance: string;
  beds: number;
  load: 'Low' | 'Medium' | 'High';
  rating: number;
  specialty: string;
  phone: string;
  eta: string;
}

export default function Dashboard() {
  const [loc, setLoc] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  
  // Professional Mock Data - Replace with your API fetch later
  const [hospitals, setHospitals] = useState<Hospital[]>([
    { id: 1, name: "Mayo Hospital Central", distance: "2.4 km", beds: 12, load: 'Medium', rating: 4.8, specialty: "Trauma Care", phone: "+92 42 99211100", eta: "8 mins" },
    { id: 2, name: "Jinnah Emergency Wing", distance: "5.1 km", beds: 4, load: 'High', rating: 4.5, specialty: "Cardiac", phone: "+92 42 99231400", eta: "14 mins" },
    { id: 3, name: "Lahore General Care", distance: "8.7 km", beds: 25, load: 'Low', rating: 4.2, specialty: "General", phone: "+92 42 99264036", eta: "19 mins" },
    { id: 4, name: "Sheikh Zayed Medical", distance: "3.2 km", beds: 8, load: 'Low', rating: 4.9, specialty: "Multi-Specialty", phone: "+92 42 35865731", eta: "10 mins" },
  ]);

  // --- Fixed Professional Location Logic ---
  const getLiveLocation = () => {
    setLoading(true);
    setErr('');
    if (!navigator.geolocation) {
      setErr("GPS not supported by browser.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // Free OpenStreetMap Geocoder
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const cityName = data.address.city || data.address.town || data.address.suburb || "Lahore";
          setLoc(cityName);
          triggerAIAnalysis();
        } catch (e) {
          setLoc("Lahore, Pakistan");
        }
        setLoading(false);
      },
      () => {
        setErr("Permission denied. Enable GPS to sync.");
        setLoading(false);
      }
    );
  };

  const triggerAIAnalysis = () => {
    setAiAnalyzing(true);
    // Simulate AI Agent processing data
    setTimeout(() => setAiAnalyzing(false), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 animate-in fade-in duration-700">
      
      {/* Header Stat Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl backdrop-blur-md">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active Units</p>
          <h3 className="text-2xl font-bold text-white">24 <span className="text-xs text-emerald-500 font-normal">Online</span></h3>
        </div>
        <div className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl backdrop-blur-md">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Avg Response</p>
          <h3 className="text-2xl font-bold text-white">12.4 <span className="text-xs text-slate-500 font-normal">mins</span></h3>
        </div>
        <div className="bg-slate-900/50 border border-white/5 p-4 rounded-2xl backdrop-blur-md">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">AI Accuracy</p>
          <h3 className="text-2xl font-bold text-white">99.2%</h3>
        </div>
        <div className="bg-emerald-600/20 border border-emerald-500/20 p-4 rounded-2xl backdrop-blur-md">
          <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">System Status</p>
          <h3 className="text-2xl font-bold text-white">Optimal</h3>
        </div>
      </div>

      {/* Control Row */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Dispatch Center</h1>
          <p className="text-slate-400">Agentic AI Routing for <span className="text-emerald-400 font-semibold">{loc || 'Regional Zones'}</span></p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          <div className="relative flex-grow lg:w-96">
            <Search className="absolute left-3 top-3.5 text-slate-500" size={18} />
            <input 
              type="text" 
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              placeholder="Search emergency zone..."
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all"
            />
          </div>
          <button 
            onClick={getLiveLocation}
            className="px-6 py-3 bg-white text-slate-950 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all active:scale-95 shadow-lg shadow-white/5"
          >
            <Navigation size={18} className={loading ? "animate-spin" : ""} />
            {loading ? "Locating..." : "Sync GPS"}
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 flex items-center gap-3 animate-bounce">
          <AlertCircle size={20} /> {err}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT: AI Analytics & Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-emerald-500/20 rounded-2xl">
                  <Brain className="text-emerald-400" size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Nexa Agent</h3>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-2 py-0.5 rounded-full uppercase">Neural Sync Active</span>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-sm">
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-slate-400 flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> Computing Path</span>
                    <span className="text-white font-mono">0.02s</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 w-[95%] h-full"></div>
                  </div>
                </div>

                <div className="p-5 bg-white/5 rounded-3xl border border-white/5 backdrop-blur-sm">
                  <div className="flex justify-between text-sm mb-3">
                    <span className="text-slate-400 flex items-center gap-2"><Users size={14} className="text-cyan-400" /> Hospital Load</span>
                    <span className="text-white font-mono">Balanced</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 w-[40%] h-full"></div>
                  </div>
                </div>
              </div>

              <button 
                onClick={triggerAIAnalysis}
                className={`w-full mt-8 py-5 rounded-[2rem] font-black tracking-widest uppercase text-sm transition-all flex items-center justify-center gap-3 shadow-xl ${
                  aiAnalyzing 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40 hover:-translate-y-1'
                }`}
              >
                {aiAnalyzing ? (
                  <> <Activity className="animate-pulse" size={18} /> Analyzing...</>
                ) : (
                  <> <Zap size={18} /> Re-Route AI</>
                )}
              </button>
            </div>
            {/* Background decoration */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-emerald-500/10 blur-[80px]"></div>
          </div>

          <div className="bg-slate-900/50 border border-white/5 p-6 rounded-[2.5rem]">
             <h4 className="text-white font-bold mb-6 flex items-center gap-2 px-2">
               <Activity size={18} className="text-emerald-500" /> Real-time Nodes
             </h4>
             <div className="space-y-4">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-2xl transition-colors">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <div className="flex-grow">
                      <p className="text-white text-sm font-semibold">Node {i * 104} - PK</p>
                      <p className="text-slate-500 text-[10px]">Data Stream Active</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* RIGHT: Results & Hospital Hub */}
        <div className="lg:col-span-8">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
             {['all', 'nearest', 'low-load', 'top-rated'].map((tab) => (
               <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                  activeTab === tab 
                  ? 'bg-emerald-600 border-emerald-500 text-white' 
                  : 'bg-slate-900 border-white/5 text-slate-400 hover:border-white/20'
                }`}
               >
                 {tab.replace('-', ' ').toUpperCase()}
               </button>
             ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {hospitals.map((h) => (
              <div key={h.id} className="group bg-slate-900/40 border border-white/5 p-7 rounded-[2.5rem] hover:bg-slate-900/80 hover:border-emerald-500/30 transition-all duration-500 backdrop-blur-sm relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h4 className="text-xl font-extrabold text-white group-hover:text-emerald-400 transition-colors">{h.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 font-bold"><MapPin size={12} /> {h.distance}</span>
                        <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold"><Clock size={12} /> {h.eta}</span>
                      </div>
                    </div>
                    <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      h.load === 'Low' ? 'bg-emerald-500/10 text-emerald-400' : 
                      h.load === 'Medium' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {h.load} Load
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white/5 p-4 rounded-3xl border border-white/5 text-center">
                      <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Available Beds</p>
                      <p className="text-2xl font-black text-white">{h.beds}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-3xl border border-white/5 text-center">
                      <p className="text-[9px] text-slate-500 uppercase font-black mb-1">Expertise</p>
                      <p className="text-xs font-bold text-white mt-1.5">{h.specialty}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                     <button className="flex-grow py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-white/5">
                       <Phone size={14} /> Call Dispatch
                     </button>
                     <button className="h-14 w-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl transition-all flex items-center justify-center shadow-lg shadow-emerald-900/20 group-hover:scale-105 active:scale-95">
                       <ChevronRight size={24} />
                     </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {hospitals.length === 0 && (
            <div className="h-[450px] bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-[3rem] flex flex-col items-center justify-center text-slate-500">
               <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <Globe className="animate-spin-slow" size={24} />
               </div>
               <p className="font-bold">Waiting for Location Sync...</p>
               <p className="text-xs mt-2 opacity-50">Enter a city to visualize AI routing</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}