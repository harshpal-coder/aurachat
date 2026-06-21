import Peer from 'peerjs';

export class PeerManager {
  constructor(options) {
    this.onPeerOpen = options.onPeerOpen;
    this.onDataReceived = options.onDataReceived;
    this.onConnectionClose = options.onConnectionClose;
    this.onConnectionOpen = options.onConnectionOpen;
    this.onPeerError = options.onPeerError;
    this.addSystemMessage = options.addSystemMessage;

    this.peer = null;
    this.peerId = null;
    this.dataConn = null;
  }

  initPeer() {
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
      this.onPeerOpen(id);
    });

    this.peer.on('connection', (conn) => {
      this.handleIncomingDataConnection(conn);
    });

    this.peer.on('error', (err) => {
      this.onPeerError(err);
    });
  }

  handleIncomingDataConnection(conn) {
    this.dataConn = conn;
    this.setupDataHandlers(conn);
  }

  connectToPartner(partnerPeerId) {
    const conn = this.peer.connect(partnerPeerId);
    if (conn) {
      this.handleIncomingDataConnection(conn);
    }
  }

  setupDataHandlers(conn) {
    conn.on('open', () => {
      this.onConnectionOpen();
    });

    conn.on('data', (data) => {
      this.onDataReceived(data);
    });

    conn.on('close', () => {
      this.handleDisconnect();
    });
  }

  sendData(data) {
    if (this.dataConn && this.dataConn.open) {
      this.dataConn.send(data);
      return true;
    }
    return false;
  }

  handleDisconnect() {
    if (this.dataConn) {
      this.dataConn.close();
      this.dataConn = null;
    }
    this.onConnectionClose();
  }

  disconnect() {
    this.handleDisconnect();
  }
}
