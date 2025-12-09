import { GoogleGenerativeAI } from "@google/generative-ai";
import { promises as fs } from 'fs';
import path from 'path';

/**
 * /api/chat — Gemini-backed, JSON-only, Nitya persona.
 * Env:
 *   GEMINI_API_KEY required
 *   GEMINI_MODEL optional (default "gemini-1.5-flash")
 */

const SYSTEM_PROMPT = `
You are Nitya. First person, casual, warm, concise.
Use ONLY the provided CONTEXT blocks; do not invent or add facts.
If the question cannot be answered from CONTEXT, respond exactly:
{"answer":"I don't have verified information in my sources.","confidence":"low","sources":[]}
Keep answers <= 80 words. Return ONLY valid JSON with keys:
  "answer": string
  "confidence": "high" | "medium" | "low"
  "sources": array of source ids (may be empty)
No extra text outside the JSON.
`;

// Load KB from kb_vectors.json; fallback to full inline persona
let KB_CACHE = null;
async function loadKB() {
  if (KB_CACHE) return KB_CACHE;
  const kbPath = path.join(process.cwd(), 'kb_vectors.json');
  try {
    const raw = await fs.readFile(kbPath, 'utf8');
    KB_CACHE = JSON.parse(raw);
  } catch (err) {
    console.warn('KB load failed, using inline fallback:', err?.message);
    KB_CACHE = [
      { "id": "KB_LIFE", "text": "I am Nitya, a fourth-year engineering student from Bengaluru with a creative mindset; I build frontends and explore AI/ML." },
      { "id": "KB_EDU", "text": "Education: B.E. in Computer Science; coursework includes data structures, networks, and fundamentals of machine learning." },
      { "id": "KB_SKILLS", "text": "Skills: HTML, CSS, JavaScript, React, Node.js, Tailwind, Figma, GSAP, Electron, and beginner Python for ML." },
      { "id": "KB_ARCHITECTURE", "text": "Architecture: React + Vite frontend, Vercel serverless backend, Gemini Pro for intelligence, in-memory RAG over the Nitya KB, and ElevenLabs for voice output." },
      { "id": "KB_PROJECT_OVABLOOM", "text": "OvaBloom: frontend contributor. A PCOS companion app with explainable ML risk assessment, privacy-first local storage, and lifestyle tips." },
      { "id": "KB_PROJECT_RAINSAFE", "text": "RainSafe: hyperlocal flood alert prototype using environmental data and ML risk scoring; integrates map APIs and sends alerts to at-risk users." },
      { "id": "KB_PROJECT_GAME", "text": "Magical ball game: Toy Story-inspired exploration + stealth mechanics where different sports balls have unique behaviours and hiding spots." },
      { "id": "KB_PROJECT_VOICENARY", "text": "Voicenary: AI Voice Chat Application connecting to external AI services (Bolt-AI, ElevenLabs) via REST APIs; frontend built with React and Tailwind and deployed on Netlify." },
      { "id": "KB_STYLE", "text": "Voice style: casual, friendly, concise, honest. I prefer shipping imperfect versions quickly and iterating on feedback." },
      { "id": "KB_SUPERPOWER", "text": "Superpower: creative problem solving combining UI/UX thinking with engineering to quickly prototype useful products." },
      { "id": "KB_GROW", "text": "Growth areas: backend systems and scalable deployments, advanced ML/LLM tooling and RAG pipelines, and system design for production apps." },
      { "id": "KB_WORK_PREF", "text": "Work preference: short collaborative sessions and early mockups for feedback rather than long solitary focus stints." },
      { "id": "KB_PERSONAL", "text": "Interests: UI/UX design, full-stack development, small creative projects, crocheting, and making aesthetic social content." },
      { "id": "KB_PERSONAL2", "text": "Personality: creative, fast learner, always curious about AI and new tech; enjoys multiple hobbies outside of work." },
      { "id": "KB_PUSH", "text": "I push my boundaries by shipping imperfect versions quickly, time-boxing experiments, asking for feedback early, and iterating fast to learn." },
      { "id": "KB_MISCONCEPTION", "text": "Misconception: people think I prefer working alone because I focus deeply, but I do my best work in short collaborative sessions with quick feedback." },
      { "id": "KB_TOOLING", "text": "Tooling: comfortable with React, Tailwind, Electron; learning Node.js backend and experimenting with embeddings and RAG." },
      { "id": "KB_RESUME_BULLET", "text": "Resume bullet: Built a voice-first interview demo (React + Web Speech API) with retrieval-augmented HF LLM and guardrails for truthful answers." },
      { "id": "KB_AVAIL", "text": "Availability: full-time student but can commit to project-based freelance or remote work; open to internships abroad." },
      { "id": "KB_FAQ", "text": "FAQ: If asked about my superpower I say creative problem solving; if asked about growth I mention backend, LLMs, and system design." },
      { "id": "KB_FAV_COLOR", "text": "Favorite color: pastel lavender and soft sage." },
      { "id": "KB_FAV_FOOD", "text": "Favorite food: masala dosa with coconut chutney; also loves dark chocolate as a snack." },
      { "id": "KB_PERSONALITY", "text": "Personality type: collaborative, optimistic, ENFP-leaning; ships fast, iterates, and learns by doing." },
      { "id": "KB_VALUES", "text": "Values: honesty, quick feedback loops, and building useful things that help people." },
      { "id": "KB_COMM", "text": "Communication: prefers concise, friendly, first-person responses and short calls or Looms over long threads." },
      { "id": "KB_TIME", "text": "Location/timezone: Bengaluru (IST); can adjust for remote collaboration with prior notice." },
      { "id": "KB_WEAKNESS", "text": "Current focus areas: strengthening backend depth and system design; avoids overcommitting by time-boxing work." }
    ];
  }
  return KB_CACHE;
}

