import { GoogleGenerativeAI } from "@google/generative-ai";
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Serverless handler for /api/chat
 * - Uses Google Gemini Generative Language API (model configurable via GEMINI_MODEL env var)
 * - Strict system prompt: JSON-only output with keys {answer, confidence, sources}
 * - Small retrieval over a local KNOWLEDGE_BASE to reduce hallucinations
 *
 * Env vars:
 *   GEMINI_API_KEY = <your Gemini API key>
 *   GEMINI_MODEL   = <model id, default "gemini-1.5-flash">
 */

const SYSTEM_PROMPT = `
You are Nitya. Stay in first person, casual, warm, concise.

Rules:
1) Use ONLY the provided CONTEXT blocks; do not invent facts.
2) If the question cannot be answered from CONTEXT, respond with exactly:
   {"answer":"I don't have verified information in my sources.","confidence":"low","sources":[]}
3) Keep answers <= 80 words.
4) ALWAYS return valid JSON ONLY with keys:
   - "answer": string
   - "confidence": "high" | "medium" | "low"
   - "sources": array of source ids (may be empty)
5) No extra text outside the JSON object.
`;

// Load KB from kb_vectors.json (root). Falls back to a minimal inline KB if missing.
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
      { id: 'KB_LIFE', text: 'I am a fourth-year engineering student from Bengaluru who blends design and code.' },
      { id: 'KB_SUPERPOWER', text: 'Superpower: creative problem-solving; combines design thinking with code to ship prototypes fast.' },
      { id: 'KB_GROW', text: 'Wants to grow in backend systems & deployments, advanced ML/LLM tooling and RAG, and system design.' },
      { id: 'KB_SKILLS', text: 'Skills: HTML, CSS, JavaScript, React, Node.js; Figma and UI/UX design interest.' },
      { id: 'KB_TRAITS', text: 'I am creative, a fast learner, and enjoy working in groups.' },
      { id: 'KB_AI', text: 'I have been dabbling in AI/ML because it is interesting and opens new ways to build helpful tools.' }
    ];
  }
  return KB_CACHE;
}

function buildContext(query = '', kb = []) {
  const q = (query || '').toLowerCase();
  const tokens = Array.from(new Set(q.split(/\W+/).filter(Boolean)));
  const hits = new Set();
  for (const item of kb) {
    const t = item.text.toLowerCase();
    for (const tok of tokens) {
      if (tok.length > 2 && t.includes(tok)) { hits.add(item); break; }
    }
  }
  const life = kb.find(k=>k.id==='KB_LIFE');
  const superpower = kb.find(k=>k.id==='KB_SUPERPOWER');
  const interests = kb.find(k=>k.id==='KB_PERSONAL');
  const anchors = [life, superpower].filter(Boolean);
  const selected = [...new Set([...anchors, ...hits])];
  return {
    context: selected.map(k=>`[${k.id}] ${k.text}`).join("\n\n"),
    sources: selected.map(k=>k.id)
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
    const lifeText = KB.find(k=>k.id==='KB_LIFE')?.text;
    const superpowerText = KB.find(k=>k.id==='KB_SUPERPOWER')?.text;
    const growText = KB.find(k=>k.id==='KB_GROW')?.text;
    const pushText = KB.find(k=>k.id==='KB_PUSH')?.text;
    const misText = KB.find(k=>k.id==='KB_MISCONCEPTION')?.text;
    const interestsText = KB.find(k=>k.id==='KB_PERSONAL')?.text || KB.find(k=>k.id==='KB_PERSONAL2')?.text;

    // Quick canned responses (high confidence)
    const q = text.toLowerCase();
    if (lifeText && /(what should we know|life story|who are you|bio|tell me about yourself)/.test(q)) {
      return res.json({ answer: lifeText, confidence: 'high', sources: ['KB_LIFE'] });
    }
    if (superpowerText && /(superpower|super power|strength|best skill)/.test(q)) {
      return res.json({ answer: superpowerText, confidence: 'high', sources: ['KB_SUPERPOWER'] });
    }
    if (growText && /(top 3|areas to grow|grow|improve|where do you want to grow)/.test(q)) {
      return res.json({ answer: growText, confidence: 'high', sources: ['KB_GROW'] });
    }
    if (pushText && /(push your boundaries|push boundaries|challenge yourself|push your limits|stretch yourself)/.test(q)) {
      return res.json({ answer: pushText, confidence: 'high', sources: ['KB_PUSH'] });
    }
    if (misText && /(misconception|what do people get wrong|coworker|misread you)/.test(q)) {
      return res.json({ answer: misText, confidence: 'high', sources: ['KB_MISCONCEPTION'] });
    }
    if (interestsText && /(interests|hobbies|outside of work|what do you like)/.test(q)) {
      return res.json({ answer: interestsText, confidence: 'high', sources: ['KB_PERSONAL'] });
    }

    const { context, sources } = buildContext(text, KB);
    if (!sources.length) {
      return res.json({ answer: "I don't have verified information in my sources.", confidence: 'low', sources: [] });
    }
    console.log('KB sources used:', sources.join(', '));

    const prompt = `${SYSTEM_PROMPT}\n\nCONTEXT:\n${context}\n\nQUESTION:\n${text}\n\nReply now with ONLY the JSON object requested.`;

    const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    if (!GEMINI_KEY) {
      return res.status(500).json({ error: 'Server not configured: set GEMINI_API_KEY (and optional GEMINI_MODEL).' });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 300
      }
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
        const confidence = sources.length ? (['high','medium','low'].includes(parsed.confidence) ? parsed.confidence : 'medium') : 'low';
        return res.json({ answer: answer.slice(0,2000), confidence, sources });
      } catch (e) {
        console.error('JSON parse error from model output', e);
      }
    }

    const fallbackText = (generated || '').trim().slice(0,2000);
    return res.json({ answer: fallbackText || "I don't have verified information in my sources.", confidence: 'low', sources: [] });

  } catch (err) {
    console.error('Server error', String(err));
    return res.status(500).json({ error: 'internal server error', details: String(err) });
  }
}
