import './style.css';
import { UIManager } from './js/UIManager.js';
import { SocketManager } from './js/SocketManager.js';
import { PeerManager } from './js/PeerManager.js';
import { VideoSyncManager } from './js/VideoSyncManager.js';
import { SentimentAnalyzer } from './js/SentimentAnalyzer.js';

class Omego {
  constructor() {
    const envUrl = import.meta.env.VITE_BACKEND_URL;
    this.backendUrl = envUrl || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : `${window.location.protocol}//${window.location.hostname}:3001`);

    this.currentMode = null;
    this.lastTypingSent = 0;
    this.currentMood = 'default';
    this.neutralCounter = 0;

    // 1. Sentiment Analyser
    this.sentiment = new SentimentAnalyzer();

    // 2. UI Manager
    this.ui = new UIManager({
      onStartSession: (mode) => this.handleStartSession(mode),
      onSkip: () => this.handleSkip(),
      onSend: (text) => this.handleSendMessage(text),
      onImageSelect: (file) => this.handleImageSelect(file),
      onWatchTogetherClick: () => this.handleWatchTogetherClick(),
      onCloseVideo: () => this.handleCloseVideo(),
      onTyping: () => this.handleTyping()
    });

    // 3. VideoSyncManager
    this.videoSync = new VideoSyncManager({
      videoContent: this.ui.videoContent,
      toggleOverlay: (show) => this.ui.toggleVideoOverlay(show),
      onLocalAction: (type, data) => this.handleVideoLocalAction(type, data),
      addSystemMessage: (msg) => this.ui.addSystemMessage(msg)
    });

    // 4. PeerManager
    this.peerManager = new PeerManager({
      onPeerOpen: (id) => this.handlePeerOpen(id),
      onDataReceived: (data) => this.handlePeerData(data),
      onConnectionOpen: () => this.handlePeerConnectionOpen(),
      onConnectionClose: () => this.handlePeerConnectionClose(),
      onPeerError: (err) => this.handlePeerError(err),
      addSystemMessage: (msg) => this.ui.addSystemMessage(msg)
    });

    // 5. SocketManager
    this.socketManager = new SocketManager({
      backendUrl: this.backendUrl,
      onConnect: () => {},
      onOnlineCount: (count) => this.ui.updateOnlineCount(count),
      onMatch: (data) => this.handleServerMatch(data),
      onPartnerSkipped: () => this.handlePartnerSkipped(),
      onPartnerDisconnected: () => this.handlePartnerDisconnected()
    });

