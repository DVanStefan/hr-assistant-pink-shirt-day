// HR Assistant Frontend Application
// D-ID Agents SDK + Voice Conversation with Otto

import { createAgentManager } from "https://esm.sh/@d-id/client-sdk@1.1.49";

const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5001/the-hr-assistant/us-central1/chat'
    : 'https://chat-sdwlot4qoa-uc.a.run.app';

// D-ID Configuration
const DID_CLIENT_KEY = 'YXV0aDB8Njk4MjgyNzk3YjY2NWE1YTNhNzY0MjJlOl9FMTVqdTZEQ24tQlhiVjVJbDZZdw==';
const DID_AGENT_ID = 'v2_agt_HE_SMCEn';
const KEEPALIVE_INTERVAL_MS = 45000;

const GREETING = "Hey there! I'm Otto the Otter, your Pink Shirt Day buddy. " +
    "I'm here to chat about Destination Vancouver's workplace policy on " +
    "bullying, harassment, and violence. You can talk to me or type below. " +
    "What's on your mind?";

// DOM Elements
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const transcriptMessages = document.getElementById('transcript-messages');
const avatarImage = document.getElementById('avatar-image');
const ottoVideo = document.getElementById('otto-video');
const avatarStatus = document.getElementById('avatar-status');
const micButton = document.getElementById('mic-button');
const micIcon = document.getElementById('mic-icon');
const micOffIcon = document.getElementById('mic-off-icon');
const micStatus = document.getElementById('mic-status');
const startButton = document.getElementById('start-button');
const controls = document.getElementById('controls');
const transcript = document.getElementById('transcript');
const textFallback = document.getElementById('text-fallback');

// State
let chatHistory = [];
let agentManager = null;
let srcObject = null;
let didConnected = false;
let keepaliveTimer = null;
let isKeepalive = false;
let recognition = null;
let isListening = false;
let ottoIsSpeaking = false;
let hasGreeted = false;

// ─── Speech Recognition ───

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micStatus.textContent = 'Voice not supported — use text input';
        micButton.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        micButton.classList.add('listening');
        micIcon.style.display = 'none';
        micOffIcon.style.display = 'block';
        micStatus.textContent = 'Listening...';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript.trim()) {
            handleUserMessage(transcript.trim());
        }
    };

    recognition.onerror = (event) => {
        console.log('Speech recognition error:', event.error);
        stopListening();
        if (event.error === 'not-allowed') {
            micStatus.textContent = 'Mic access denied — use text input';
        }
    };

    recognition.onend = () => {
        stopListening();
    };

    micButton.disabled = false;
    micStatus.textContent = 'Tap to talk to Otto';
}

function startListening() {
    if (isListening || ottoIsSpeaking || !recognition) return;
    try {
        recognition.start();
    } catch (e) {
        console.log('Speech recognition start error:', e);
    }
}

function stopListening() {
    isListening = false;
    micButton.classList.remove('listening');
    micIcon.style.display = 'block';
    micOffIcon.style.display = 'none';
    if (!ottoIsSpeaking) {
        micStatus.textContent = 'Tap to talk to Otto';
    }
}

// ─── Text cleaning for TTS ───

