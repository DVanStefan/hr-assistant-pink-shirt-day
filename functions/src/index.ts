import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import cors from 'cors';
import { handleChat } from './chat';

// Define secrets
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Initialize CORS middleware
const corsHandler = cors({ origin: true });

// Main chat endpoint
export const chat = onRequest(
    { secrets: [openaiApiKey] },
    (req, res) => {
        corsHandler(req, res, async () => {
            if (req.method !== 'POST') {
                res.status(405).json({ error: 'Method not allowed' });
                return;
            }

            try {
                const { message, history } = req.body;

                if (!message) {
                    res.status(400).json({ error: 'Message is required' });
                    return;
                }

                // Get chat response from OpenAI
                const chatResponse = await handleChat(message, history || []);

                res.json({
                    text: chatResponse
                });

            } catch (error) {
                console.error('Chat error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
);

// Health check endpoint
export const health = onRequest((req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
