import React, { useState, useRef, useEffect } from 'react';

// ─── Audio Player Component ───────────────────────────────────────────────────
const AudioPlayer = ({ audioUrl, onEnded }) => {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef(null);

  // Auto-play when mounted
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.play().then(() => setPlaying(true)).catch(() => {});
    el.onloadedmetadata = () => setDuration(el.duration || 0);
    el.onended = () => {
      setPlaying(false);
      setCurrent(0);
      cancelAnimationFrame(rafRef.current);
      onEnded?.();
    };
    return () => { el.pause(); cancelAnimationFrame(rafRef.current); };
  }, [audioUrl]);

  // rAF-based progress ticker
  useEffect(() => {
    const tick = () => {
      if (audioRef.current) setCurrent(audioRef.current.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (playing) rafRef.current = requestAnimationFrame(tick);
    else cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
    setCurrent(el.currentTime);
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div style={playerStyles.wrap}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Play / pause */}
      <button onClick={togglePlay} style={playerStyles.playBtn} className="play-btn">
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>

      {/* Waveform-style progress bar */}
      <div style={playerStyles.right}>
        <div style={playerStyles.bars}>
          {Array.from({ length: 28 }, (_, i) => {
            const h = 6 + Math.abs(Math.sin(i * 0.7 + i * 0.3)) * 22;
            const filled = (i / 28) * 100 < pct;
            return (
              <div key={i} style={{
                ...playerStyles.wavebar,
                height: h,
                background: filled ? '#a78bfa' : 'rgba(167,139,250,0.2)',
                transition: 'background 0.1s',
              }} />
            );
          })}
          {/* Invisible click overlay */}
          <div ref={progressRef} onClick={seek} style={playerStyles.seekOverlay} />
        </div>
        <div style={playerStyles.times}>
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* Speaking pulse when playing */}
      {playing && (
        <div style={playerStyles.pulse}>
          <span className="dot-bounce" style={{ animationDelay: '0ms', background: '#a78bfa' }} />
          <span className="dot-bounce" style={{ animationDelay: '140ms', background: '#a78bfa' }} />
          <span className="dot-bounce" style={{ animationDelay: '280ms', background: '#a78bfa' }} />
        </div>
      )}
    </div>
  );
};

const PlayIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);
const PauseIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff">
    <rect x="5" y="3" width="4" height="18" rx="1" />
    <rect x="15" y="3" width="4" height="18" rx="1" />
  </svg>
);

const playerStyles = {
  wrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px',
    background: 'rgba(139,92,246,0.1)',
    border: '1px solid rgba(139,92,246,0.2)',
    borderRadius: 14,
    minWidth: 230,
    position: 'relative',
  },
  playBtn: {
    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 12px rgba(124,58,237,0.4)',
    transition: 'transform 0.12s',
  },
  right: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3 },
  bars: {
    display: 'flex', alignItems: 'flex-end', gap: 2, height: 32,
    position: 'relative', cursor: 'pointer',
  },
  wavebar: { width: 3, borderRadius: 2, flexShrink: 0 },
  seekOverlay: {
    position: 'absolute', inset: 0, cursor: 'pointer',
  },
  times: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 10, color: 'rgba(255,255,255,0.35)',
    fontVariantNumeric: 'tabular-nums',
  },
  pulse: { display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2 },
};

