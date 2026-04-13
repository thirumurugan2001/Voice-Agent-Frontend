import React, { useState, useRef, useEffect } from 'react';
import API_URLS  from './apiURL';

// ─── Audio Visualizer ─────────────────────────────────────────────────────────
const AudioVisualizer = ({ isPlaying, side, isDarkMode }) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const barsRef = useRef(Array.from({ length: 20 }, () => ({
    height: 4 + Math.random() * 20,
    target: 4 + Math.random() * 20,
    speed: 0.08 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
  })));

  const primaryColor = side === 'user' ? '#10b981' : '#7c3aed';
  const secondaryColor = side === 'user' ? '#34d399' : '#a78bfa';
  const dimColor = side === 'user'
    ? (isDarkMode ? 'rgba(52,211,153,0.18)' : 'rgba(16,185,129,0.12)')
    : (isDarkMode ? 'rgba(167,139,250,0.18)' : 'rgba(124,58,237,0.12)');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const bars = barsRef.current;
    let t = 0;

    // Add roundRect if not available
    if (!ctx.roundRect) {
      ctx.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x+r, y);
        this.lineTo(x+w-r, y);
        this.quadraticCurveTo(x+w, y, x+w, y+r);
        this.lineTo(x+w, y+h-r);
        this.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
        this.lineTo(x+r, y+h);
        this.quadraticCurveTo(x, y+h, x, y+h-r);
        this.lineTo(x, y+r);
        this.quadraticCurveTo(x, y, x+r, y);
        this.closePath();
        return this;
      };
    }

    const animate = () => {
      ctx.clearRect(0, 0, W, H);
      const barW = 3, gap = 2;
      const totalW = bars.length * (barW + gap) - gap;
      const startX = (W - totalW) / 2;

      bars.forEach((bar, i) => {
        if (isPlaying) {
          bar.target = 4 + Math.abs(Math.sin(t * 2.5 + bar.phase + i * 0.4)) * 22
            + Math.abs(Math.sin(t * 1.3 + i * 0.7)) * 8;
        } else {
          bar.target = 3 + Math.abs(Math.sin(bar.phase + i * 0.3)) * 4;
        }
        bar.height += (bar.target - bar.height) * bar.speed;

        const x = startX + i * (barW + gap);
        const h = bar.height;
        const y = (H - h) / 2;
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        if (isPlaying) {
          grad.addColorStop(0, primaryColor);
          grad.addColorStop(1, secondaryColor);
        } else {
          grad.addColorStop(0, dimColor);
          grad.addColorStop(1, dimColor);
        }
        ctx.beginPath();
        ctx.roundRect(x, y, barW, h, 2);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      t += 0.035;
      animRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, primaryColor, secondaryColor, dimColor]);

  return (
    <canvas ref={canvasRef} width={96} height={36} style={{ display: 'block', borderRadius: 6 }} />
  );
};

