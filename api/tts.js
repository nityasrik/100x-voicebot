import fetch from 'node-fetch';

/**
 * POST /api/tts
 * body: { text: string }
 * Uses ElevenLabs TTS; returns audio/mpeg stream.
 *
 * Env required:
 *  ELEVENLABS_API_KEY
 *  ELEVENLABS_VOICE_ID (e.g., "6BZyx2XekeeXOkTVn8un")
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '6BZyx2XekeeXOkTVn8un';
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.7
        },
        model_id: 'eleven_turbo_v2_5'
      })
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '<no body>');
      console.error('TTS error', resp.status, body);
      return res.status(502).json({ error: 'TTS failed', details: body });
    }

    const audio = Buffer.from(await resp.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    return res.status(200).send(audio);
  } catch (err) {
    console.error('TTS server error', err);
    return res.status(500).json({ error: 'internal server error', details: String(err) });
  }
}