// ─── Main Chatbot ─────────────────────────────────────────────────────────────
const VoiceChatbot = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState('');
  const [bars, setBars] = useState(Array(32).fill(2));
  const [playingId, setPlayingId] = useState(null);
  const [userAudioUrl, setUserAudioUrl] = useState(null); // For user's recorded audio

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
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

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
    setError('');
    setTranscript('');
    setUserAudioUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      audioContextRef.current.createMediaStreamSource(stream).connect(analyserRef.current);
      startVisualization();

      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        // Create local URL for user audio playback
        const localAudioUrl = URL.createObjectURL(audioBlob);
        setUserAudioUrl(localAudioUrl);
        
        await sendAudioToBackend(audioBlob);
        stream.getTracks().forEach(t => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
        setBars(Array(32).fill(2));
        streamRef.current = null;
      };
      recorder.start(100);
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch {
      setError('Microphone access denied. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsProcessing(true);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const sendAudioToBackend = async (audioBlob) => {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        const response = await fetch('http://localhost:8000/chatbot/voice/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: base64Audio, extension: '.wav' }),
        });
        if (!response.ok) throw new Error('Server error');

        // Convert response stream → object URL for the in-chat player
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const msgId = Date.now();

        // Add both user audio and bot response to chat history
        setChatHistory(prev => [
          ...prev,
          { 
            id: msgId, 
            type: 'user', 
            audioUrl: userAudioUrl, // Store the user's recorded audio URL
            timestamp: new Date(),
            transcript: transcript 
          },
          { 
            id: msgId + 1, 
            type: 'bot', 
            audioUrl, 
            timestamp: new Date() 
          },
        ]);
        setPlayingId(msgId + 1);
        setIsProcessing(false);
        setTranscript('');
        setUserAudioUrl(null);
      };
    } catch {
      setError('Failed to reach the server. Is it running on port 8000?');
      setIsProcessing(false);
    }
  };

  const handleUserQuestion = (text) => {
    if (!text.trim()) return;
    setChatHistory(prev => [...prev, { id: Date.now(), type: 'user', text, timestamp: new Date() }]);
  };

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const suggestions = [
    'What are your technical skills?',
    'Tell me about your work experience',
    'What projects have you built?',
    'Are you available for freelance work?',
  ];

  return (
    <div style={styles.root}>
      <style>{css}</style>
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.layout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarTop}>
            <div style={styles.avatar}>TS</div>
            <div>
              <div style={styles.avatarName}>Thirumurugan</div>
              <div style={styles.avatarRole}>AI Portfolio</div>
            </div>
          </div>
          <div style={styles.divider} />
          <div style={styles.sidebarLabel}>Try asking</div>
          {suggestions.map((s, i) => (
            <button key={i} style={styles.suggestionBtn} className="suggestion-btn"
              onClick={() => handleUserQuestion(s)}>
              <span style={styles.suggestionIcon}>↗</span>{s}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={styles.statusBadge}>
            <span style={{ ...styles.statusDot, background: isRecording ? '#f87171' : isProcessing ? '#fbbf24' : '#34d399' }}
              className={isRecording || isProcessing ? 'pulse-dot' : ''} />
            {isRecording ? 'Recording' : isProcessing ? 'Processing…' : 'Ready'}
          </div>
        </aside>

        {/* Main */}
        <main style={styles.main}>
          <header style={styles.header}>
            <div>
              <div style={styles.headerTitle}>Voice Chat</div>
              <div style={styles.headerSub}>Speak naturally — ask anything about Thiru's profile</div>
            </div>
            {isRecording && (
              <div style={styles.recTimer} className="fade-in">
                <span style={styles.recDot} className="pulse-dot" />
                {formatTime(recordingTime)}
              </div>
            )}
          </header>

          {/* Chat */}
          <div style={styles.chatArea}>
            {chatHistory.length === 0 && !isProcessing ? (
              <div style={styles.emptyState} className="fade-in">
                <div style={styles.emptyIcon}><MicIcon size={28} color="#a78bfa" /></div>
                <div style={styles.emptyTitle}>Start the conversation</div>
                <div style={styles.emptyText}>Press the mic button and ask about Thirumurugan's background, skills, or projects.</div>
              </div>
            ) : (
              <>
                {chatHistory.map((msg) => (
                  <div key={msg.id}
                    style={{ ...styles.msgRow, justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start' }}
                    className="msg-appear">
                    {msg.type === 'bot' && <div style={styles.botAvatar}>TS</div>}

                    <div style={msg.type === 'user' ? styles.userBubble : styles.botBubble}>
                      {msg.type === 'user' ? (
                        <>
                          {msg.text ? (
                            <div style={styles.bubbleText}>{msg.text}</div>
                          ) : (
                            <div>
                              <div style={styles.userLabel}>
                                <span style={styles.userLabelDot} />
                                Your voice
                              </div>
                              <AudioPlayer
                                audioUrl={msg.audioUrl}
                                onEnded={() => {}}
                              />
                            </div>
                          )}
                          <div style={styles.bubbleTime}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </>
                      ) : (
                        /* Bot message — in-chat audio player */
                        <div>
                          <div style={styles.botLabel}>
                            <span style={styles.botLabelDot} />
                            Voice response
                          </div>
                          <AudioPlayer
                            audioUrl={msg.audioUrl}
                            onEnded={() => setPlayingId(null)}
                          />
                          <div style={{ ...styles.bubbleTime, marginTop: 6 }}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )}
                    </div>

                    {msg.type === 'user' && <div style={styles.userAvatarSmall}>You</div>}
                  </div>
                ))}

                {isProcessing && (
                  <div style={{ ...styles.msgRow, justifyContent: 'flex-start' }} className="msg-appear">
                    <div style={styles.botAvatar}>TS</div>
                    <div style={styles.botBubble}>
                      <div style={styles.typingDots}>
                        <span className="dot-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="dot-bounce" style={{ animationDelay: '160ms' }} />
                        <span className="dot-bounce" style={{ animationDelay: '320ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Transcript preview */}
          {transcript && (
            <div style={styles.transcriptBar} className="fade-in">
              <span style={styles.transcriptLabel}>Heard:</span>
              <span style={styles.transcriptText}>{transcript}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={styles.errorBar} className="fade-in">
              <span style={{ marginRight: 6 }}>⚠</span>{error}
            </div>
          )}

          {/* Visualizer + Controls */}
          <div style={styles.controlsArea}>
            <div style={styles.waveform}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  ...styles.bar,
                  height: h,
                  background: isRecording
                    ? `hsl(${260 + i * 2}, 80%, ${55 + h}%)`
                    : 'rgba(167,139,250,0.18)',
                  transition: isRecording ? 'height 0.05s ease' : 'height 0.4s ease',
                }} />
              ))}
            </div>

            <div style={styles.micWrapper}>
              {!isRecording && !isProcessing && (
                <button onClick={startRecording} style={styles.micBtn} className="mic-btn">
                  <div style={styles.micRing} />
                  <MicIcon size={26} color="#fff" />
                </button>
              )}
              {isRecording && (
                <button onClick={stopRecording} style={styles.stopBtn} className="mic-btn">
                  <div style={styles.stopSquare} />
                </button>
              )}
              {isProcessing && !isRecording && (
                <div style={styles.spinnerBtn}>
                  <div style={styles.spinner} className="spin" />
                </div>
              )}
            </div>

            <div style={styles.micHint}>
              {isRecording ? 'Tap to stop' : isProcessing ? 'Generating response…' : 'Tap to speak'}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const MicIcon = ({ size = 24, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

const styles = {
  root: {
    minHeight: '100vh',
    background: '#0d0d14',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    position: 'relative',
    overflow: 'hidden',
    padding: '24px',
    boxSizing: 'border-box',
  },
  orb1: {
    position: 'fixed', top: '-120px', right: '-80px',
    width: 480, height: 480,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'fixed', bottom: '-100px', left: '-60px',
    width: 360, height: 360,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  layout: {
    display: 'flex',
    width: '100%',
    maxWidth: 960,
    minHeight: 'calc(100vh - 48px)',
    borderRadius: 20,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(16,16,26,0.85)',
    backdropFilter: 'blur(24px)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
    position: 'relative',
    zIndex: 1,
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    padding: '28px 20px',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'rgba(255,255,255,0.02)',
  },
  sidebarTop: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 14,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 1,
    flexShrink: 0,
  },
  avatarName: { fontSize: 14, fontWeight: 600, color: '#f0f0f8', lineHeight: 1.3 },
  avatarRole: { fontSize: 11, color: 'rgba(255,255,255,0.38)', marginTop: 2 },
  divider: { height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' },
  sidebarLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginBottom: 4 },
  suggestionBtn: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: '8px 12px',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    lineHeight: 1.45,
    transition: 'all 0.18s ease',
  },
  suggestionIcon: { color: '#a78bfa', flexShrink: 0, fontSize: 13, marginTop: 1 },
  statusBadge: {
    display: 'flex', alignItems: 'center', gap: 7,
    fontSize: 11, color: 'rgba(255,255,255,0.4)',
    padding: '8px 0', marginTop: 8,
  },
  statusDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 28px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerTitle: { fontSize: 20, fontWeight: 700, color: '#f0f0f8', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 3 },
  recTimer: {
    display: 'flex', alignItems: 'center', gap: 7,
    background: 'rgba(248,113,113,0.12)',
    border: '1px solid rgba(248,113,113,0.25)',
    borderRadius: 20, padding: '5px 12px',
    fontSize: 13, fontWeight: 600,
    color: '#f87171', fontVariantNumeric: 'tabular-nums',
  },
  recDot: { width: 7, height: 7, borderRadius: '50%', background: '#f87171', flexShrink: 0 },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingTop: 40,
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    background: 'rgba(139,92,246,0.1)',
    border: '1px solid rgba(139,92,246,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  emptyText: { fontSize: 13, color: 'rgba(255,255,255,0.3)', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 10 },
  botAvatar: {
    width: 30, height: 30, borderRadius: 10, flexShrink: 0,
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: 0.5,
  },
  userAvatarSmall: {
    width: 30, height: 30, borderRadius: 10, flexShrink: 0,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
  },
  botBubble: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px 16px 16px 4px',
    padding: '10px 14px',
    maxWidth: 460,
  },
  userBubble: {
    background: 'linear-gradient(135deg, rgba(124,58,237,0.7), rgba(79,70,229,0.7))',
    border: '1px solid rgba(139,92,246,0.3)',
    borderRadius: '16px 16px 4px 16px',
    padding: '10px 14px',
    maxWidth: 460,
  },
  bubbleText: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 },
  bubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 4, textAlign: 'right' },
  botLabel: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#a78bfa', marginBottom: 8,
  },
  userLabel: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
    textTransform: 'uppercase', color: '#60a5fa', marginBottom: 8,
  },
  userLabelDot: { width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', flexShrink: 0 },
  botLabelDot: { width: 6, height: 6, borderRadius: '50%', background: '#a78bfa', flexShrink: 0 },
  typingDots: { display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' },
  transcriptBar: {
    margin: '0 28px 8px',
    padding: '10px 14px',
    background: 'rgba(59,130,246,0.08)',
    border: '1px solid rgba(59,130,246,0.2)',
    borderRadius: 12,
    display: 'flex', gap: 8, alignItems: 'center',
    fontSize: 13,
  },
  transcriptLabel: { color: '#60a5fa', fontWeight: 600, flexShrink: 0 },
  transcriptText: { color: 'rgba(255,255,255,0.6)' },
  errorBar: {
    margin: '0 28px 8px',
    padding: '10px 14px',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 12,
    fontSize: 13, color: '#f87171',
    display: 'flex', alignItems: 'center',
  },
  controlsArea: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    padding: '16px 28px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  waveform: {
    display: 'flex', alignItems: 'flex-end', gap: 3,
    height: 52, width: '100%', justifyContent: 'center',
  },
  bar: { width: 4, borderRadius: 4, minHeight: 2 },
  micWrapper: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  micBtn: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    boxShadow: '0 0 28px rgba(124,58,237,0.45)',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  micRing: {
    position: 'absolute', inset: -8,
    borderRadius: '50%',
    border: '1.5px solid rgba(167,139,250,0.35)',
    pointerEvents: 'none',
  },
  stopBtn: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 28px rgba(239,68,68,0.4)',
    transition: 'transform 0.15s ease',
  },
  stopSquare: { width: 18, height: 18, borderRadius: 4, background: '#fff' },
  spinnerBtn: {
    width: 64, height: 64, borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 24, height: 24, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.1)',
    borderTop: '2px solid #a78bfa',
  },
  micHint: { fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.3 },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
  .play-btn:hover { transform: scale(1.1); }
  .play-btn:active { transform: scale(0.95); }
  .suggestion-btn:hover {
    background: rgba(139,92,246,0.1) !important;
    border-color: rgba(139,92,246,0.3) !important;
    color: rgba(255,255,255,0.75) !important;
  }
  .mic-btn:hover { transform: scale(1.06) !important; }
  .mic-btn:active { transform: scale(0.97) !important; }
  .fade-in { animation: fadeIn 0.3s ease forwards; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .msg-appear { animation: msgIn 0.25s ease forwards; }
  @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .dot-bounce {
    display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: rgba(167,139,250,0.7);
    animation: dotBounce 1.2s infinite ease-in-out;
  }
  @keyframes dotBounce {
    0%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-8px); }
  }
  .pulse-dot {
    animation: pulseDot 1.2s infinite ease-in-out;
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.7); }
  }
  .spin { animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

export default VoiceChatbot;