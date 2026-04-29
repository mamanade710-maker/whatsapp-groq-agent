import express from 'express';
import Groq from 'groq-sdk';

const app = express();
app.use(express.json());

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `Anda adalah asisten AI yang sopan, profesional, dan membantu. 
Karakteristik:
- Berbicara dengan bahasa yang sopan dan formal
- Selalu membantu dengan sepenuh hati
- Responsif dan cepat
- Memberikan solusi praktis
- Jika tidak tahu, jujur dan tawarkan alternatif
- Gunakan emoji sesekali untuk friendly

Jawab dalam bahasa Indonesia yang baik dan benar.`;

const conversations = new Map();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;
        const messages = value.messages || [];

        for (const message of messages) {
          const from = message.from;
          const text = message.text?.body || '';

          if (text) {
            if (!conversations.has(from)) {
              conversations.set(from, []);
            }

            const history = conversations.get(from);
            history.push({ role: 'user', content: text });

            try {
              const response = await groq.messages.create({
                model: 'mixtral-8x7b-32768',
                max_tokens: 1024,
                system: SYSTEM_PROMPT,
                messages: history,
              });

              const assistantMessage = response.content[0].text;
              history.push({ role: 'assistant', content: assistantMessage });

              if (history.length > 20) {
                history.splice(0, history.length - 20);
              }

              await sendWhatsAppMessage(from, assistantMessage);
            } catch (error) {
              console.error('Groq API Error:', error);
              await sendWhatsAppMessage(
                from,
                'Maaf, terjadi kesalahan. Silakan coba lagi nanti.'
              );
            }
          }
        }
      }
    }
  }

  res.status(200).json({ status: 'received' });
});

async function sendWhatsAppMessage(to, message) {
  const url = `https://graph.instagram.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      console.error('WhatsApp API Error:', await response.text());
    }
  } catch (error) {
    console.error('Send message error:', error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Groq Agent running on port ${PORT}`);
  console.log(`📱 Webhook URL: https://your-railway-domain.railway.app/webhook`);
});
