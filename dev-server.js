import express from 'express';
import bodyParser from 'body-parser';
import chatHandler from './api/chat.js'; // ensure api/chat.js exports default(req,res)

const app = express();
app.use(bodyParser.json());

app.post('/api/chat', async (req, res) => {
  try {
    // If chatHandler expects (req, res) like Vercel, call it directly
    await chatHandler(req, res);
  } catch (err) {
    console.error('handler error', err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(4000, () => console.log('Dev server running at http://localhost:4000'));
