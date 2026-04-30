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
  
  let htmlMessages = "";
  
  for (let i = 0; i < log.messages.length; i++) {
    const m = log.messages[i];
    const isSystem = m.sender === 'System';
    const senderClass = isSystem ? 'system' : 'user';
    
    if (m.type === 'image') {
      const mimeType = m.data.match(/data:([^;]+);/)?.[1] || 'image/png';
      const extension = mimeType.split('/')[1] || 'png';
      const imgFilename = `${baseFilename}_img${i}.${extension}`;
      
      await uploadToDrive(imgFilename, m.data, mimeType);
      
      if (fs.existsSync(logsDir)) {
        const imgPath = path.join(logsDir, imgFilename);
        const buffer = Buffer.from(m.data.split(',')[1], 'base64');
        try {
          await fs.promises.writeFile(imgPath, buffer);
        } catch (err) {
          console.error(`Error saving local image ${imgFilename}:`, err);
        }
      }
      
      htmlMessages += `
        <div class="message ${senderClass}">
          <div class="bubble">
            <div class="sender-id">${m.sender}</div>
            <div class="image-attachment">
              <img src="${m.data}" alt="Sent Image" style="max-width: 100%; border-radius: 8px; margin-top: 5px;">
              <p style="font-size: 10px; opacity: 0.7; margin-top: 5px;">Saved as: ${imgFilename}</p>
            </div>
            <div class="timestamp">${m.time}</div>
          </div>
        </div>`;
    } else {
      htmlMessages += `
        <div class="message ${senderClass}">
          <div class="bubble">
            <div class="sender-id">${m.sender}</div>
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0f172a;
            --container-bg: rgba(30, 41, 59, 0.7);
            --bubble-user: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
            --bubble-text: #ffffff;
            --timestamp-color: rgba(255, 255, 255, 0.6);
            --sender-color: #94a3b8;
        }
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: white;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
        }
        .log-container {
            width: 100%;
            max-width: 600px;
            background: var(--container-bg);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 24px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .header h1 { font-size: 1.2rem; margin: 0; color: #e2e8f0; }
        .header p { font-size: 0.8rem; color: var(--sender-color); margin: 5px 0 0; }
        
        .chat-area { display: flex; flex-direction: column; gap: 16px; }
        
        .message { display: flex; flex-direction: column; max-width: 85%; }
        .message.user { align-self: flex-start; }
        
        .bubble {
            padding: 12px 16px;
            border-radius: 18px;
            background: var(--bubble-user);
            position: relative;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .message.user .bubble { border-bottom-left-radius: 4px; }
        
        .sender-id {
            font-size: 0.7rem;
            font-weight: 600;
            margin-bottom: 4px;
            color: rgba(255, 255, 255, 0.9);
            word-break: break-all;
        }
        .text { font-size: 0.95rem; line-height: 1.5; word-wrap: break-word; }
        .timestamp {
            font-size: 0.65rem;
            margin-top: 6px;
            text-align: right;
            color: var(--timestamp-color);
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 0.7rem;
            color: var(--sender-color);
        }
    </style>
</head>
<body>
    <div class="log-container">
        <div class="header">
            <h1>AuraChat Log</h1>
            <p>Session ID: ${matchId}</p>
            <p>Started: ${new Date(log.startTime).toLocaleString()}</p>
            <p>Ended: ${new Date().toLocaleString()}</p>
        </div>
        <div class="chat-area">
            ${htmlMessages}
        </div>
        <div class="footer">
            Generated by AuraChat &bull; Secure Log Storage
        </div>
    </div>
</body>
</html>`;

  // Generate PDF from HTML
  const pdfOptions = { format: 'A4', margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } };
  const pdfFile = { content: htmlContent };

  try {
    const pdfBuffer = await html_to_pdf.generatePdf(pdfFile, pdfOptions);
    const pdfFilename = `${baseFilename}.pdf`;
    const filePath = path.join(logsDir, pdfFilename);

    if (fs.existsSync(logsDir)) {
      await fs.promises.writeFile(filePath, pdfBuffer);
      console.log(`Saved local PDF log: ${pdfFilename}`);
    }

    await uploadToDrive(pdfFilename, pdfBuffer, 'application/pdf');
    console.log(`Uploaded PDF log to Drive: ${pdfFilename}`);
  } catch (pdfErr) {
    console.error('Error generating PDF, falling back to HTML:', pdfErr);
    const htmlFilename = `${baseFilename}.html`;
    await uploadToDrive(htmlFilename, htmlContent, 'text/html');
  }

  matchLogs.delete(matchId);
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

    // Try to find a match with common interests
    let matchedPartner = null;
    let matchedIndex = -1;

    if (userInterests.length > 0) {
      for (let i = 0; i < waitingUsers.length; i++) {
        const potentialPartner = waitingUsers[i];
        if (potentialPartner.interests.some(interest => userInterests.includes(interest))) {
          matchedPartner = potentialPartner;
          matchedIndex = i;
          console.log(`Found interest-based match! Common interest found.`);
          break;
        }
      }
    }

    // Fallback to first user in queue if no interest match
    if (!matchedPartner && waitingUsers.length > 0) {
      matchedPartner = waitingUsers.shift();
      console.log(`No interest match. Matching ${socket.id} with first in queue: ${matchedPartner.socketId}`);
    } else if (matchedPartner) {
      waitingUsers.splice(matchedIndex, 1);
      console.log(`Interest matching ${socket.id} with ${matchedPartner.socketId}`);
    }

    if (matchedPartner) {
      const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      activeMatches.set(socket.id, { 
        partnerSocketId: matchedPartner.socketId, 
        partnerPeerId: matchedPartner.peerId,
        matchId: matchId
      });
      activeMatches.set(matchedPartner.socketId, { 
        partnerSocketId: socket.id, 
        partnerPeerId: peerId,
        matchId: matchId
      });
      
      // Initialize log
      matchLogs.set(matchId, {
        startTime: new Date().toISOString(),
        messages: []
      });

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
