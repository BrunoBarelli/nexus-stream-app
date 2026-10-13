import { InputSanitizer } from './utils/InputSanitizer.js';

const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 5000;

export class SignalingHandler {
  #io;
  #roomManager;
  #chatTimestamps = new Map();

  constructor(io, roomManager) {
    this.#io = io;
    this.#roomManager = roomManager;
  }

  register(socket) {
    socket.on('room:join', (data) => this.#onJoin(socket, data));
    socket.on('stream:start', (data) => this.#onStreamStart(socket, data));
    socket.on('stream:stop', () => this.#onStreamStop(socket));
    socket.on('stream:config', (config) => this.#onStreamConfig(socket, config));
    socket.on('chat:message', (data) => this.#onChatMessage(socket, data));
    socket.on('signal:offer', (data) => this.#onOffer(socket, data));
    socket.on('signal:answer', (data) => this.#onAnswer(socket, data));
    socket.on('signal:ice-candidate', (data) => this.#onIceCandidate(socket, data));
    socket.on('disconnect', () => this.#onDisconnect(socket));
  }

  #channel(roomId) {
    return `room:${roomId}`;
  }

  #currentRoom(socket) {
    if (!socket.roomId) return null;
    return this.#roomManager.get(socket.roomId);
  }

  #isRateLimited(socketId) {
    const now = Date.now();
    const stamps = (this.#chatTimestamps.get(socketId) || [])
      .filter(t => now - t < CHAT_RATE_WINDOW_MS);
    if (stamps.length >= CHAT_RATE_LIMIT) return true;
    stamps.push(now);
    this.#chatTimestamps.set(socketId, stamps);
    return false;
  }

  #onJoin(socket, data = {}) {
    const roomId = InputSanitizer.roomId(data.roomId);
    const room = this.#roomManager.getOrCreate(roomId);

    if (socket.roomId && socket.roomId !== roomId) {
      socket.leave(this.#channel(socket.roomId));
      const previous = this.#currentRoom(socket);
      if (previous) {
        previous.removeParticipant(socket.id);
        this.#broadcastParticipants(previous);
      }
    }

    socket.join(this.#channel(roomId));
    socket.roomId = roomId;

    const fallback = `Convidado_${socket.id.substring(0, 4)}`;
    const username = InputSanitizer.username(data.username) || fallback;
    const user = room.addParticipant(socket.id, username);

    console.log(`[Sala] ${user.username} entrou em ${roomId}`);

    socket.emit('room:state', room.buildStateFor(socket.id, user));
    this.#broadcastParticipants(room);

    if (room.isStreaming() && room.streamerId !== socket.id) {
      this.#io.to(room.streamerId).emit('viewer:joined', { viewerId: socket.id });
    }
  }

  #onStreamStart(socket, data = {}) {
    const room = this.#currentRoom(socket);
    if (!room) return;

    const safeConfig = InputSanitizer.streamConfig(data.config);
    const config = room.startStream(socket.id, safeConfig);

    console.log(`[Stream] ${socket.id} iniciou transmissao na sala ${room.id}`);

    this.#io.to(this.#channel(room.id)).emit('stream:status', {
      isLive: true,
      streamerId: socket.id,
      config
    });

    room.listParticipants().forEach(p => {
      if (p.id !== socket.id) {
        socket.emit('viewer:joined', { viewerId: p.id });
      }
    });
  }

  #onStreamStop(socket) {
    const room = this.#currentRoom(socket);
    if (!room || !room.stopStream(socket.id)) return;

    console.log(`[Stream] Transmissao encerrada na sala ${room.id}`);

    this.#io.to(this.#channel(room.id)).emit('stream:status', {
      isLive: false,
      streamerId: null
    });
    this.#io.to(this.#channel(room.id)).emit('viewer:left', { viewerId: socket.id });
  }

  #onStreamConfig(socket, config) {
    const room = this.#currentRoom(socket);
    if (!room || !room.isStreamer(socket.id)) return;

    const safeConfig = InputSanitizer.streamConfig(config);
    if (!safeConfig) return;

    room.updateConfig(safeConfig);
    this.#io.to(this.#channel(room.id)).emit('stream:config', room.streamConfig);
  }

  #onChatMessage(socket, data = {}) {
    const room = this.#currentRoom(socket);
    if (!room) return;

    if (this.#isRateLimited(socket.id)) return;

    const text = InputSanitizer.message(data.text);
    if (!text) return;

    const participant = room.getParticipant(socket.id);
    const username = participant?.username
      || InputSanitizer.username(data.username)
      || 'Convidado';

    const msg = room.addMessage(username, text);
    this.#io.to(this.#channel(room.id)).emit('chat:broadcast', msg);
  }

  #onOffer(socket, { targetViewerId, offer } = {}) {
    if (typeof targetViewerId !== 'string' || !offer) return;
    this.#io.to(targetViewerId).emit('signal:offer', { streamerId: socket.id, offer });
  }

  #onAnswer(socket, { streamerId, answer } = {}) {
    if (typeof streamerId !== 'string' || !answer) return;
    this.#io.to(streamerId).emit('signal:answer', { viewerId: socket.id, answer });
  }

  #onIceCandidate(socket, { targetId, candidate } = {}) {
    if (typeof targetId !== 'string' || !candidate) return;
    this.#io.to(targetId).emit('signal:ice-candidate', { fromId: socket.id, candidate });
  }

  #onDisconnect(socket) {
    this.#chatTimestamps.delete(socket.id);

    const room = this.#currentRoom(socket);
    if (!room) return;

    const wasStreamer = room.isStreamer(socket.id);
    room.removeParticipant(socket.id);

    if (wasStreamer) {
      this.#io.to(this.#channel(room.id)).emit('stream:status', {
        isLive: false,
        streamerId: null
      });
    }

    this.#broadcastParticipants(room);
    this.#io.to(this.#channel(room.id)).emit('viewer:left', { viewerId: socket.id });
    this.#roomManager.removeIfEmpty(room.id);
  }

  #broadcastParticipants(room) {
    this.#io.to(this.#channel(room.id)).emit('participants:update', room.listParticipants());
  }
}
