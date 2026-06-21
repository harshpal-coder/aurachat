import { createIcons, Send, Github, Sun, Moon, Image as ImageIcon, SkipForward, PlayCircle, Download } from 'lucide';

export class UIManager {
  constructor(options) {
    this.onStartSession = options.onStartSession;
    this.onSkip = options.onSkip;
    this.onSend = options.onSend;
    this.onImageSelect = options.onImageSelect;
    this.onWatchTogetherClick = options.onWatchTogetherClick;
    this.onCloseVideo = options.onCloseVideo;
    this.onTyping = options.onTyping; // Callback for input typing throttle

    this.typingTimeout = null;

    // Cache elements
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
    this.watchTogetherBtn = document.getElementById('watch-together-btn');
    this.videoOverlay = document.getElementById('video-overlay');
    this.videoContent = document.getElementById('video-content');
    this.closeVideoBtn = document.getElementById('close-video');

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

    this.bindEvents();
    this.initIcons();
  }

  initIcons() {
    createIcons({
      icons: { Send, Github, Sun, Moon, image: ImageIcon, SkipForward, PlayCircle, Download }
    });
  }

  bindEvents() {
    if (this.startTextBtn) {
      this.startTextBtn.addEventListener('click', () => this.onStartSession('text'));
    }

    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.onSkip());
    }

    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.submitMessage());
    }

    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

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
    if (this.confirmContinueBtn) {
      this.confirmContinueBtn.addEventListener('click', () => this.confirmSession());
    }

    if (this.chatInput) {
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submitMessage();
        }
      });

      this.chatInput.addEventListener('input', () => {
        this.onTyping();
      });
    }

    if (this.imageBtn) {
      this.imageBtn.addEventListener('click', () => this.imageInput.click());
    }

    if (this.imageInput) {
      this.imageInput.addEventListener('change', (e) => this.handleImageSelect(e));
    }

    if (this.watchTogetherBtn) {
      this.watchTogetherBtn.addEventListener('click', () => this.onWatchTogetherClick());
    }

    if (this.closeVideoBtn) {
      this.closeVideoBtn.addEventListener('click', () => this.onCloseVideo());
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.modalContainer.classList.contains('hidden')) {
          this.hideModals();
        } else if (!this.chatPage.classList.contains('hidden')) {
          this.onSkip();
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

  showModal(type) {
    if (!this.modalContainer) return;

    this.modalContainer.classList.remove('hidden');
    if (this.safetyModal) this.safetyModal.classList.add('hidden');
    if (this.privacyModal) this.privacyModal.classList.add('hidden');
    if (this.agreementModal) this.agreementModal.classList.add('hidden');

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
    if (this.modalContainer) this.modalContainer.classList.add('hidden');
    if (this.safetyModal) this.safetyModal.classList.add('hidden');
    if (this.privacyModal) this.privacyModal.classList.add('hidden');
    if (this.agreementModal) this.agreementModal.classList.add('hidden');
    document.body.style.overflow = ''; // Restore scrolling
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
    
    const appMain = document.querySelector('.app-main');
    if (appMain) appMain.style.paddingTop = '0';

    this.initIcons();
    this.clearChat();

    this.onStartSession('confirm');
  }

  submitMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;
    this.onSend(text);
  }

  clearChatInput() {
    if (this.chatInput) this.chatInput.value = '';
  }

  getInterests() {
    return this.interestsInput ? this.interestsInput.value.trim() : '';
  }

  handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.onImageSelect(file);
    this.imageInput.value = '';
  }

  updateOnlineCount(count) {
    if (this.onlineCountVal) {
      const start = parseInt(this.onlineCountVal.textContent.replace(/,/g, '')) || 0;
      this.animateValue(this.onlineCountVal, start, count, 1000);
    }
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

  updateStatus(status) {
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

  setMyIds(id) {
    if (this.myIdSpan) this.myIdSpan.textContent = id;
    if (this.myIdAltSpan) this.myIdAltSpan.textContent = id;
  }

  clearChat() {
    if (this.chatMessages) {
      this.chatMessages.innerHTML = '';
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

  showTyping(isTyping) {
    if (!this.typingContainer) return;

    if (isTyping) {
      this.typingContainer.classList.remove('hidden');

      if (this.typingTimeout) clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.typingContainer.classList.add('hidden');
      }, 3000);
    } else {
      this.typingContainer.classList.add('hidden');
      if (this.typingTimeout) clearTimeout(this.typingTimeout);
    }

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

  toggleVideoOverlay(show) {
    if (!this.videoOverlay) return;

    if (show) {
      this.videoOverlay.classList.remove('hidden');
    } else {
      this.videoOverlay.classList.add('hidden');
    }
  }

  applyMood(mood, keywordsMap) {
    // Remove all existing mood classes
    Object.keys(keywordsMap).forEach(m => {
      document.body.classList.remove(`mood-${m}`);
    });

    document.body.classList.remove('mood-active');
    void document.body.offsetWidth; // Force reflow

    if (mood !== 'default') {
      document.body.classList.add(`mood-${mood}`);
      document.body.classList.add('mood-active');
    }
  }
}
