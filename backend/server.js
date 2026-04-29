import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToDrive } from './driveService.js';
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

const saveLog = (matchId) => {
  const log = matchLogs.get(matchId);
  if (!log || log.messages.length === 0) {
    matchLogs.delete(matchId);
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `chat_${timestamp}_${matchId}.txt`;
  const filePath = path.join(logsDir, filename);

  const logContent = log.messages.map(m => `[${m.time}] ${m.sender}: ${m.text}`).join('\n');
  const header = `Chat Session: ${matchId}\nStarted: ${log.startTime}\nEnded: ${new Date().toISOString()}\n-----------------------------------\n`;
  const fullContent = header + logContent;

  // 1. Save locally (if possible)
  if (fs.existsSync(logsDir)) {
    fs.writeFile(filePath, fullContent, (err) => {
      if (err) console.error(`Error saving local log ${filename}:`, err);
      else console.log(`Saved local chat log: ${filename}`);
    });
  }

  // 2. Upload to Google Drive (Independent of local save)
  uploadToDrive(filename, fullContent);

  matchLogs.delete(matchId);
};

const updateOnlineCount = () => {
  const realCount = io.sockets.sockets.size;
  // We add a realistic base number to make the site look "vibing" 
  // but it still reflects real-time changes
  const vibingCount = realCount + 6940; 
  io.emit('online_count', vibingCount);
  console.log(`Broadcasting online count: ${vibingCount} (Real: ${realCount})`);
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
          text: text,
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
