import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
app.use(cors());

// Serve static files from the Vite build output directory (frontend/dist)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

let waitingUsers = [];
let activeMatches = new Map(); // socket.id -> { partnerSocketId, partnerPeerId }

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
      activeMatches.delete(socket.id);
      activeMatches.delete(partnerSocketId);
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
      activeMatches.set(socket.id, { partnerSocketId: matchedPartner.socketId, partnerPeerId: matchedPartner.peerId });
      activeMatches.set(matchedPartner.socketId, { partnerSocketId: socket.id, partnerPeerId: peerId });
      
      socket.emit('match', { partnerPeerId: matchedPartner.peerId, initiateCall: true });
      io.to(matchedPartner.socketId).emit('match', { partnerPeerId: peerId, initiateCall: false });
    } else {
      waitingUsers.push({ socketId: socket.id, peerId: peerId, interests: userInterests });
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
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
