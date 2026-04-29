import './style.css';
import { createIcons, Send, Github, Sun, Moon, Image as ImageIcon, SkipForward } from 'lucide';
import Peer from 'peerjs';
import { io } from 'socket.io-client';
import Sentiment from 'sentiment';

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('Service Worker registration failed: ', err);
    });
  });
}

class Omego {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.socket = null;

    // UI Elements
    this.landingPage = document.getElementById('landing-page');
    this.chatPage = document.getElementById('chat-page');
    this.startTextBtn = document.getElementById('start-text-btn');
    this.interestsInput = document.getElementById('interests-input');
    this.nextBtn = document.getElementById('next-btn');

    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');

    this.chatStatusText = document.querySelector('#chat-status .status-text');
    this.chatStatusDot = document.querySelector('#chat-status .dot');
    this.myIdSpan = document.getElementById('my-id');
    this.myIdAltSpan = document.querySelector('.my-id-alt');
    this.peerIdDisplay = document.getElementById('peer-id-display');

    this.typingContainer = document.getElementById('typing-container');
    this.themeToggle = document.getElementById('theme-toggle');
    this.themeIcon = document.getElementById('theme-icon');
    this.onlineCountVal = document.getElementById('online-count-val');
    this.imageBtn = document.getElementById('image-btn');
    this.imageInput = document.getElementById('image-input');

    // Modal Elements
    this.modalContainer = document.getElementById('modal-container');
    this.safetyModal = document.getElementById('safety-modal');
    this.privacyModal = document.getElementById('privacy-modal');
    this.safetyBtn = document.getElementById('btn-safety');
    this.privacyBtn = document.getElementById('btn-privacy');
    this.githubBtn = document.getElementById('btn-github');
    this.closeModalBtns = document.querySelectorAll('.close-modal');

    // Agreement Modal Elements
    this.agreementModal = document.getElementById('agreement-modal');
    this.agreeCheckbox1 = document.getElementById('agree-terms-1');
    this.agreeCheckbox2 = document.getElementById('agree-terms-2');
    this.confirmContinueBtn = document.getElementById('confirm-continue-btn');

    // New UI Elements
    this.reactionToggle = document.getElementById('reaction-toggle');
    this.reactionsTray = document.getElementById('reactions-tray');
    this.reactionsContainer = document.getElementById('reactions-container');
    this.reactionBtns = document.querySelectorAll('.reaction-btn');


    this.currentMode = null;
    this.typingTimeout = null;
    this.lastTypingSent = 0;
    this.currentMood = 'default';
    this.neutralCounter = 0;
    this.sentiment = new Sentiment();

    this.MOODS = {
      happy: ['happy', 'lol', 'haha', 'great', 'awesome', 'good', 'nice', 'yay', '😊', '😂'],
      angry: ['angry', 'mad', 'hate', 'stupid', 'dumb', 'stop', 'no', 'wtf', '😠', '😡'],
      sad: ['sad', 'cry', 'bad', 'sorry', 'depressed', 'alone', 'hurt', '😢', '😭'],
      romantic: ['love', 'cute', 'heart', 'kiss', 'date', 'beautiful', 'sweet', '❤️', '😍'],
      excited: ['wow', 'omg', 'excited', 'amazing', 'unreal', 'cool', 'hype', '🔥', '✨'],
      chill: ['chill', 'vibe', 'relax', 'cool', 'bro', 'homie', 'peace', '🤙', '😎']
    };

