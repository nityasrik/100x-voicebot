import React, { useState, useRef } from 'react';

/**
 * Demo mode off so frontend calls the /api/chat endpoint (Gemini-backed).
 */
const DEMO_MODE = false;

const demoAnswers = {
  life: "I’m a fourth-year engineering student from Bengaluru who blends design and code. I picked up Figma and frontend early, and I’ve been dabbling in AI/ML because it’s fascinating to see ideas turn into interactive, helpful tools.",
  superpower: "My #1 superpower is creative problem-solving: I combine design thinking with code to ship simple, useful prototypes quickly and iterate based on feedback.",
  grow: "Top three areas I want to grow in are: (1) backend systems and scalable deployments, (2) advanced ML/LLM tooling and RAG pipelines, and (3) system design and architecture for production-grade apps.",
  misconception: "Many coworkers assume I prefer working alone because I’m focused; in reality I do my best work in short, collaborative sessions and by sharing early mockups to gather feedback.",
  push: "I push my boundaries by shipping imperfect versions quickly, setting small time-boxed challenges, asking for feedback, and iterating fast—this forces learning and removes perfection paralysis."
};

const LOADING_TEXT = '...';

function App() {
  const [chat, setChat] = useState([]);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('ready'); // ready | thinking | error
  const [errorMsg, setErrorMsg] = useState('');
  const [pulse, setPulse] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false); // default silent
  const chatRef = useRef();

  const append = (who, text, meta = {}) => {
    setChat(c => [...c, { who, text, ...meta }]);
    setTimeout(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, 50);
  };

  // Web Speech API
  const startListening = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('SpeechRecognition not supported in this browser. Use Chrome on desktop or Android for best support.');
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = 'en-US';
    recog.interimResults = false;
    recog.onstart = () => { setListening(true); setPulse(true); };
    recog.onend = () => { setListening(false); setPulse(false); };
    recog.onerror = (e) => {
      setListening(false);
      setPulse(false);
      console.error(e);
      alert('Microphone error: ' + (e.error || 'unknown'));
    };
    recog.onresult = async (e) => {
      const text = e.results[0][0].transcript;
      append('you', text);
      await sendToServer(text);
    };
    recog.start();
  };

  const stopListening = () => {
    setListening(false);
  };

  const sendToServer = async (text) => {
    // Normalize
    const norm = (s) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const q = norm(text);

    if (DEMO_MODE) {
      // Quick exact-phrases (more reliable)
      const phraseMatches = [
        { phrases: ['what should we know about', 'what should we know', 'tell us your life', 'give a short bio', 'who are you in a few sentences'], key: 'life' },
        { phrases: ['superpower', 'super power', 'biggest strength', 'number one strength', 'what is your strength', 'what s your superpower'], key: 'superpower' },
        { phrases: ['top 3 areas', 'top three areas', 'areas you want to grow', 'where do you want to improve', 'what skills do you want to learn'], key: 'grow' },
        { phrases: ['misconception', 'what do people get wrong', 'what do coworkers get wrong', 'how do coworkers misread you'], key: 'misconception' },
        { phrases: ['push your boundaries', 'how do you push', 'how do you challenge yourself', 'push boundaries', 'grow beyond your comfort'], key: 'push' }
      ];

      for (const pm of phraseMatches) {
        for (const p of pm.phrases) {
          if (q.includes(p)) {
            const reply = demoAnswers[pm.key];
            append('bot', reply);
            if (isVoiceMode) speak(reply);
            return;
          }
        }
      }

      // Fallback: keyword scoring (helps with short/partial phrases)
      const keywordSets = {
        life: ['life', 'story', 'bio', 'about', 'who', 'background', 'know'],
        superpower: ['superpower', 'super', 'strength', 'best', 'skill'],
        grow: ['grow', 'areas', 'improve', 'learn', 'top', 'three', '3'],
        misconception: ['misconception', 'coworker', 'people', 'wrong', 'assume', 'think'],
        push: ['push', 'challenge', 'boundary', 'limits', 'improve', 'stretch']
      };

      // compute simple scores
      const tokens = q.split(' ').filter(Boolean);
      const scores = {};
      for (const k in keywordSets) {
        scores[k] = 0;
        for (const kw of keywordSets[k]) {
          if (tokens.includes(kw)) scores[k] += 1;
        }
      }

      // choose best match if it has at least 1 hit AND is strictly greater than others
      const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      if (entries[0] && entries[0][1] > 0) {
        // ensure it's not a tie
        if (!entries[1] || entries[0][1] > entries[1][1]) {
          const best = entries[0][0];
          const reply = demoAnswers[best];
          append('bot', reply);
          if (isVoiceMode) speak(reply);
          return;
        }
      }

      // final fallback: try to interpret "what should" patterns sensibly
      if (q.startsWith('what should') || q.startsWith('what do') || q.startsWith('what s')) {
        // if user asked "what should we know" or "what should we" prefer life
        if (q.includes('know') || q.includes('about') || q.includes('your') || q.includes('life') || q.includes('story')) {
          append('bot', demoAnswers.life);
          if (isVoiceMode) speak(demoAnswers.life);
          return;
        }
      }

      // default message (unchanged)
      append('bot', "Sorry, I don't have a demo answer for that. Try the example quick prompts.");
      if (isVoiceMode) speak("Sorry, I don't have a demo answer for that. Try the example quick prompts.");
      return;
    }

    // --- live mode: calls /api/chat ---
    append('bot', LOADING_TEXT, { typing: true });
    setStatus('thinking');
    setErrorMsg('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Server error');
      }
      const j = await res.json();
      const textReply = j.answer || j.reply || JSON.stringify(j);
      setChat(c => {
        const copy = [...c];
        if (copy.length && copy[copy.length - 1].who === 'bot' && copy[copy.length - 1].text === LOADING_TEXT) {
          copy.pop();
        }
        return [...copy, { who: 'bot', text: textReply, confidence: j.confidence, sources: j.sources }];
      });
      if (isVoiceMode) speak(textReply);
      setStatus('ready');
      setErrorMsg('');
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg('Server error. Check connection or try again.');
      append('bot', 'Sorry, something went wrong while contacting the server.');
    }
  };

  const speak = async (text) => {
    // Prefer server TTS (ElevenLabs); fallback to browser speechSynthesis
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        return;
      }
    } catch (e) {
      console.warn('TTS fallback to speechSynthesis', e);
    }
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const quickAsk = async (key) => {
    const mapping = {
      life: "What should we know about your life story in a few sentences?",
      superpower: "What's your #1 superpower?",
      grow: "What are the top 3 areas you'd like to grow in?",
      misconception: "What misconception do your coworkers have about you?",
      push: "How do you push your boundaries and limits?"
    };
    const q = mapping[key];
    append('you', q);
    await sendToServer(q);
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="title">Nitya — Voice Assistant</div>
          <div className="small">Speak or type; I’ll answer and speak back.</div>
        </div>
        <div className="small" style={{display:'flex', alignItems:'center', gap:8}}>
          <span>Live: {DEMO_MODE ? 'demo' : 'Gemini'}</span>
          <span className={`pill ${status}`}>{status === 'thinking' ? 'typing…' : status}</span>
          <label className="toggle">
            <input
              type="checkbox"
              checked={isVoiceMode}
              onChange={e => setIsVoiceMode(e.target.checked)}
              aria-label="Toggle voice mode"
            />
            <span className="toggle-label">{isVoiceMode ? 'Voice' : 'Chat'}</span>
          </label>
        </div>
      </div>

      <div ref={chatRef} className="chat">
        {chat.length === 0 && <div className="small">Try a quick prompt or hold the mic.</div>}
        {chat.map((m, i) => (
          <div key={i} className={`message ${m.who === 'you' ? 'you' : 'bot'}`}>
            <strong>{m.who === 'you' ? 'You' : 'Nitya'}:</strong>{' '}
            {m.typing ? (
              <span className="typing">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </span>
            ) : (
              m.text
            )}
            <div className="message-meta">
              {m.who === 'bot' && !m.typing && (m.confidence || (m.sources && m.sources.length)) && (
                <div className="small" style={{ marginTop: 4 }}>
                  {m.confidence && <span>Confidence: {m.confidence} </span>}
                  {m.sources && m.sources.length ? <span>• Sources: {m.sources.join(', ')}</span> : null}
                </div>
              )}
              {m.who === 'bot' && !m.typing && !isVoiceMode && (
                <button
                  className="play-btn"
                  aria-label="Play this message"
                  onClick={() => speak(m.text)}
                >
                  🔊
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="input-row">
        <button
          className={`mic ghost ${pulse ? 'pulse' : ''}`}
          aria-label="Hold to speak with microphone"
          onMouseDown={startListening}
          onTouchStart={startListening}
          onMouseUp={stopListening}
          onTouchEnd={stopListening}
        >
          {listening ? 'Release to send' : 'Hold to speak'}
        </button>
        <input
          id="textInput"
          aria-label="Type a question"
          placeholder="Ask me anything..."
          style={{ flex: 1, padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', color: 'inherit' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = e.target.value.trim();
              if (v) { append('you', v); sendToServer(v); e.target.value = ''; }
            }
          }}
        />
        <button
          className="mic"
          aria-label="Send typed question"
          disabled={status === 'thinking'}
          onClick={() => {
            const el = document.getElementById('textInput');
            const v = el.value.trim();
            if (v) { append('you', v); sendToServer(v); el.value = ''; }
          }}
        >
          {status === 'thinking' ? '…' : 'Send'}
        </button>
      </div>

      <div className="quick">
        <button aria-label="Ask about life story" onClick={() => { quickAsk('life') }}>Life</button>
        <button aria-label="Ask about superpower" onClick={() => { quickAsk('superpower') }}>Superpower</button>
        <button aria-label="Ask about areas to grow" onClick={() => { quickAsk('grow') }}>Growth</button>
        <button aria-label="Ask about coworker misconception" onClick={() => quickAsk('misconception')}>Misconception</button>
        <button aria-label="Ask about pushing boundaries" onClick={() => quickAsk('push')}>Boundaries</button>
      </div>

      {errorMsg && <div className="small error-banner">{errorMsg}</div>}
    </div>
  );
}

export default App;
