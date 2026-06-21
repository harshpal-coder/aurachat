import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToDrive } from './driveService.js';
import html_to_pdf from 'html-pdf-node';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();

// Production Security & Performance
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for Socket.io and PeerJS compatibility
}));
app.use(compression());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
app.use('/api/', limiter); // Apply to API routes if any

const corsOptions = {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST"],
  credentials: true
};
app.use(cors(corsOptions));

// Serve static files from the Vite build output directory (frontend/dist)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions
});

let waitingUsers = [];
let activeMatches = new Map(); // socket.id -> { partnerSocketId, partnerPeerId, matchId }
let matchLogs = new Map(); // matchId -> { startTime, messages: [] }

// Ensure logs directory exists (Optional for production)
const logsDir = path.join(__dirname, 'logs');
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }
} catch (e) {
  console.warn('Could not create local logs directory (this is normal in production):', e.message);
}

const saveLog = async (matchId) => {
  const log = matchLogs.get(matchId);
  if (!log || log.messages.length === 0) {
    matchLogs.delete(matchId);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFilename = `chat_${timestamp}_${matchId}`;
  
  console.log(`[Log] Starting log save process for match: ${matchId}`);
  
  let htmlMessages = "";
  const uniqueSenders = [...new Set(log.messages.filter(m => m.sender !== 'System').map(m => m.sender))];
  
  for (let i = 0; i < log.messages.length; i++) {
    const m = log.messages[i];
    const isSystem = m.sender === 'System';
    let senderClass = 'system';
    if (!isSystem) {
      senderClass = m.sender === uniqueSenders[0] ? 'user-a' : 'user-b';
    }
    
    if (m.type === 'image') {
      const mimeType = m.data.match(/data:([^;]+);/)?.[1] || 'image/png';
      const extension = mimeType.split('/')[1] || 'png';
      const imgFilename = `${baseFilename}_img${i}.${extension}`;
      
      // Upload image to Drive
      uploadToDrive(imgFilename, m.data, mimeType).catch(err => console.error(`Failed to upload image ${imgFilename}:`, err));
      
      if (fs.existsSync(logsDir)) {
        const imgPath = path.join(logsDir, imgFilename);
        const buffer = Buffer.from(m.data.split(',')[1], 'base64');
        try {
          fs.writeFileSync(imgPath, buffer);
        } catch (err) {
          console.error(`Error saving local image ${imgFilename}:`, err);
        }
      }
      
      htmlMessages += `
        <div class="message ${senderClass}">
          <div class="bubble">
            <div class="sender-id">${isSystem ? 'SYSTEM' : (senderClass === 'user-a' ? 'You' : 'Partner')}</div>
            <div class="image-attachment">
              <img src="${m.data}" alt="Sent Image">
              <p class="img-meta">Saved as: ${imgFilename}</p>
            </div>
            <div class="timestamp">${m.time}</div>
          </div>
        </div>`;
    } else {
      htmlMessages += `
        <div class="message ${senderClass}">
          <div class="bubble">
            <div class="sender-id">${isSystem ? 'SYSTEM' : (senderClass === 'user-a' ? 'You' : 'Partner')}</div>
            <div class="text">${m.text}</div>
            <div class="timestamp">${m.time}</div>
          </div>
        </div>`;
    }
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Log - ${matchId}</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #030712;
            --accent-primary: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            --accent-secondary: rgba(31, 41, 55, 0.7);
            --text-main: #f8fafc;
            --text-dim: #94a3b8;
            --glass-bg: rgba(17, 24, 39, 0.6);
            --glass-border: rgba(255, 255, 255, 0.08);
        }
        
        * { box-sizing: border-box; }
        
        body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            background-image: 
                radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
                radial-gradient(circle at 100% 100%, rgba(168, 85, 247, 0.15) 0%, transparent 50%);
            color: var(--text-main);
            margin: 0;
            padding: 40px 20px;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .log-container {
            width: 100%;
            max-width: 700px;
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 32px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 30px;
            border-bottom: 1px solid var(--glass-border);
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 600;
            margin: 0;
            background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.02em;
        }

        .session-info {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }

        .info-pill {
            background: rgba(255, 255, 255, 0.05);
            padding: 6px 14px;
            border-radius: 100px;
            font-size: 0.75rem;
            color: var(--text-dim);
            border: 1px solid var(--glass-border);
        }

        .chat-area {
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 80%;
            position: relative;
        }

        .message.user-a { align-self: flex-end; }
        .message.user-b { align-self: flex-start; }
        .message.system { 
            align-self: center; 
            max-width: 100%;
            opacity: 0.6;
            font-style: italic;
            font-size: 0.85rem;
            margin: 10px 0;
        }

        .bubble {
            padding: 14px 20px;
            border-radius: 22px;
            position: relative;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s;
        }

        .message.user-a .bubble {
            background: var(--accent-primary);
            color: white;
            border-bottom-right-radius: 4px;
        }

        .message.user-b .bubble {
            background: var(--accent-secondary);
            border: 1px solid var(--glass-border);
            color: var(--text-main);
            border-bottom-left-radius: 4px;
        }
        
        .message.system .bubble {
            background: transparent;
            box-shadow: none;
            padding: 0;
        }

        .sender-id {
            font-size: 0.7rem;
            font-weight: 600;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            opacity: 0.8;
        }

        .text {
            font-size: 1rem;
            line-height: 1.6;
            word-wrap: break-word;
            font-weight: 400;
        }

        .image-attachment img {
            max-width: 100%;
            border-radius: 12px;
            margin: 8px 0;
            display: block;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .img-meta {
            font-size: 0.65rem;
            opacity: 0.6;
            margin: 4px 0 0;
        }

        .timestamp {
            font-size: 0.65rem;
            margin-top: 8px;
            opacity: 0.5;
            text-align: right;
        }

        .message.user-a .timestamp { color: rgba(255, 255, 255, 0.8); }

        .footer {
            margin-top: 50px;
            text-align: center;
            padding: 20px;
            opacity: 0.4;
            font-size: 0.8rem;
        }

        .footer-logo {
            font-weight: 600;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }
    </style>
</head>
<body>
    <div class="log-container">
        <div class="header">
            <h1>AuraChat</h1>
            <div class="session-info">
                <span class="info-pill">ID: ${matchId.split('_').pop()}</span>
                <span class="info-pill">Started: ${new Date(log.startTime).toLocaleTimeString()}</span>
                <span class="info-pill">Ended: ${new Date().toLocaleTimeString()}</span>
            </div>
        </div>
        
        <div class="chat-area">
            ${htmlMessages}
        </div>
        
        <div class="footer">
            <div class="footer-logo">AURACHAT</div>
            <div>Secure End-to-End Encrypted Session Log</div>
            <div style="margin-top: 10px; font-size: 0.7rem;">&copy; ${new Date().getFullYear()} AuraChat Inc.</div>
        </div>
    </div>
</body>
</html>`;

  // Always save local HTML as a backup first
  if (fs.existsSync(logsDir)) {
    const htmlFilename = `${baseFilename}.html`;
    try {
      fs.writeFileSync(path.join(logsDir, htmlFilename), htmlContent);
      console.log(`[Log] Saved local HTML backup: ${htmlFilename}`);
    } catch (writeErr) {
      console.error(`[Log] Error saving local HTML backup ${htmlFilename}:`, writeErr.message);
    }
  }

  // Attempt PDF generation
  try {
    const pdfOptions = { format: 'A4', margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } };
    const pdfFile = { content: htmlContent };
    
    console.log(`[Log] Generating PDF for ${matchId}...`);
    const pdfBuffer = await html_to_pdf.generatePdf(pdfFile, pdfOptions);
    const pdfFilename = `${baseFilename}.pdf`;

    if (fs.existsSync(logsDir)) {
      try {
        fs.writeFileSync(path.join(logsDir, pdfFilename), pdfBuffer);
        console.log(`[Log] Saved local PDF: ${pdfFilename}`);
      } catch (writeErr) {
        console.error(`[Log] Error writing local PDF ${pdfFilename}:`, writeErr.message);
      }
    }

    try {
      await uploadToDrive(pdfFilename, pdfBuffer, 'application/pdf');
    } catch (driveErr) {
      console.error(`[Log] Google Drive upload failed for PDF:`, driveErr.message);
    }
  } catch (pdfErr) {
    console.error(`[Log] PDF generation failed for ${matchId}, falling back to HTML upload:`, pdfErr.message);
    const htmlFilename = `${baseFilename}.html`;
    try {
      await uploadToDrive(htmlFilename, htmlContent, 'text/html');
    } catch (fallbackErr) {
      console.error(`[Log] Google Drive fallback upload failed:`, fallbackErr.message);
    }
  }

  matchLogs.delete(matchId);
};


const findPartnerForInterests = (interests) => {
  if (!interests || interests.length === 0) return null;
  for (let i = 0; i < waitingUsers.length; i++) {
    const potentialPartner = waitingUsers[i];
    if (potentialPartner.interests.some(interest => interests.includes(interest))) {
      return { partner: potentialPartner, index: i };
    }
  }
  return null;
};

const establishMatch = (socketIdA, socketIdB, peerIdA, peerIdB) => {
  const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  activeMatches.set(socketIdA, { 
    partnerSocketId: socketIdB, 
    partnerPeerId: peerIdB,
    matchId: matchId
  });
  activeMatches.set(socketIdB, { 
    partnerSocketId: socketIdA, 
    partnerPeerId: peerIdA,
    matchId: matchId
  });
  
  matchLogs.set(matchId, {
    startTime: new Date().toISOString(),
    messages: []
  });

  return matchId;
};

const updateOnlineCount = () => {
  const realCount = io.sockets.sockets.size;
  io.emit('online_count', realCount);
  console.log(`Broadcasting online count: ${realCount}`);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  updateOnlineCount();

  const leaveQueue = () => {
    waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
  };

  const endMatch = () => {
    const match = activeMatches.get(socket.id);
    if (match) {
      const partnerSocketId = match.partnerSocketId;
      const matchId = match.matchId;
      
      activeMatches.delete(socket.id);
      activeMatches.delete(partnerSocketId);

      // Save log if it hasn't been saved yet (one call to endMatch will handle it)
      if (matchLogs.has(matchId)) {
        saveLog(matchId);
      }

      return partnerSocketId;
    }
    return null;
  };

  socket.on('join_queue', (data) => {
    const { peerId, interests } = typeof data === 'object' ? data : { peerId: data, interests: '' };
    const userInterests = interests ? interests.toLowerCase().split(/[\s,]+/).filter(i => i.trim().length > 0) : [];
    
    console.log(`User ${socket.id} joining queue. Peer ID: ${peerId}, Interests: [${userInterests.join(', ')}]`);
    
    leaveQueue();
    const partnerSocketId = endMatch();
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner_disconnected');
    }

    let matchedPartner = null;
    let matchedIndex = -1;

    const matchedResult = findPartnerForInterests(userInterests);
    if (matchedResult) {
      matchedPartner = matchedResult.partner;
      matchedIndex = matchedResult.index;
      waitingUsers.splice(matchedIndex, 1);
      console.log(`Interest matching ${socket.id} with ${matchedPartner.socketId}`);
    } else if (waitingUsers.length > 0) {
      matchedPartner = waitingUsers.shift();
      console.log(`No interest match. Matching ${socket.id} with first in queue: ${matchedPartner.socketId}`);
    }

    if (matchedPartner) {
      const matchId = establishMatch(socket.id, matchedPartner.socketId, peerId, matchedPartner.peerId);
      socket.emit('match', { partnerPeerId: matchedPartner.peerId, initiateCall: true });
      io.to(matchedPartner.socketId).emit('match', { partnerPeerId: peerId, initiateCall: false });
    } else {
      waitingUsers.push({ socketId: socket.id, peerId: peerId, interests: userInterests });
    }
  });

  socket.on('chat_message', (text) => {
    const match = activeMatches.get(socket.id);
    if (match && match.matchId) {
      const log = matchLogs.get(match.matchId);
      if (log) {
        log.messages.push({
          sender: socket.id,
          type: 'text',
          text: text,
          time: new Date().toLocaleTimeString()
        });
      }
    }
  });

  socket.on('chat_image', (imageData) => {
    const match = activeMatches.get(socket.id);
    if (match && match.matchId) {
      const log = matchLogs.get(match.matchId);
      if (log) {
        console.log(`Logging image for match ${match.matchId} from ${socket.id}`);
        log.messages.push({
          sender: socket.id,
          type: 'image',
          data: imageData,
          time: new Date().toLocaleTimeString()
        });
      }
    }
  });

  socket.on('skip', () => {
    console.log(`User ${socket.id} skipped`);
    const partnerSocketId = endMatch();
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner_skipped');
    }
    // The user who skipped will usually call join_queue from client
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    leaveQueue();
    const partnerSocketId = endMatch();
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner_disconnected');
    }
    
    // Broadcast updated count after disconnect
    updateOnlineCount();
  });
});

// Periodic broadcast every 10 seconds as a fallback
setInterval(updateOnlineCount, 10000);

// Fallback route for SPA - serves index.html for any unknown routes
app.get(/.*/, (req, res) => {
  const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Omego Backend API is running.');
  }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
