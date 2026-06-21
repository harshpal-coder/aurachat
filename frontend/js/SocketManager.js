import { io } from 'socket.io-client';

export class SocketManager {
  constructor(options) {
    this.backendUrl = options.backendUrl;
    this.onConnect = options.onConnect;
    this.onOnlineCount = options.onOnlineCount;
    this.onMatch = options.onMatch;
    this.onPartnerSkipped = options.onPartnerSkipped;
    this.onPartnerDisconnected = options.onPartnerDisconnected;

    this.socket = null;
  }

  initSocket() {
    this.socket = io(this.backendUrl);

    this.socket.on('connect', () => {
      if (this.onConnect) this.onConnect();
    });

    this.socket.on('online_count', (count) => {
      if (this.onOnlineCount) this.onOnlineCount(count);
    });

    this.socket.on('match', (data) => {
      if (this.onMatch) this.onMatch(data);
    });

    this.socket.on('partner_skipped', () => {
      if (this.onPartnerSkipped) this.onPartnerSkipped();
    });

    this.socket.on('partner_disconnected', () => {
      if (this.onPartnerDisconnected) this.onPartnerDisconnected();
    });
  }

  joinQueue(peerId, interests) {
    if (this.socket) {
      if (this.socket.connected) {
        this.socket.emit('join_queue', { peerId, interests });
      } else {
        this.socket.once('connect', () => {
          this.socket.emit('join_queue', { peerId, interests });
        });
      }
    }
  }

  emitSkip() {
    if (this.socket) {
      this.socket.emit('skip');
    }
  }

  emitChatMessage(text) {
    if (this.socket) {
      this.socket.emit('chat_message', text);
    }
  }

  emitChatImage(imageData) {
    if (this.socket) {
      this.socket.emit('chat_image', imageData);
    }
  }
}
