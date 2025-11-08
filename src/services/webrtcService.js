// Gerencia peers e conexões WebRTC no servidor
export class WebRTCService {
  constructor(io) {
    this.io = io;
    this.peers = new Map(); // roomId -> Map(userId -> peerData)
  }

  addPeer(roomId, userId, socketId) {
    if (!this.peers.has(roomId)) {
      this.peers.set(roomId, new Map());
    }

    this.peers.get(roomId).set(userId, {
      socketId,
      audioLevel: 0,
      lastUpdate: Date.now()
    });

    console.log(`🎤 Peer added to room ${roomId}: ${userId}`);
  }

  removePeer(roomId, userId) {
    const room = this.peers.get(roomId);
    if (room) {
      room.delete(userId);
      if (room.size === 0) {
        this.peers.delete(roomId);
      }
    }
    console.log(`🚫 Peer removed from room ${roomId}: ${userId}`);
  }

  updateAudioLevel(roomId, userId, level) {
    const room = this.peers.get(roomId);
    if (room && room.has(userId)) {
      const peer = room.get(userId);
      peer.audioLevel = level;
      peer.lastUpdate = Date.now();
    }
  }

  getRoomPeers(roomId) {
    return Array.from(this.peers.get(roomId)?.keys() || []);
  }
}