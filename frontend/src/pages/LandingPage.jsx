import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.css';
const LandingPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // This replicates your 'window.onload' logic from the HTML
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('in');
        });
      },
      { threshold: 0.07 }
    );

    document.querySelectorAll('.rv').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="landing-container" style={{ background: '#08090c', minHeight: '100vh', color: 'white' }}>
      {/* 1. Add your front.html CSS here or move it to a .css file */}
      <style>{`
        .hbtn { padding: 12px 24px; background: #ef4444; color: white; border-radius: 8px; cursor: pointer; border: none; font-weight: bold; }
        .rv { opacity: 0; transform: translateY(20px); transition: all 0.8s ease-out; }
        .rv.in { opacity: 1; transform: translateY(0); }
        /* Add the rest of your front.html styles here */
      `}</style>

      <div className="hero-section rv" style={{ textAlign: 'center', paddingTop: '100px' }}>
        <h1>NexaMed — Emergency Intelligence</h1>
        <p>Advanced AI-Triage & EMT Assistance</p>
        
        {/* 2. THE ROUTING LINK */}
        <button 
          className="hbtn" 
          onClick={() => navigate('/login')}
          style={{ marginTop: '20px' }}
        >
          LAUNCH SYSTEM
        </button>
      </div>

      {/* Paste the rest of your front.html <body> content here */}
    </div>
  );
};

export default LandingPage;