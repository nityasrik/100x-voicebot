import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Get the text (Change const to let so we can clean it)
    let { text } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });

    // 2. CLEAN THE TEXT (The "Anti-Robot" Fix)
    // This removes Markdown, JSON, and special characters before sending to voice
    text = text.replace(/```json/g, "")      // Remove ```json tag
      .replace(/```/g, "")          // Remove backticks
      .replace(/{/g, "")            // Remove curly braces
      .replace(/}/g, "")            // Remove curly braces
      .replace(/"answer":/g, "")    // Remove "answer": label
      .replace(/Confidence: low/g, "")
      .replace(/\\n/g, " ")         // Remove newlines
      .trim();                      // Remove extra spaces

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });

    // 3. SET YOUR NEW VOICE ID HERE
    // Using the ID you found: m8ysB8KEJV5BeYQnOtWN
    const voiceId = 'm8ysB8KEJV5BeYQnOtWN';

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text, // We are sending the CLEAN text now
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