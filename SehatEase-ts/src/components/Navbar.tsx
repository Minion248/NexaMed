import React from 'react';
import { Activity, Layout, Shield, Menu } from 'lucide-react';

export const Navbar = ({ onNavigate }: { onNavigate: (v: any) => void }) => (
  <nav className="fixed top-0 w-full z-50 backdrop-blur-md border-b border-white/5 bg-slate-950/50">
    <div className="container mx-auto px-6 h-20 flex items-center justify-between">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => onNavigate('landing')}>
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Activity className="text-white w-6 h-6" />
        </div>
        <span className="text-white font-bold text-2xl tracking-tight">NexaMed<span className="text-emerald-500">AI</span></span>
      </div>
      
      <div className="hidden md:flex items-center gap-8 text-slate-400 font-medium">
        <button onClick={() => onNavigate('landing')} className="hover:text-emerald-400 transition-colors">Platform</button>
        <button className="hover:text-emerald-400 transition-colors">Architecture</button>
        <button className="hover:text-emerald-400 transition-colors">Case Studies</button>
        <button 
          onClick={() => onNavigate('dashboard')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-full transition-all"
        >
          Launch System
        </button>
      </div>
    </div>
  </nav>
);