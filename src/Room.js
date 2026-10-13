const MAX_MESSAGES = 100;

export class Room {
  #id;
  #participants = new Map();
  #messages = [];
  #streamerId = null;
  #streamConfig;

  constructor(id) {
    this.#id = id;
    this.#streamConfig = { res: 1080, fps: 60, sound: 'game_only' };
  }

  get id() {
    return this.#id;
  }

  get streamerId() {
    return this.#streamerId;
  }

  get streamConfig() {
    return { ...this.#streamConfig };
  }

  addParticipant(socketId, username) {
    const participant = {
      id: socketId,
      username,
      isHost: this.#participants.size === 0 || this.#streamerId === socketId,
      isMuted: false
    };
    this.#participants.set(socketId, participant);
    return participant;
  }

  removeParticipant(socketId) {
    this.#participants.delete(socketId);
    if (this.#streamerId === socketId) this.#streamerId = null;
  }

  getParticipant(socketId) {
    return this.#participants.get(socketId) || null;
  }

  listParticipants() {
    return Array.from(this.#participants.values());
  }

  isStreaming() {
    return this.#streamerId !== null;
  }

  startStream(socketId, config) {
    this.#streamerId = socketId;
    if (config) this.#streamConfig = { ...this.#streamConfig, ...config };
    return this.#streamConfig;
  }

  stopStream(socketId) {
    if (this.#streamerId !== socketId) return false;
    this.#streamerId = null;
    return true;
  }

  isStreamer(socketId) {
    return this.#streamerId === socketId;
  }

  updateConfig(config) {
    this.#streamConfig = { ...this.#streamConfig, ...config };
    return this.#streamConfig;
  }

  addMessage(username, text) {
    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      username,
      text,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    this.#messages.push(msg);
    if (this.#messages.length > MAX_MESSAGES) this.#messages.shift();
    return msg;
  }

  getRecentMessages(limit = 50) {
    return this.#messages.slice(-limit);
  }

  buildStateFor(socketId, user) {
    return {
      user,
      isLive: this.isStreaming(),
      streamerId: this.#streamerId,
      streamConfig: this.streamConfig,
      participants: this.listParticipants(),
      messages: this.getRecentMessages()
    };
  }
}