// ─── Audio Player (Controlled) ────────────────────────────────────────────────
const AudioMessage = ({
  msgId, audioUrl, side, timestamp,
  isPlaying, onRequestPlay, onRequestPause, onEnded,
  isDarkMode,
}) => {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef(null);

  // ── Sync audio element with controlled isPlaying ──
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.play().catch(e => console.warn('Playback failed:', e));
    } else {
      if (!el.paused) el.pause();
    }
  }, [isPlaying]);

  // ── RAF progress tracking ──
  useEffect(() => {
    const tick = () => {
      if (audioRef.current && isFinite(audioRef.current.currentTime))
        setCurrent(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (isPlaying) rafRef.current = requestAnimationFrame(tick);
    else cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // ── Load audio + fix Infinity duration for webm blobs ──
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    setCurrent(0);
    setDuration(0);
    el.load();

    let didSeek = false;
    const trySetDuration = () => {
      const dur = el.duration;
      if (isFinite(dur) && !isNaN(dur) && dur > 0) { setDuration(dur); return true; }
      return false;
    };
    const handleLoadedMetadata = () => {
      if (!trySetDuration() && !didSeek) { didSeek = true; el.currentTime = 1e10; }
    };
    const handleSeeked = () => {
      if (didSeek) { trySetDuration(); el.currentTime = 0; didSeek = false; }
    };
    const handleDurationChange = () => trySetDuration();
    const handleEnded = () => {
      setCurrent(0);
      cancelAnimationFrame(rafRef.current);
      onEnded?.();
    };

    el.addEventListener('loadedmetadata', handleLoadedMetadata);
    el.addEventListener('durationchange', handleDurationChange);
    el.addEventListener('seeked', handleSeeked);
    el.addEventListener('ended', handleEnded);

    return () => {
      el.pause();
      el.removeEventListener('loadedmetadata', handleLoadedMetadata);
      el.removeEventListener('durationchange', handleDurationChange);
      el.removeEventListener('seeked', handleSeeked);
      el.removeEventListener('ended', handleEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (isPlaying) {
      onRequestPause();
    } else {
      onRequestPlay(msgId);
    }
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
    setCurrent(el.currentTime);
  };

  const fmt = (s) => {
    if (!isFinite(s) || isNaN(s) || s < 0) return '00:00';
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const pct = (duration > 0 && isFinite(duration)) ? (currentTime / duration) * 100 : 0;
  const gradient = side === 'user'
    ? 'linear-gradient(135deg, #10b981, #059669)'
    : 'linear-gradient(135deg, #7c3aed, #4f46e5)';
  const progressFill = side === 'user' ? '#10b981' : '#7c3aed';
  const progressBg = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const textColor = isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
  const bgColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 14, minWidth: 220,
      background: bgColor, border: `1px solid ${borderColor}`, position: 'relative',
    }}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      <button
        onClick={togglePlay}
        style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: gradient, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.12s',
          boxShadow: isPlaying
            ? `0 0 0 4px ${side === 'user' ? 'rgba(16,185,129,0.2)' : 'rgba(124,58,237,0.2)'}`
            : 'none',
        }}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <AudioVisualizer isPlaying={isPlaying} side={side} isDarkMode={isDarkMode} />

        <div
          ref={progressRef}
          onClick={seek}
          style={{
            height: 3, borderRadius: 2, background: progressBg,
            cursor: 'pointer', position: 'relative', overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${pct}%`, background: progressFill,
            borderRadius: 2, transition: 'width 0.1s linear',
          }} />
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10, color: textColor, fontVariantNumeric: 'tabular-nums',
        }}>
          <span>{fmt(currentTime)}</span>
          <span>{duration > 0 ? fmt(duration) : '--:--'}</span>
        </div>
      </div>
    </div>
  );
};

const PlayIcon = () => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21" /></svg>
);
const PauseIcon = () => (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="#fff">
    <rect x="5" y="3" width="4" height="18" rx="1" />
    <rect x="15" y="3" width="4" height="18" rx="1" />
  </svg>
);

// ─── Hooks ────────────────────────────────────────────────────────────────────
const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.warn(e));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  return { isFullscreen, toggleFullscreen };
};

const useDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? saved === 'true' : true;
  });
  useEffect(() => {
    localStorage.setItem('darkMode', isDarkMode);
    document.documentElement.style.backgroundColor = isDarkMode ? '#0d0d14' : '#f3f4f6';
  }, [isDarkMode]);
  return { isDarkMode, toggleDarkMode: () => setIsDarkMode(p => !p) };
};

const useMobileDetect = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
};

// ─── Main Chatbot ─────────────────────────────────────────────────────────────
const VoiceChatbot = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');
  const [bars, setBars] = useState(Array(32).fill(2));

  // ── Single source of truth for which message is playing ──
  const [playingId, setPlayingId] = useState(null);

  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const isMobile = useMobileDetect();

  const recordingTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const chatEndRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isProcessing]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // ── Audio mutual exclusion handlers ──
  const handleRequestPlay = (id) => {
    setPlayingId(id);
  };

  const handleRequestPause = () => {
    setPlayingId(null);
  };

  const handleEnded = () => {
    setPlayingId(null);
  };

  const startVisualization = () => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    analyser.fftSize = 64;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      setBars(Array.from({ length: 32 }, (_, i) => Math.max(2, Math.round(((dataArray[i] || 0) / 255) * 48))));
    };
    draw();
  };

  const startRecording = async () => {
    // Stop any playing audio before recording
    setPlayingId(null);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Close existing AudioContext if any
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }
      
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Resume AudioContext if it's suspended (browser policy for mobile)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      startVisualization();

      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        // Create audio blob with proper MIME type
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(chunks, { type: mimeType });
        const userAudioUrl = URL.createObjectURL(audioBlob);
        const userMsgId = Date.now();
        const userMessage = { id: userMsgId, type: 'user', audioUrl: userAudioUrl, timestamp: new Date(), isPending: true };
        setChatHistory(prev => [...prev, userMessage]);
        setPendingUserMessage(userMessage);
        
        // Stop all tracks from the stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        
        if (audioContextRef.current) {
          await audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        setBars(Array(32).fill(2));
        await sendAudioToBackend(audioBlob, userMsgId);
      };
      
      // Request data in smaller chunks for better mobile compatibility
      recorder.start(250);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      setError('Microphone access denied. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsProcessing(true);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const sendAudioToBackend = async (audioBlob, userMsgId) => {
    try {
      // Convert blob to base64 with proper handling for mobile
      const base64Audio = await blobToBase64(audioBlob);
      // Remove data URL prefix if present
      const base64Data = base64Audio.split(',')[1] || base64Audio;
      
      const response = await fetch(API_URLS.CHATBOT.ABOUT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: base64Data, extension: '.wav' }),
      });
      if (!response.ok) throw new Error('Server error');
      const botBlob = await response.blob();
      const botAudioUrl = URL.createObjectURL(botBlob);
      const botMsgId = Date.now();
      setChatHistory(prev => {
        const updated = prev.map(msg => msg.id === userMsgId ? { ...msg, isPending: false } : msg);
        return [...updated, { id: botMsgId, type: 'bot', audioUrl: botAudioUrl, timestamp: new Date(), isPending: false }];
      });
      // FIXED: Do NOT auto-play the bot response
      // Just update state without setting playingId
      setIsProcessing(false);
      setPendingUserMessage(null);
    } catch (err) {
      console.error('API Error:', err);
      setError('Failed to reach the server.');
      setIsProcessing(false);
      setChatHistory(prev => prev.map(msg => msg.id === userMsgId ? { ...msg, isPending: false, hasError: true } : msg));
      setPendingUserMessage(null);
    }
  };

  // Helper function to convert blob to base64
  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const suggestions = [
    { id: 1, text: "Tell me about your experience as an AI Research Engineer" },
    { id: 2, text: "What are your core AI competencies and technical skills?" },
    { id: 3, text: "Can you explain your experience with RAG systems and LLM fine-tuning?" },
    { id: 4, text: "What projects have you worked on at Avasoft?" },
    { id: 5, text: "What are your strongest technical skills in AI and machine learning?" },
    { id: 6, text: "Describe your experience with LangTech translation platform" },
    { id: 7, text: "What AI frameworks and tools are you proficient with?" },
    { id: 8, text: "Explain your experience with RAG systems and vector databases" },
    { id: 9, text: "Tell me about your CloudGen drag-and-drop platform" },
    { id: 10, text: "What's your experience with AWS and Azure cloud services?" },
    { id: 11, text: "Describe your educational RAG chatbot project - LFS" },
    { id: 12, text: "What programming languages are you most comfortable with?" },
    { id: 13, text: "Tell me about your Zeb Pulse AI framework review project" },
    { id: 14, text: "What's your experience with computer vision and NLP?" },
    { id: 15, text: "Describe your PDF AI automation SaaS application" },
    { id: 16, text: "How do you handle full-stack development projects?" },
    { id: 17, text: "What's your experience with DevOps and CI/CD pipelines?" },
    { id: 18, text: "Tell me about your academic background and education" },
    { id: 19, text: "What industries have you applied AI solutions to?" },
    { id: 20, text: "Describe your experience with OpenAI GPT and Google Gemini" },
    { id: 21, text: "What's your approach to machine learning deployment?" },
    { id: 22, text: "Tell me about your RPA development experience" },
    { id: 23, text: "What are your career aspirations and future goals?" },
  ];

  const theme = {
    bgPrimary: isDarkMode ? '#0d0d14' : '#ffffff',
    bgSecondary: isDarkMode ? '#1a1a24' : '#f9fafb',
    bgTertiary: isDarkMode ? 'rgba(255,255,255,0.03)' : '#f3f4f6',
    textPrimary: isDarkMode ? '#f0f0f8' : '#111827',
    textSecondary: isDarkMode ? 'rgba(255,255,255,0.6)' : '#4b5563',
    textMuted: isDarkMode ? 'rgba(255,255,255,0.35)' : '#6b7280',
    border: isDarkMode ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
    userBubble: isDarkMode ? 'rgba(16,185,129,0.1)' : '#f0fdf9',
    userBorder: isDarkMode ? 'rgba(16,185,129,0.25)' : '#a7f3d0',
    botBubble: isDarkMode ? 'rgba(124,58,237,0.08)' : '#faf5ff',
    botBorder: isDarkMode ? 'rgba(124,58,237,0.2)' : '#e9d5ff',
  };

  const SidebarContent = () => (
    <>
      <div style={styles.sidebarTop}>
        <div style={styles.avatar}>TS</div>
        <div>
          <div style={{ ...styles.avatarName, color: theme.textPrimary }}>Thirumurugan</div>
          <div style={{ ...styles.avatarRole, color: theme.textMuted }}>AI Portfolio</div>
        </div>
      </div>
      <div style={{ ...styles.divider, background: theme.border }} />
      <div style={{ ...styles.sidebarLabel, color: theme.textMuted }}>Try asking</div>
      <div style={styles.suggestionsList}>
        {suggestions.map((s) => (
          <button key={s.id} style={{ ...styles.suggestionBtn, borderColor: theme.border, color: theme.textSecondary }} disabled>
            <span style={styles.suggestionIcon}>↗</span>
            <span style={styles.suggestionText}>{s.text}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ ...styles.statusBadge, color: theme.textMuted }}>
        <span
          style={{ ...styles.statusDot, background: isRecording ? '#f87171' : isProcessing ? '#fbbf24' : '#34d399' }}
          className={isRecording || isProcessing ? 'pulse-dot' : ''}
        />
        {isRecording ? 'Recording' : isProcessing ? 'Processing…' : 'Ready'}
      </div>
    </>
  );

  return (
    <div style={{ ...styles.root, background: theme.bgPrimary }}>
      <style>{css}</style>

      {isMobile && (
        <button onClick={() => setShowMobileSidebar(!showMobileSidebar)} style={styles.mobileMenuBtn}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {isMobile && showMobileSidebar && (
        <div style={styles.mobileOverlay} onClick={() => setShowMobileSidebar(false)}>
          <div style={{ ...styles.mobileSidebar, background: theme.bgSecondary }} onClick={e => e.stopPropagation()}>
            <div style={styles.mobileSidebarHeader}>
              <div style={styles.avatar}>TS</div>
              <div>
                <div style={{ ...styles.avatarName, color: theme.textPrimary }}>Thirumurugan</div>
                <div style={{ ...styles.avatarRole, color: theme.textMuted }}>AI Portfolio</div>
              </div>
              <button onClick={() => setShowMobileSidebar(false)} style={styles.closeBtn}>✕</button>
            </div>
            <div style={{ ...styles.divider, background: theme.border }} />
            <div style={{ ...styles.sidebarLabel, color: theme.textMuted }}>Try asking</div>
            <div style={styles.suggestionsList}>
              {suggestions.map((s) => (
                <button key={s.id} style={{ ...styles.suggestionBtn, borderColor: theme.border, color: theme.textSecondary }} disabled>
                  <span style={styles.suggestionIcon}>↗</span>
                  <span style={styles.suggestionText}>{s.text}</span>
                </button>
              ))}
            </div>
            <div style={{ ...styles.statusBadge, color: theme.textMuted }}>
              <span style={{ ...styles.statusDot, background: isRecording ? '#f87171' : isProcessing ? '#fbbf24' : '#34d399' }}
                className={isRecording || isProcessing ? 'pulse-dot' : ''} />
              {isRecording ? 'Recording' : isProcessing ? 'Processing…' : 'Ready'}
            </div>
          </div>
        </div>
      )}

      <div style={{ ...styles.layout, background: theme.bgPrimary }}>
        {!isMobile && (
          <aside style={{ ...styles.sidebar, background: theme.bgSecondary }}>
            <SidebarContent />
          </aside>
        )}

        <main style={{ ...styles.main, background: theme.bgPrimary }}>
          <header style={{ ...styles.header, borderBottomColor: theme.border, background: theme.bgPrimary }}>
            <div style={isMobile ? styles.headerTitleMobile : styles.headerTitleDesktop}>
              <div style={{ ...styles.headerTitle, color: theme.textPrimary }}>AI Voice Chat — Thirumurugan Subramaniyan</div>
              <div style={{ ...styles.headerSub, color: theme.textMuted }}>Speak naturally — ask anything about Thiru's profile</div>
            </div>
            <div style={styles.headerActions}>
              {isRecording && (
                <div style={styles.recTimer} className="fade-in">
                  <span style={styles.recDot} className="pulse-dot" />
                  {formatTime(recordingTime)}
                </div>
              )}
              <button onClick={toggleDarkMode} style={{ ...styles.iconBtn, borderColor: theme.border, background: theme.bgTertiary, color: theme.textSecondary }} className="icon-btn" title={isDarkMode ? 'Light Mode' : 'Dark Mode'}>
                {isDarkMode ? <SunIcon /> : <MoonIcon />}
              </button>
              <button onClick={toggleFullscreen} style={{ ...styles.iconBtn, borderColor: theme.border, background: theme.bgTertiary, color: theme.textSecondary }} className="icon-btn" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
                {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
              </button>
            </div>
          </header>

          <div style={{ ...styles.chatArea, background: theme.bgPrimary }}>
            {chatHistory.length === 0 && !isProcessing ? (
              <div style={styles.emptyState} className="fade-in">
                <div style={{ ...styles.emptyIcon, background: theme.bgTertiary, borderColor: theme.border }}>
                  <MicIcon size={28} color={isDarkMode ? '#a78bfa' : '#7c3aed'} />
                </div>
                <div style={{ ...styles.emptyTitle, color: theme.textSecondary }}>Start the conversation</div>
                <div style={{ ...styles.emptyText, color: theme.textMuted }}>Press the mic button and ask about Thirumurugan's background, skills, or projects.</div>
              </div>
            ) : (
              <>
                {chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    style={{ ...styles.msgRow, justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start' }}
                    className="msg-appear"
                  >
                    {msg.type === 'bot' && <div style={styles.botAvatar}>TS</div>}

                    <div style={msg.type === 'user'
                      ? { ...styles.userBubble, background: theme.userBubble, borderColor: theme.userBorder }
                      : { ...styles.botBubble, background: theme.botBubble, borderColor: theme.botBorder }
                    }>
                      {msg.type === 'user' ? (
                        <>
                          <div style={{ ...styles.userLabel, color: '#10b981' }}>
                            <span style={styles.userLabelDot} />
                            You
                            {msg.isPending && <span style={styles.pendingBadge}>• Sending...</span>}
                            {msg.hasError && <span style={styles.errorBadge}>• Failed</span>}
                          </div>
                          <AudioMessage
                            msgId={msg.id}
                            audioUrl={msg.audioUrl}
                            side="user"
                            timestamp={msg.timestamp}
                            isPlaying={playingId === msg.id}
                            onRequestPlay={handleRequestPlay}
                            onRequestPause={handleRequestPause}
                            onEnded={handleEnded}
                            isDarkMode={isDarkMode}
                          />
                          <div style={{ ...styles.bubbleTime, color: theme.textMuted }}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ ...styles.botLabel, color: '#a78bfa' }}>
                            <span style={styles.botLabelDot} />
                            Voice response
                          </div>
                          <AudioMessage
                            msgId={msg.id}
                            audioUrl={msg.audioUrl}
                            side="bot"
                            timestamp={msg.timestamp}
                            isPlaying={playingId === msg.id}
                            onRequestPlay={handleRequestPlay}
                            onRequestPause={handleRequestPause}
                            onEnded={handleEnded}
                            isDarkMode={isDarkMode}
                          />
                          <div style={{ ...styles.bubbleTime, color: theme.textMuted }}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      )}
                    </div>

                    {msg.type === 'user' && (
                      <div style={{ ...styles.userAvatarSmall, background: theme.bgTertiary, borderColor: theme.border, color: theme.textMuted }}>You</div>
                    )}
                  </div>
                ))}

                {isProcessing && !pendingUserMessage && (
                  <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }} className="msg-appear">
                    <div style={styles.botAvatar}>TS</div>
                    <div style={{ ...styles.botBubble, background: theme.botBubble, borderColor: theme.botBorder }}>
                      <div style={styles.typingDots}>
                        <span className="dot-bounce" style={{ animationDelay: '0ms', background: isDarkMode ? '#a78bfa' : '#7c3aed' }} />
                        <span className="dot-bounce" style={{ animationDelay: '160ms', background: isDarkMode ? '#a78bfa' : '#7c3aed' }} />
                        <span className="dot-bounce" style={{ animationDelay: '320ms', background: isDarkMode ? '#a78bfa' : '#7c3aed' }} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </div>

          {error && (
            <div style={styles.errorBar} className="fade-in">
              <span style={{ marginRight: 6 }}>⚠</span>{error}
            </div>
          )}

          <div style={{ ...styles.controlsArea, borderTopColor: theme.border, background: theme.bgPrimary }}>
            <div style={styles.waveform}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  ...styles.bar,
                  height: h,
                  background: isRecording
                    ? `hsl(${260 + i * 2}, 80%, ${isDarkMode ? 55 : 50}%)`
                    : isDarkMode ? 'rgba(167,139,250,0.2)' : 'rgba(124,58,237,0.15)',
                  transition: isRecording ? 'height 0.05s ease' : 'height 0.4s ease',
                }} />
              ))}
            </div>

            <div style={styles.micWrapper}>
              {!isRecording && !isProcessing && (
                <button onClick={startRecording} style={styles.micBtn} className="mic-btn">
                  <div style={styles.micRing} />
                  <MicIcon size={isMobile ? 22 : 26} color="#fff" />
                </button>
              )}
              {isRecording && (
                <button onClick={stopRecording} style={styles.stopBtn} className="mic-btn">
                  <div style={styles.stopSquare} />
                </button>
              )}
              {isProcessing && !isRecording && (
                <div style={{ ...styles.spinnerBtn, background: theme.bgTertiary, borderColor: theme.border }}>
                  <div style={{ ...styles.spinner, borderColor: isDarkMode ? 'rgba(255,255,255,0.1)' : '#e5e7eb', borderTopColor: '#7c3aed' }} className="spin" />
                </div>
              )}
            </div>

            <div style={{ ...styles.micHint, color: theme.textMuted }}>
              {isRecording ? 'Tap to stop' : isProcessing ? 'Generating response…' : 'Tap to speak'}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const FullscreenIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);
const ExitFullscreenIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
  </svg>
);
const SunIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const MoonIcon = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const MicIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    width: '100vw', height: '100vh',
    display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
  },
  mobileMenuBtn: {
    position: 'fixed', top: 16, left: 16, zIndex: 100,
    width: 40, height: 40, borderRadius: 10,
    background: 'rgba(124,58,237,0.95)', border: 'none', color: '#fff',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  mobileOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 200,
  },
  mobileSidebar: {
    position: 'absolute', top: 0, left: 0,
    width: '80%', maxWidth: 300, height: '100%',
    padding: '20px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
    overflowY: 'auto', boxShadow: '2px 0 12px rgba(0,0,0,0.2)',
  },
  mobileSidebarHeader: {
    display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
  },
  closeBtn: {
    background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666', padding: 4,
  },
  layout: { display: 'flex', width: '100%', height: '100vh', position: 'relative' },
  sidebar: {
    width: 280, flexShrink: 0, padding: '24px 16px',
    display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto',
  },
  sidebarTop: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 1, flexShrink: 0,
  },
  avatarName: { fontSize: 14, fontWeight: 600, lineHeight: 1.3 },
  avatarRole: { fontSize: 11, marginTop: 2 },
  divider: { height: 1, margin: '12px 0' },
  sidebarLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
  suggestionsList: {
    display: 'flex', flexDirection: 'column', gap: 6,
    overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none',
  },
  suggestionBtn: {
    background: 'transparent', border: '1px solid', borderRadius: 10,
    padding: '8px 10px', fontSize: 11, textAlign: 'left',
    display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4,
    opacity: 0.6, cursor: 'not-allowed',
  },
  suggestionText: { flex: 1 },
  suggestionIcon: { color: '#7c3aed', flexShrink: 0, fontSize: 12, marginTop: 1 },
  statusBadge: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, padding: '8px 0', marginTop: 8 },
  statusDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', borderBottom: '1px solid',
    flexShrink: 0, flexWrap: 'wrap', gap: 12,
  },
  headerTitleDesktop: { flex: 1 },
  headerTitleMobile: { flex: 1, paddingLeft: 48 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: 700, letterSpacing: -0.3 },
  headerSub: { fontSize: 11, marginTop: 2 },
  recTimer: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: '#fee2e2', border: '1px solid #fecaca',
    borderRadius: 20, padding: '4px 10px',
    fontSize: 12, fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums',
  },
  recDot: { width: 7, height: 7, borderRadius: '50%', background: '#dc2626', flexShrink: 0 },
  iconBtn: {
    border: '1px solid', borderRadius: 10, padding: '6px 10px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  chatArea: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0,
  },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 40,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20, border: '1px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: 600, marginTop: 4 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  botAvatar: {
    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: 0.5,
  },
  userAvatarSmall: {
    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
    border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 600,
  },
  botBubble: {
    border: '1px solid', borderRadius: '16px 16px 16px 4px',
    padding: '10px 14px', maxWidth: 480,
  },
  userBubble: {
    border: '1px solid', borderRadius: '16px 16px 4px 16px',
    padding: '10px 14px', maxWidth: 480,
  },
  bubbleTime: { fontSize: 10, textAlign: 'right', marginTop: 6 },
  botLabel: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8,
  },
  botLabelDot: { width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 },
  userLabel: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 8,
  },
  userLabelDot: { width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 },
  pendingBadge: { fontSize: 9, fontWeight: 400, color: '#f59e0b', marginLeft: 4 },
  errorBadge: { fontSize: 9, fontWeight: 400, color: '#ef4444', marginLeft: 4 },
  typingDots: { display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' },
  errorBar: {
    margin: '0 20px 8px', padding: '8px 12px',
    background: '#fef2f2', border: '1px solid #fee2e2',
    borderRadius: 10, fontSize: 12, color: '#dc2626',
    display: 'flex', alignItems: 'center', flexShrink: 0,
  },
  controlsArea: {
    borderTop: '1px solid', padding: '14px 20px 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0,
  },
  waveform: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 48, width: '100%', justifyContent: 'center' },
  bar: { width: 4, borderRadius: 4, minHeight: 2 },
  micWrapper: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  micBtn: {
    width: 60, height: 60, borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  micRing: {
    position: 'absolute', inset: -6, borderRadius: '50%',
    border: '1.5px solid #c4b5fd', pointerEvents: 'none',
  },
  stopBtn: {
    width: 60, height: 60, borderRadius: '50%',
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'transform 0.15s ease',
  },
  stopSquare: { width: 18, height: 18, borderRadius: 4, background: '#fff' },
  spinnerBtn: {
    width: 60, height: 60, borderRadius: '50%', border: '1px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: { width: 22, height: 22, borderRadius: '50%', border: '2px solid', borderTop: '2px solid #7c3aed' },
  micHint: { fontSize: 11, letterSpacing: 0.3 },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 3px; }
  .mic-btn:hover { transform: scale(1.05) !important; }
  .mic-btn:active { transform: scale(0.97) !important; }
  .icon-btn:hover { background: rgba(124,58,237,0.1) !important; border-color: #7c3aed !important; color: #7c3aed !important; }
  .fade-in { animation: fadeIn 0.3s ease forwards; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .msg-appear { animation: msgIn 0.25s ease forwards; }
  @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .dot-bounce { display: inline-block; width: 6px; height: 6px; border-radius: 50%; animation: dotBounce 1.2s infinite ease-in-out; }
  @keyframes dotBounce { 0%,80%,100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
  .pulse-dot { animation: pulseDot 1.2s infinite ease-in-out; }
  @keyframes pulseDot { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 768px) {
    .headerTitle { font-size: 15px !important; }
    .headerSub { display: none !important; }
  }
`;

export default VoiceChatbot;