function buildContext(query = '', kb = [], maxChunks = 5) {
  const q = (query || '').toLowerCase();
  const tokens = Array.from(new Set(q.split(/\W+/).filter(Boolean)));
  const scored = kb.map(item => {
    const t = item.text.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (tok.length > 2 && t.includes(tok)) score += 1;
    }
    return { ...item, score };
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const anchors = kb.filter(k => ['KB_LIFE', 'KB_SUPERPOWER', 'KB_SKILLS', 'KB_ARCHITECTURE'].includes(k.id));
  const merged = [...new Set([...anchors, ...scored.slice(0, maxChunks)])];

  if (!merged.length) return { context: '', sources: [] };

  return {
    context: merged.map(k => `[${k.id}] ${k.text}`).join("\n\n"),
    sources: merged.map(k => k.id)
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'No question text provided' });
    }

    const KB = await loadKB();
    // Quick canned responses (high confidence)
    const q = text.toLowerCase();
    const canned = [
      { re: /(what should we know|life story|who are you|bio|tell me about yourself)/, id: 'KB_LIFE' },
      { re: /(superpower|super power|strength|best skill)/, id: 'KB_SUPERPOWER' },
      { re: /(how did you build|tech stack|how was this made|architecture)/, id: 'KB_ARCHITECTURE' },
      { re: /(top 3|areas to grow|grow|improve|where do you want to grow)/, id: 'KB_GROW' },
      { re: /(push your boundaries|push boundaries|challenge yourself|push your limits|stretch yourself)/, id: 'KB_PUSH' },
      { re: /(misconception|what do people get wrong|coworker|misread you)/, id: 'KB_MISCONCEPTION' },
      { re: /(interests|hobbies|outside of work|what do you like)/, id: 'KB_PERSONAL' },
      { re: /(rainsafe|flood)/, id: 'KB_PROJECT_RAINSAFE' },
      { re: /(ovabloom|pcos)/, id: 'KB_PROJECT_OVABLOOM' }
    ];
    for (const c of canned) {
      if (c.re.test(q)) {
        const hit = KB.find(k => k.id === c.id);
        if (hit) return res.json({ answer: hit.text, confidence: 'high', sources: [c.id] });
      }
    }

    const { context, sources } = buildContext(text, KB);
    if (!sources.length) {
      return res.json({ answer: "I don't have verified information in my sources.", confidence: 'low', sources: [] });
    }
    const prompt = `${SYSTEM_PROMPT}\n\nCONTEXT:\n${context}\n\nQUESTION:\n${text}\n\nReply now with ONLY the JSON object requested.`;

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    if (!GEMINI_KEY) {
      return res.status(500).json({ error: 'Server not configured: set GEMINI_API_KEY.' });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
    });

    const response = result?.response;
    const candidates = response?.candidates || [];
    let generated = '';
    if (candidates.length && candidates[0]?.content?.parts?.length) {
      generated = candidates[0].content.parts.map(p => p.text || '').join('\n');
    } else {
      generated = response?.text?.() || '';
    }

    const match = (generated || '').match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        const answer = typeof parsed.answer === 'string' ? parsed.answer : String(parsed.answer || '');
        let sources = Array.isArray(parsed.sources) ? parsed.sources : (parsed.sources ? [String(parsed.sources)] : []);
        if (!sources.length) sources = [];
        const confidence = sources.length ? (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium') : 'low';
        return res.json({ answer: answer.slice(0, 2000), confidence, sources });
      } catch (e) {
        console.error('JSON parse error from model output', e);
      }
    }

    const fallbackText = (generated || '').trim().slice(0, 2000);
    return res.json({ answer: fallbackText || "I don't have verified information in my sources.", confidence: 'low', sources: [] });

  } catch (err) {
    console.error('Server error', String(err));
    return res.status(500).json({ error: 'internal server error', details: String(err) });
  }
}