    this.applyInitialTheme();
    this.init();
    this.initSocket();
  }

  applyInitialTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      if (this.themeIcon) {
        this.themeIcon.setAttribute('data-lucide', 'moon');
      }
    }
  }

  init() {
    createIcons({
      icons: { Send, Github, Sun, Moon, image: ImageIcon, SkipForward }
    });

    if (this.startTextBtn) this.startTextBtn.addEventListener('click', () => this.startSession('text'));

    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.findNewPartner());
    if (this.sendBtn) this.sendBtn.addEventListener('click', () => this.sendMessage());

    if (this.themeToggle) this.themeToggle.addEventListener('click', () => this.toggleTheme());

    if (this.safetyBtn) this.safetyBtn.addEventListener('click', () => this.showModal('safety'));
    if (this.privacyBtn) this.privacyBtn.addEventListener('click', () => this.showModal('privacy'));
    if (this.githubBtn) this.githubBtn.addEventListener('click', () => window.open('https://github.com', '_blank'));

    if (this.closeModalBtns) {
      this.closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => this.hideModals());
      });
    }

    if (this.modalContainer) {
      this.modalContainer.addEventListener('click', (e) => {
        if (e.target === this.modalContainer) {
          this.hideModals();
        }
      });
    }

    if (this.agreeCheckbox1) this.agreeCheckbox1.addEventListener('change', () => this.validateAgreement());
    if (this.agreeCheckbox2) this.agreeCheckbox2.addEventListener('change', () => this.validateAgreement());
    if (this.confirmContinueBtn) this.confirmContinueBtn.addEventListener('click', () => this.confirmSession());

    if (this.chatInput) {
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      this.chatInput.addEventListener('input', () => {
        this.sendTypingStatus();
      });
    }

    if (this.imageBtn) {
      this.imageBtn.addEventListener('click', () => this.imageInput.click());
    }

    if (this.imageInput) {
      this.imageInput.addEventListener('change', (e) => this.handleImageSelect(e));
    }

    if (this.reactionToggle) {
      this.reactionToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.reactionsTray.classList.toggle('hidden');
      });
    }

    document.addEventListener('click', (e) => {
      if (this.reactionsTray && !this.reactionsTray.contains(e.target) && e.target !== this.reactionToggle) {
        this.reactionsTray.classList.add('hidden');
      }
    });

    if (this.reactionBtns) {
      this.reactionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const emoji = btn.getAttribute('data-emoji');
          this.sendReaction(emoji);
          this.reactionsTray.classList.add('hidden');
        });
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.modalContainer.classList.contains('hidden')) {
          this.hideModals();
        } else if (!this.chatPage.classList.contains('hidden')) {
          this.findNewPartner();
        }
      }

      // Privacy Protection: Block Print and Save shortcuts
      if ((e.ctrlKey && (e.key === 'p' || e.key === 's')) || e.key === 'PrintScreen') {
        e.preventDefault();
        this.addSystemMessage('Privacy Protection: Saving or Printing is disabled.');
      }
    });

    // Disable right-click on the chat area for privacy
    this.chatMessages.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.image-content-wrapper')) {
        e.preventDefault();
        this.addSystemMessage('Privacy Protection: Saving images is disabled.');
      }
    });
  }

  async startSession(mode) {
    this.currentMode = mode;
    this.showModal('agreement');
  }

  validateAgreement() {
    const isReady = this.agreeCheckbox1.checked && this.agreeCheckbox2.checked;
    if (isReady) {
      this.confirmContinueBtn.classList.remove('disabled');
      this.confirmContinueBtn.disabled = false;
    } else {
      this.confirmContinueBtn.classList.add('disabled');
      this.confirmContinueBtn.disabled = true;
    }
  }

  confirmSession() {
    if (this.confirmContinueBtn.disabled) return;

    this.hideModals();
    this.landingPage.classList.add('hidden');
    this.chatPage.classList.remove('hidden');
    this.chatPage.classList.add('fade-in');
    
    // Optimize layout for chat: Hide main header and footer
    const globalHeader = document.querySelector('.app-header');
    const globalFooter = document.querySelector('.app-footer');
    if (globalHeader) globalHeader.classList.add('hidden');
    if (globalFooter) globalFooter.classList.add('hidden');
    
    // Remove padding from app-main to allow full-bleed chat
    const appMain = document.querySelector('.app-main');
    if (appMain) appMain.style.paddingTop = '0';

    // Re-initialize icons to ensure they render correctly in the newly visible section
    createIcons({
      icons: { Send, Github, Sun, Moon, image: ImageIcon, SkipForward }
    });

    // this.currentMode is already set in startSession
    this.clearChat();

    const interests = this.interestsInput.value.trim();

    this.initPeer();
  }

  initPeer() {
    // Destroy existing peer if it exists
    if (this.peer) {
      this.peer.destroy();
    }

    this.peer = new Peer({
      debug: 1,
      config: {
        'iceServers': [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      this.peerId = id;
      if (this.myIdSpan) this.myIdSpan.textContent = id;
      if (this.myIdAltSpan) this.myIdAltSpan.textContent = id;
      this.addSystemMessage(`You're now talking to a random stranger. Vibe check in progress...`);

      // Connect to Matchmaking Server
      this.connectToMatchmaking(id);
    });



    this.peer.on('connection', (conn) => {
      this.handleIncomingDataConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('Peer error type:', err.type, 'Error:', err);
      if (err.type === 'peer-unavailable') {
        this.addSystemMessage('Stranger is no longer available. Try skipping.');
      } else if (err.type === 'network') {
        this.addSystemMessage('Network error. Check your connection.');
      } else {
        this.addSystemMessage(`Connection error (${err.type}). Please try skipping.`);
      }
      this.updateStatus('Disconnected');
    });
  }



  handleIncomingDataConnection(conn) {
    this.dataConn = conn;
    this.setupDataHandlers(conn);
  }



  setupDataHandlers(conn) {
    conn.on('open', () => {
      this.updateStatus('Connected');
      this.addSystemMessage("Match found! Don't be mid.");
    });

    conn.on('data', (data) => {
      if (data.type === 'chat') {
        this.addChatMessage('Stranger', data.text);
        this.showTyping(false);
        this.handleMoodInference(data.text);
      } else if (data.type === 'typing') {
        this.showTyping(true);
      } else if (data.type === 'image') {
        this.addImageMessage('Stranger', data.imageData);
        this.showTyping(false);
      } else if (data.type === 'reaction') {
        this.showReaction(data.emoji);
      } else if (data.type === 'mood') {
        this.applyMood(data.mood);
      }
    });

    conn.on('close', () => {
      this.handleDisconnect();
    });
  }

  updateStatus(status) {
    if (this.chatStatusText) this.chatStatusText.textContent = status;
    if (this.chatStatusText) this.chatStatusText.textContent = status;

    if (this.chatStatusDot) {
      this.chatStatusDot.classList.remove('online', 'pulse');
      if (status === 'Connected') {
        this.chatStatusDot.classList.add('online');
      } else if (status === 'Searching...' || status === 'Connecting...') {
        this.chatStatusDot.classList.add('pulse');
      }
    }
  }

  initSocket() {
    // Use VITE_BACKEND_URL from environment if available, otherwise fallback
    const envUrl = import.meta.env.VITE_BACKEND_URL;
    const socketUrl = envUrl || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `http://${window.location.hostname}:3001`);
    this.socket = io(socketUrl);

    this.socket.on('connect', () => {
      // Socket connected
    });

    this.socket.on('online_count', (count) => {
      if (this.onlineCountVal) {
        const start = parseInt(this.onlineCountVal.textContent.replace(/,/g, '')) || 0;
        this.animateValue(this.onlineCountVal, start, count, 1000);
      }
    });

    this.socket.on('match', (data) => {
      this.addSystemMessage(`Match found! Connecting...`);
      this.updateStatus('Connecting...');

      if (data.initiateCall) {
        setTimeout(() => {
          const conn = this.peer.connect(data.partnerPeerId);
          if (conn) this.handleIncomingDataConnection(conn);
        }, 1000);
      }
    });

    this.socket.on('partner_skipped', () => {
      this.addSystemMessage('Stranger skipped you. Searching for a new partner...');
      this.findNewPartner();
    });

    this.socket.on('partner_disconnected', () => {
      this.addSystemMessage('Stranger disconnected.');
      this.handleDisconnect();
    });
  }

  animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const current = Math.floor(progress * (end - start) + start);
      obj.textContent = current.toLocaleString();
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }

  connectToMatchmaking(peerId) {
    const interests = this.interestsInput ? this.interestsInput.value.trim() : '';
    const payload = { peerId, interests };

    if (this.socket && this.socket.connected) {
      this.socket.emit('join_queue', payload);
    } else {
      this.socket.on('connect', () => {
        this.socket.emit('join_queue', payload);
      });
    }
  }

  clearChat() {
    if (this.chatMessages) {
      this.chatMessages.innerHTML = '';
    }
  }

  findNewPartner() {

    // Notify server of skip
    if (this.socket) {
      this.socket.emit('skip');
    }

    this.clearChat();
    this.addSystemMessage('Searching for a new stranger...');
    
    // Re-show header/footer if we were to return to landing, 
    // though findNewPartner usually stays in chat mode.
    const globalHeader = document.querySelector('.app-header');
    const globalFooter = document.querySelector('.app-footer');
    if (globalHeader) globalHeader.classList.add('hidden'); // Keep hidden in chat
    if (globalFooter) globalFooter.classList.add('hidden');

    this.handleDisconnect(true); // true means we are re-searching

    this.updateStatus('Searching...');

    if (this.socket && this.peerId) {
      const interests = this.interestsInput ? this.interestsInput.value.trim() : '';
      this.socket.emit('join_queue', { peerId: this.peerId, interests });
    }
  }

  handleDisconnect(isSearching = false) {
    if (this.dataConn) {
      this.dataConn.close();
      this.dataConn = null;
    }

    this.showTyping(false);
    this.applyMood('default');




    if (!isSearching) {
      this.updateStatus('Disconnected');
    }
  }

  sendMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;


    if (this.dataConn && this.dataConn.open) {
      this.dataConn.send({ type: 'chat', text });
      this.addChatMessage('You', text);
      
      // Emit to server for logging
      if (this.socket) {
        this.socket.emit('chat_message', text);
      }
      
      this.chatInput.value = '';
      this.handleMoodInference(text, true);
    } else {
      this.addSystemMessage('Not connected to anyone yet. Wait for a match, bestie.');
    }
  }

  handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!this.dataConn || !this.dataConn.open) {
      this.addSystemMessage('Not connected to anyone yet. Wait for a match, bestie.');
      this.imageInput.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB limit for base64 over P2P
      this.addSystemMessage('File too large. Keep it under 2MB for the vibe.');
      this.imageInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target.result;
      this.dataConn.send({ type: 'image', imageData });
      this.addImageMessage('You', imageData);
      
      // Emit to server for logging (just a placeholder for image)
      if (this.socket) {
        this.socket.emit('chat_message', '[Sent an image]');
      }
      
      this.imageInput.value = '';
    };
    reader.readAsDataURL(file);
  }

  sendReaction(emoji) {
    if (this.dataConn && this.dataConn.open) {
      this.dataConn.send({ type: 'reaction', emoji });
      this.showReaction(emoji);
    } else {
      this.addSystemMessage('Connect with someone first to send reactions, bestie.');
    }
  }

  showReaction(emoji) {
    if (!this.reactionsContainer) return;

    const reactionEl = document.createElement('div');
    reactionEl.className = 'floating-emoji';
    reactionEl.textContent = emoji;

    // Randomize horizontal position slightly
    const leftPos = 40 + Math.random() * 20; // 40% to 60% range
    reactionEl.style.left = `${leftPos}%`;

    this.reactionsContainer.appendChild(reactionEl);

    // Remove element after animation finishes
    setTimeout(() => {
      reactionEl.remove();
    }, 2000);
  }

  detectMood(text) {
    const analysis = this.sentiment.analyze(text);
    const score = analysis.score;
    const lowercaseText = text.toLowerCase();

    // 1. Priority: Specific Keyword Matches (Romantic/Chill/Excited)
    if (this.MOODS.romantic.some(kw => lowercaseText.includes(kw))) return 'romantic';
    if (this.MOODS.chill.some(kw => lowercaseText.includes(kw))) return 'chill';
    if (this.MOODS.excited.some(kw => lowercaseText.includes(kw))) return 'excited';

    // 2. Sentiment Scoring
    if (score >= 4) return 'excited';
    if (score >= 1) return 'happy';
    if (score <= -4) return 'angry';
    if (score <= -1) return 'sad';

    // 3. Fallback: Generic Keywords
    for (const [mood, keywords] of Object.entries(this.MOODS)) {
      if (keywords.some(keyword => lowercaseText.includes(keyword))) {
        return mood;
      }
    }

    return null;
  }

  handleMoodInference(text, shouldSync = false) {
    const detectedMood = this.detectMood(text);

    if (detectedMood) {
      this.neutralCounter = 0; // Reset counter on any vibe detection
      if (detectedMood !== this.currentMood) {
        this.applyMood(detectedMood);
        if (shouldSync && this.dataConn && this.dataConn.open) {
          this.dataConn.send({ type: 'mood', mood: detectedMood });
        }
      }
    } else {
      // Neutral message detected
      this.neutralCounter++;

      if (this.neutralCounter >= 3 && this.currentMood !== 'default') {
        this.applyMood('default');
        if (shouldSync && this.dataConn && this.dataConn.open) {
          this.dataConn.send({ type: 'mood', mood: 'default' });
        }
      }
    }
  }

  applyMood(mood) {
    if (mood === this.currentMood) return;
    // Remove all existing mood classes
    Object.keys(this.MOODS).forEach(m => {
      document.body.classList.remove(`mood-${m}`);
    });

    // Re-trigger animation
    document.body.classList.remove('mood-active');
    void document.body.offsetWidth; // Force reflow

    if (mood !== 'default') {
      document.body.classList.add(`mood-${mood}`);
      document.body.classList.add('mood-active');
      this.currentMood = mood;
      this.addSystemMessage(`✨ Vibe Shift: ${mood.charAt(0).toUpperCase() + mood.slice(1)} mood detected!`);
    } else {
      this.currentMood = 'default';
      document.body.classList.remove('mood-active');
    }
  }




  addChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';

    const labelSpan = document.createElement('span');
    labelSpan.className = sender === 'You' ? 'label-you' : 'label-stranger';
    labelSpan.textContent = `${sender}: `;

    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = text;

    msgDiv.appendChild(labelSpan);
    msgDiv.appendChild(textSpan);

    this.chatMessages.appendChild(msgDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  addSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'system-message';
    msgDiv.textContent = text;
    this.chatMessages.appendChild(msgDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  addImageMessage(sender, imageData) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message message-image';

    const labelSpan = document.createElement('span');
    labelSpan.className = sender === 'You' ? 'label-you' : 'label-stranger';
    labelSpan.textContent = `${sender}: `;

    const imgContainer = document.createElement('div');
    imgContainer.className = 'image-content-wrapper';

    const img = document.createElement('img');
    img.src = imageData;
    img.alt = 'Shared image';
    img.className = 'shared-image';
    img.onload = () => {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    };

    imgContainer.appendChild(img);
    msgDiv.appendChild(labelSpan);
    msgDiv.appendChild(imgContainer);

    this.chatMessages.appendChild(msgDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  sendTypingStatus() {
    if (!this.dataConn || !this.dataConn.open) return;

    const now = Date.now();
    // Throttle sending typing status to every 2 seconds
    if (now - this.lastTypingSent > 2000) {
      this.lastTypingSent = now;
      this.dataConn.send({ type: 'typing' });
    }
  }

  showTyping(isTyping) {
    if (!this.typingContainer) return;

    if (isTyping) {
      this.typingContainer.classList.remove('hidden');

      // Auto-hide typing indicator after 3 seconds of no updates
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.typingContainer.classList.add('hidden');
      }, 3000);
    } else {
      this.typingContainer.classList.add('hidden');
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
    }

    // Ensure chat scrolled to bottom when indicator appears
    if (this.chatMessages) {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
  }

  toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');

    if (this.themeIcon) {
      this.themeIcon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
      createIcons({ icons: { Sun, Moon } });
    }
  }

  showModal(type) {
    if (!this.modalContainer) return;

    this.modalContainer.classList.remove('hidden');
    this.safetyModal.classList.add('hidden');
    this.privacyModal.classList.add('hidden');

    if (type === 'safety') {
      this.safetyModal.classList.remove('hidden');
    } else if (type === 'privacy') {
      this.privacyModal.classList.remove('hidden');
    } else if (type === 'agreement') {
      this.agreementModal.classList.remove('hidden');
    }

    document.body.style.overflow = 'hidden'; // Prevent scrolling
  }

  hideModals() {
    if (!this.modalContainer) return;
    this.modalContainer.classList.add('hidden');
    this.safetyModal.classList.add('hidden');
    this.privacyModal.classList.add('hidden');
    this.agreementModal.classList.add('hidden');
    document.body.style.overflow = ''; // Restore scrolling
  }
}

new Omego();
