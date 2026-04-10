const fs = require('fs');
const path = require('path');
const express = require('express');
const pino = require('pino');
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  delay
} = require('@whiskeysockets/baileys');

const settings = require('../setting');
const logger = require('../utils/logger');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, '..', 'lib')));

const sessionRoot = path.join(__dirname, 'auth_info_baileys');
const credsPath = path.join(sessionRoot, 'creds.json');
const statusPath = path.join(__dirname, '..', 'session_status.json');

let pairingCode = null;
let socketReady = false;

function writeStatus(update) {
  let current = {};
  if (fs.existsSync(statusPath)) {
    try {
      current = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    } catch {
      current = {};
    }
  }
  fs.writeFileSync(statusPath, JSON.stringify({ ...current, ...update }, null, 2));
}

async function buildSocket(phoneNumber) {
  fs.mkdirSync(sessionRoot, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionRoot);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['KLAUS Session', 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection }) => {
    if (connection === 'open') {
      socketReady = true;
      logger.session('Session linked successfully.');
    }
  });

  await delay(1000);
  pairingCode = await sock.requestPairingCode(phoneNumber);
  logger.session(`Pairing code generated for ${phoneNumber}`);

  writeStatus({
    generatedAt: new Date().toISOString(),
    lastPairingCode: pairingCode
  });

  return sock;
}

async function exportSessionBase64() {
  if (!fs.existsSync(credsPath)) return null;
  const raw = fs.readFileSync(credsPath, 'utf-8');
  const base64 = Buffer.from(raw, 'utf-8').toString('base64');
  writeStatus({
    lastSessionLength: base64.length
  });
  return base64;
}