    this.applyInitialTheme();
    this.socketManager.initSocket();
    this.checkShortcuts();
    this.loadYoutubeApi();
  }

  loadYoutubeApi() {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }

  applyInitialTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
      if (this.ui.themeIcon) {
        this.ui.themeIcon.setAttribute('data-lucide', 'moon');
      }
    }
  }

  checkShortcuts() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('start') === 'text') {
      setTimeout(() => {
        if (this.ui.landingPage && !this.ui.landingPage.classList.contains('hidden')) {
          this.handleStartSession('text');
        }
      }, 500);
    }
  }

  handleStartSession(mode) {
    this.currentMode = mode;
    if (mode === 'text') {
      this.ui.showModal('agreement');
    } else if (mode === 'confirm') {
      this.peerManager.initPeer();
    }
  }

  handleSkip() {
    this.socketManager.emitSkip();
    this.ui.clearChat();
    this.ui.addSystemMessage('Searching for a new stranger...');

    this.peerManager.disconnect();
    this.ui.updateStatus('Searching...');

    if (this.peerManager.peerId) {
      this.socketManager.joinQueue(this.peerManager.peerId, this.ui.getInterests());
    }
  }

  handleSendMessage(text) {
    const success = this.peerManager.sendData({ type: 'chat', text });
    if (success) {
      this.ui.addChatMessage('You', text);
      this.socketManager.emitChatMessage(text);
      this.ui.clearChatInput();
      this.handleMoodInference(text, true);
    } else {
      this.ui.addSystemMessage('Not connected to anyone yet. Wait for a match, bestie.');
    }
  }

  handleImageSelect(file) {
    if (file.size > 2 * 1024 * 1024) {
      this.ui.addSystemMessage('File too large. Keep it under 2MB for the vibe.');
      return;
    }

    if (!this.peerManager.dataConn || !this.peerManager.dataConn.open) {
      this.ui.addSystemMessage('Not connected to anyone yet. Wait for a match, bestie.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageData = event.target.result;
      this.peerManager.sendData({ type: 'image', imageData });
      this.ui.addImageMessage('You', imageData);
      this.socketManager.emitChatImage(imageData);
    };
    reader.readAsDataURL(file);
  }

  handleWatchTogetherClick() {
    if (!this.peerManager.dataConn || !this.peerManager.dataConn.open) {
      this.ui.addSystemMessage('Connect with someone first to watch together, bestie.');
      return;
    }

    const url = window.prompt('Enter YouTube or Video URL:');
    if (url) {
      this.videoSync.startVideo(url, true);
    }
  }

  handleCloseVideo() {
    this.videoSync.stopVideo();
    this.ui.toggleVideoOverlay(false);
    this.peerManager.sendData({ type: 'video_stop' });
  }

  handleTyping() {
    const now = Date.now();
    if (now - this.lastTypingSent > 2000) {
      this.lastTypingSent = now;
      this.peerManager.sendData({ type: 'typing' });
    }
  }

  handleVideoLocalAction(type, data) {
    // Forward video sync actions (play, pause, seek, start) over PeerJS data connection
    if (type.startsWith('video_')) {
      const signalType = type; // e.g. 'video_play'
      this.peerManager.sendData({ type: signalType.replace('video_', 'video_'), ...data });
    }
  }

  handlePeerOpen(id) {
    this.ui.setMyIds(id);
    this.ui.addSystemMessage(`You're now talking to a random stranger. Vibe check in progress...`);
    this.socketManager.joinQueue(id, this.ui.getInterests());
  }

  handlePeerConnectionOpen() {
    this.ui.updateStatus('Connected');
    this.ui.addSystemMessage("Match found! Don't be mid.");
  }

  handlePeerConnectionClose() {
    this.ui.showTyping(false);
    this.applyMood('default');
    this.ui.updateStatus('Disconnected');
  }

  handlePeerError(err) {
    console.error('Peer connection error:', err);
    if (err.type === 'peer-unavailable') {
      this.ui.addSystemMessage('Stranger is no longer available. Try skipping.');
    } else if (err.type === 'network') {
      this.ui.addSystemMessage('Network error. Check your connection.');
    } else {
      this.ui.addSystemMessage(`Connection error (${err.type}). Please try skipping.`);
    }
    this.ui.updateStatus('Disconnected');
  }

  handlePeerData(data) {
    if (data.type === 'chat') {
      this.ui.addChatMessage('Stranger', data.text);
      this.ui.showTyping(false);
      this.handleMoodInference(data.text);
    } else if (data.type === 'typing') {
      this.ui.showTyping(true);
    } else if (data.type === 'image') {
      this.ui.addImageMessage('Stranger', data.imageData);
      this.ui.showTyping(false);
      this.socketManager.emitChatImage(data.imageData);
    } else if (data.type === 'mood') {
      this.applyMood(data.mood);
    } else if (data.type === 'video_start') {
      this.videoSync.startVideo(data.url, false);
      this.ui.addSystemMessage('Stranger started a Watch Together session.');
    } else if (data.type === 'video_stop') {
      this.videoSync.stopVideo();
      this.ui.toggleVideoOverlay(false);
      this.ui.addSystemMessage('Stranger closed the video player.');
    } else if (data.type === 'video_play') {
      this.videoSync.handleRemoteVideoAction('play');
    } else if (data.type === 'video_pause') {
      this.videoSync.handleRemoteVideoAction('pause');
    } else if (data.type === 'video_seek') {
      this.videoSync.handleRemoteVideoAction('seek', data.time);
    }
  }

  handleServerMatch(data) {
    this.ui.addSystemMessage(`Match found! Connecting...`);
    this.ui.updateStatus('Connecting...');

    if (data.initiateCall) {
      setTimeout(() => {
        this.peerManager.connectToPartner(data.partnerPeerId);
      }, 1000);
    }
  }

  handlePartnerSkipped() {
    this.ui.addSystemMessage('Stranger skipped you. Searching for a new partner...');
    this.handleSkip();
  }

  handlePartnerDisconnected() {
    this.ui.addSystemMessage('Stranger disconnected.');
    this.peerManager.disconnect();
  }

  handleMoodInference(text, shouldSync = false) {
    const detectedMood = this.sentiment.detectMood(text);

    if (detectedMood) {
      this.neutralCounter = 0;
      if (detectedMood !== this.currentMood) {
        this.applyMood(detectedMood);
        if (shouldSync) {
          this.peerManager.sendData({ type: 'mood', mood: detectedMood });
        }
      }
    } else {
      this.neutralCounter++;
      if (this.neutralCounter >= 3 && this.currentMood !== 'default') {
        this.applyMood('default');
        if (shouldSync) {
          this.peerManager.sendData({ type: 'mood', mood: 'default' });
        }
      }
    }
  }

  applyMood(mood) {
    if (mood === this.currentMood) return;

    this.ui.applyMood(mood, this.sentiment.MOODS);
    this.currentMood = mood;

    if (mood !== 'default') {
      this.ui.addSystemMessage(`✨ Vibe Shift: ${mood.charAt(0).toUpperCase() + mood.slice(1)} mood detected!`);
    }
  }
}

new Omego();
