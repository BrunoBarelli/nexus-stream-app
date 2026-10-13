import { Room } from './Room.js';

export class RoomManager {
  #rooms = new Map();
  #defaultRoomId;

  constructor(defaultRoomId = 'nexus-room') {
    this.#defaultRoomId = defaultRoomId;
  }

  getOrCreate(roomId) {
    const id = roomId || this.#defaultRoomId;
    if (!this.#rooms.has(id)) {
      this.#rooms.set(id, new Room(id));
    }
    return this.#rooms.get(id);
  }

  get(roomId) {
    return this.#rooms.get(roomId) || null;
  }

  removeIfEmpty(roomId) {
    const room = this.#rooms.get(roomId);
    if (room && room.listParticipants().length === 0 && roomId !== this.#defaultRoomId) {
      this.#rooms.delete(roomId);
    }
  }
}