app.get('/', (_, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${settings.BOT_NAME} Session Generator</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background:
            radial-gradient(circle at 15% 20%, rgba(65, 176, 255, 0.35), transparent 35%),
            radial-gradient(circle at 85% 12%, rgba(41, 255, 147, 0.2), transparent 28%),
            linear-gradient(135deg, #102a43 0%, #243b53 55%, #102a43 100%);
          min-height: 100vh;
          padding: 28px 16px;
        }
        .container {
          background: rgba(255, 255, 255, 0.96);
          border-radius: 20px;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.25);
          max-width: 640px;
          width: 100%;
          margin: 0 auto;
          padding: 24px;
        }
        .hero {
          background: linear-gradient(135deg, #0f9b8e 0%, #1f4d8f 100%);
          border-radius: 16px;
          color: #fff;
          padding: 24px;
          margin-bottom: 22px;
          text-align: center;
        }
        .profile {
          width: 92px;
          height: 92px;
          border-radius: 50%;
          border: 3px solid rgba(255, 255, 255, 0.85);
          object-fit: cover;
          margin-bottom: 12px;
        }
        h1 { margin-bottom: 8px; font-size: 30px; text-align: center; }
        .subtitle { opacity: 0.94; margin-bottom: 12px; font-size: 14px; }
        .clock {
          display: inline-block;
          font-size: 13px;
          background: rgba(255, 255, 255, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.25);
          padding: 6px 10px;
          border-radius: 999px;
          margin-bottom: 14px;
        }
        .hero-btn {
          background: #fff;
          color: #113f67;
          font-weight: 700;
        }
        .step { margin-bottom: 30px; }
        .step-title { color: #1f4d8f; font-weight: 700; margin-bottom: 12px; }
        .panel {
          border: 1px solid #dbe3ef;
          border-radius: 14px;
          padding: 18px;
          background: #fbfcff;
        }
        input[type="text"] {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #d9e2ec;
          border-radius: 8px;
          font-size: 16px;
          transition: border-color 0.3s;
          margin-bottom: 10px;
        }
        input[type="text"]:focus { outline: none; border-color: #1f4d8f; }
        button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #1f4d8f 0%, #0f9b8e 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease;
          margin-top: 6px;
        }
        button:hover { transform: translateY(-2px); }
        button:active { transform: translateY(0); }
        .info-box {
          background: #f1f5f9;
          border-left: 4px solid #1f4d8f;
          padding: 12px 16px;
          border-radius: 4px;
          margin-bottom: 14px;
        }
        .success-box {
          background: #edfdf5;
          border-left: 4px solid #059669;
          padding: 16px;
          border-radius: 4px;
          margin-top: 20px;
        }
        .code-display {
          background: #0b1727;
          color: #34d399;
          padding: 16px;
          border-radius: 8px;
          font-family: 'Courier New', monospace;
          font-size: 24px;
          text-align: center;
          letter-spacing: 4px;
          word-break: break-all;
          margin: 16px 0;
        }
        .muted { font-size: 12px; color: #546170; }
        .error { color: #d32f2f; margin-top: 10px; }
        .hidden { display: none; }
        .secondary-btn {
          background: #0f766e;
        }
        .gray-btn {
          background: #475569;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="hero">
          <img src="/assets/menu.jpg" alt="KLAUS menu" class="profile" />
          <h1>${settings.BOT_NAME}</h1>
          <p class="subtitle">Session Pairing Center</p>
          <div id="clock" class="clock">Loading time...</div>
          <button class="hero-btn" onclick="goToPairing()">Get Session</button>
        </div>

        <div id="step1" class="panel">
          <div class="step" id="pairingSection">
            <div class="step-title">Step 1: Enter Your WhatsApp Number</div>
            <div class="info-box">
              Include country code without + sign (e.g., 254725391914)
            </div>
            <input type="text" id="phoneInput" placeholder="254725391914" autocomplete="off">
            <button onclick="generateCode()">Get Pairing Code</button>
            <div id="error" class="error"></div>
          </div>
        </div>

        <div id="step2" class="hidden panel">
          <div class="success-box">
            <div class="step-title">Your Pairing Code:</div>
            <div class="code-display" id="codeDisplay"></div>
            <button class="secondary-btn" onclick="copyPairingCode()">Copy Pairing Code</button>
            <p style="font-size: 13px; color: #555; margin-top: 12px;">
              Open <strong>WhatsApp</strong> → <strong>Settings</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong> and enter this code.
            </p>
          </div>

          <div class="step" style="margin-top: 30px;">
            <div class="step-title">Step 2: Export Session String</div>
            <div class="info-box">
              After linking on your phone, export the session credentials below.
            </div>
            <button onclick="exportSession()">Export Session String</button>
            <div id="sessionResult" class="hidden" style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 15px;">
              <p style="font-size: 12px; color: #666; margin-bottom: 10px;"><strong>Session String (copy this to your environment):</strong></p>
              <textarea id="sessionValue" readonly style="width: 100%; height: 120px; padding: 10px; font-family: monospace; font-size: 11px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
              <button class="secondary-btn" onclick="copySession()" style="margin-top: 10px;">Copy Session</button>
            </div>
          </div>

          <button class="gray-btn" onclick="startOver()" style="margin-top: 20px;">Start Over</button>
        </div>
      </div>

      <script>
        function goToPairing() {
          document.getElementById('pairingSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
          document.getElementById('phoneInput').focus();
        }

        function updateClock() {
          const now = new Date();
          const clockText = now.toLocaleString('en-KE', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          document.getElementById('clock').textContent = clockText;
        }

        async function generateCode() {
          const phone = document.getElementById('phoneInput').value.replace(/[^0-9]/g, '');
          const error = document.getElementById('error');
          error.innerHTML = '';

          if (!phone) {
            error.innerHTML = '⚠️ Please enter a valid phone number';
            return;
          }

          try {
            const res = await fetch('/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'number=' + phone
            });
            const data = await res.json();

            if (data.ok) {
              document.getElementById('codeDisplay').textContent = data.pairingCode;
              document.getElementById('step1').classList.add('hidden');
              document.getElementById('step2').classList.remove('hidden');
            } else {
              error.innerHTML = '❌ ' + data.error;
            }
          } catch (e) {
            error.innerHTML = '❌ Server error: ' + e.message;
          }
        }

        async function copyTextToClipboard(text) {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
          }

          const helper = document.createElement('textarea');
          helper.value = text;
          helper.style.position = 'fixed';
          helper.style.opacity = '0';
          document.body.appendChild(helper);
          helper.focus();
          helper.select();
          document.execCommand('copy');
          document.body.removeChild(helper);
        }

        async function exportSession() {
          try {
            const res = await fetch('/export');
            const data = await res.json();

            if (data.ok) {
              document.getElementById('sessionValue').value = data.session;
              document.getElementById('sessionResult').classList.remove('hidden');
            } else {
              alert('❌ ' + data.error);
            }
          } catch (e) {
            alert('❌ Error: ' + e.message);
          }
        }

        async function copyPairingCode() {
          const code = document.getElementById('codeDisplay').textContent.trim();
          if (!code) {
            alert('❌ No pairing code to copy yet.');
            return;
          }

          try {
            await copyTextToClipboard(code);
            alert('✅ Pairing code copied!');
          } catch (e) {
            alert('❌ Unable to copy pairing code: ' + e.message);
          }
        }

        async function copySession() {
          const session = document.getElementById('sessionValue').value;
          if (!session) {
            alert('❌ No session string available to copy.');
            return;
          }

          try {
            await copyTextToClipboard(session);
            alert('✅ Session string copied to clipboard!');
          } catch (e) {
            alert('❌ Unable to copy session string: ' + e.message);
          }
        }

        function startOver() {
          document.getElementById('phoneInput').value = '';
          document.getElementById('error').innerHTML = '';
          document.getElementById('sessionResult').classList.add('hidden');
          document.getElementById('step1').classList.remove('hidden');
          document.getElementById('step2').classList.add('hidden');
        }

        updateClock();
        setInterval(updateClock, 1000);
        document.getElementById('phoneInput').focus();
      </script>
    </body>
    </html>
  `);
});

app.post('/generate', async (req, res) => {
  const number = String(req.body.number || '').replace(/[^0-9]/g, '');
  if (!number) {
    res.status(400).json({ ok: false, error: 'Valid phone number is required.' });
    return;
  }

  try {
    await buildSocket(number);
    res.json({
      ok: true,
      pairingCode,
      info: 'Open WhatsApp > Linked devices > Link with phone number and use code.'
    });
  } catch (err) {
    logger.error(`Session generation failed: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/status', async (_, res) => {
  const base64 = await exportSessionBase64();
  res.json({
    ok: true,
    linked: socketReady,
    pairingCode,
    hasSession: Boolean(base64)
  });
});

app.get('/export', async (_, res) => {
  const base64 = await exportSessionBase64();
  if (!base64) {
    res.status(404).json({ ok: false, error: 'No creds.json found yet. Pair first.' });
    return;
  }

  res.json({ ok: true, session: base64 });
});

const port = settings.SESSION_SERVER_PORT || settings.PORT || 3000;
app.listen(port, () => {
  logger.info(`Session server running at http://localhost:${port}`);
});