function cleanTextForSpeech(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^[\-\*\+]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, '. ')
        .replace(/\s*[—–]\s*/g, ', ')
        .replace(/\.\.\./g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ─── Keepalive ───

function startKeepalive() {
    stopKeepalive();
    keepaliveTimer = setInterval(() => {
        if (didConnected && agentManager && !ottoIsSpeaking) {
            try {
                isKeepalive = true;
                agentManager.speak({
                    type: 'text',
                    input: '<break time="1s"/>',
                    ssml: true
                });
                console.log('D-ID: Keepalive sent');
            } catch (e) {
                console.log('D-ID: Keepalive failed', e);
            }
        }
    }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepalive() {
    if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
    }
}

// ─── D-ID SDK Callbacks (single video element pattern) ───

const callbacks = {
    onSrcObjectReady(value) {
        console.log('D-ID: Stream source ready');
        srcObject = value;
    },

    onConnectionStateChange(state, reason) {
        console.log('D-ID: Connection state:', state, reason || '');

        if (state === 'connected') {
            didConnected = true;
            console.log('D-ID: Connected successfully');
            startKeepalive();

            // Show idle video immediately
            const idleUrl = agentManager?.agent?.presenter?.idle_video;
            if (idleUrl) {
                ottoVideo.srcObject = null;
                ottoVideo.src = idleUrl;
                ottoVideo.loop = true;
                ottoVideo.muted = true;
                ottoVideo.play().catch(() => {});
                ottoVideo.style.display = 'block';
                avatarImage.style.display = 'none';
            }

            // Greet after idle video loads
            if (!hasGreeted) {
                hasGreeted = true;
                ottoVideo.addEventListener('playing', function onPlaying() {
                    ottoVideo.removeEventListener('playing', onPlaying);
                    console.log('D-ID: Idle video playing, greeting...');
                    setTimeout(() => ottoGreet(), 500);
                });
            } else {
                setAvatarStatus('Ready to help!');
            }
        }

        if (state === 'disconnected' || state === 'closed') {
            didConnected = false;
            stopKeepalive();
            console.log('D-ID: Disconnected.');
            setAvatarStatus('Ready to help!');
        }

        if (state === 'fail') {
            didConnected = false;
            stopKeepalive();
            setAvatarStatus('Ready to help!');
            console.error('D-ID: Connection failed', reason);
            ottoVideo.style.display = 'none';
            avatarImage.style.display = 'block';
        }
    },

    onVideoStateChange(state) {
        if (isKeepalive) {
            if (state === 'STOP') isKeepalive = false;
            return;
        }

        console.log('D-ID: Video state:', state);

        if (state === 'START') {
            // Switch from idle video URL to live WebRTC stream
            ottoIsSpeaking = true;
            ottoVideo.loop = false;
            ottoVideo.src = '';
            ottoVideo.srcObject = srcObject;
            ottoVideo.muted = false;
            micStatus.textContent = 'Otto is speaking...';
        } else {
            // Switch back to idle video
            ottoIsSpeaking = false;
            const idleUrl = agentManager?.agent?.presenter?.idle_video;
            if (idleUrl) {
                ottoVideo.srcObject = null;
                ottoVideo.src = idleUrl;
                ottoVideo.loop = true;
                ottoVideo.muted = true;
                ottoVideo.play().catch(() => {});
            }
            setAvatarStatus('Ready to help!');
            micStatus.textContent = 'Tap to talk to Otto';
        }
    },

    onError(error, errorData) {
        console.error('D-ID Error:', error.message, errorData);
        isKeepalive = false;
        ottoIsSpeaking = false;
        setAvatarStatus('Ready to help!');
    }
};

// ─── Otto's greeting ───

function ottoGreet() {
    setAvatarStatus('Speaking...');
    addTranscript(GREETING, 'assistant');

    if (didConnected && agentManager) {
        try {
            console.log('D-ID: Speaking greeting...');
            agentManager.speak({ type: 'text', input: GREETING });
        } catch (e) {
            console.error('D-ID greeting error:', e);
            setAvatarStatus('Ready to help!');
        }
    }
}

// ─── D-ID Init ───

async function initDIDAgent() {
    if (agentManager) {
        try { agentManager.disconnect(); } catch (e) { /* ignore */ }
        agentManager = null;
    }

    try {
        setAvatarStatus('Connecting...');
        console.log('D-ID: Creating agent manager...');

        agentManager = await createAgentManager(DID_AGENT_ID, {
            auth: { type: 'key', clientKey: DID_CLIENT_KEY },
            callbacks,
            streamOptions: {
                compatibilityMode: 'off',
                streamWarmup: false
            }
        });

        console.log('D-ID: Agent manager created, connecting...');
        await agentManager.connect();
    } catch (error) {
        console.error('D-ID: Failed to initialize:', error);
        setAvatarStatus('Ready to help!');
        ottoVideo.style.display = 'none';
        avatarImage.style.display = 'block';
    }
}

async function ensureConnected() {
    if (didConnected && agentManager) return true;
    console.log('D-ID: Reconnecting for message...');
    await initDIDAgent();
    return didConnected;
}

// ─── Message handling ───

async function handleUserMessage(message) {
    addTranscript(message, 'user');
    setAvatarStatus('Thinking...');
    micStatus.textContent = 'Otto is thinking...';
    setInputState(false);

    try {
        const [response] = await Promise.all([
            sendMessage(message),
            !didConnected ? ensureConnected() : Promise.resolve()
        ]);
        addTranscript(response.text, 'assistant');

        if (didConnected && agentManager) {
            try {
                setAvatarStatus('Speaking...');
                const spokenText = cleanTextForSpeech(response.text);
                agentManager.speak({ type: 'text', input: spokenText });
            } catch (speakError) {
                console.error('D-ID speak error:', speakError);
                setAvatarStatus('Ready to help!');
            }
        } else {
            setAvatarStatus('Ready to help!');
        }

        chatHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: response.text }
        );

    } catch (error) {
        console.error('Error:', error);
        addTranscript('Sorry, I had trouble with that. Could you try again?', 'assistant');
        setAvatarStatus('Ready to help!');
    }

    setInputState(true);
}

async function sendMessage(message) {
    const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: chatHistory }),
    });

    if (!response.ok) throw new Error('Failed to get response');
    return response.json();
}

// ─── Transcript ───

function addTranscript(text, role) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    transcriptMessages.appendChild(div);
    transcriptMessages.parentElement.scrollTop = transcriptMessages.parentElement.scrollHeight;
}

// ─── UI helpers ───

function setInputState(enabled) {
    userInput.disabled = !enabled;
    sendButton.disabled = !enabled;
    micButton.disabled = !enabled;
}

function setAvatarStatus(status) {
    avatarStatus.textContent = status;
}

// ─── Init ───

// Start everything on user click (required for browser autoplay policy)
async function startConversation() {
    startButton.style.display = 'none';
    setAvatarStatus('Connecting...');

    // Show controls
    controls.style.display = '';
    transcript.style.display = '';
    textFallback.style.display = '';

    initSpeechRecognition();
    await initDIDAgent();
}

document.addEventListener('DOMContentLoaded', () => {
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (!message) return;
        userInput.value = '';
        handleUserMessage(message);
    });

    micButton.addEventListener('click', () => {
        if (isListening) {
            recognition?.stop();
        } else {
            startListening();
        }
    });

    startButton.addEventListener('click', startConversation);
});
