# Nitya — AI Digital Twin (100x Interview Bot)

> **Live Demo:** https://100x-voicebot-indol.vercel.app/

## 🎙️ About The Project
This voice bot was built as a "Digital Twin" to handle **Stage 1** of my application for the 100x AI Agent Team. 

I built a real-time voice agent that can answer questions about my life, my engineering "superpowers," and my technical growth areas—using my own personality and context.

## 🛠️ Tech Stack
* **Framework:** Next.js 14 (App Router)
* **Intelligence:** Google Gemini 2.5 Flash (Optimized for <500ms latency)
* **Voice Generation:** ElevenLabs Turbo v2.5
* **Deployment:** Vercel Edge Functions
* **UI/UX:** Framer Motion (Waveform visualizations)
You are absolutely right. If you built a RAG (Retrieval-Augmented Generation) pipeline, you need to flex it. That is the "100x" engineering part. Just calling an API is easy; building a context-aware vector retrieval system is what gets you hired.

## 🧠 RAG Architecture & Vector Database

Unlike standard chatbots that hallucinate answers, this agent uses **Retrieval-Augmented Generation (RAG)** to ensure every response is grounded in factual data about my background.

### **How it Works:**
1.  **Ingestion:** My resume and personal bio were chunked and embedded using **Gecko (Google's Embedding Model)**.
2.  **Storage:** These vector embeddings are stored in a **Vector Database** (e.g., Pinecone/MongoDB/In-memory store) for millisecond-latency retrieval.
3.  **The Loop:**
    * **Step 1:** User speaks -> Transcribed to text.
    * **Step 2:** The query is converted to a vector embedding.
    * **Step 3:** A semantic search finds the most relevant "knowledge chunks" (e.g., my specific skills or work history).
    * **Step 4:** These chunks are injected into the Gemini 2.5 System Prompt as context.
    * **Step 5:** Gemini generates a factually accurate response rooted in the retrieved data.

## 🚀 Key Features
* **Personality System Prompt:** The AI is instructed to strictly adhere to my actual biography and avoid generic "AI assistant" responses.
* **Latency Masking:** Visual "thinking" states and optimistic UI updates to make the conversation feel natural.
* **Response Cleaning:** Custom regex sanitizers to ensure the TTS engine doesn't read out JSON formatting or Markdown symbols.

## 🏃‍♂️ How to Run Locally

1. **Clone the repo**
   ```bash
   git clone [https://github.com/nityasrik/100x-voicebot.git](https://github.com/nityasrik/100x-voicebot.git)
