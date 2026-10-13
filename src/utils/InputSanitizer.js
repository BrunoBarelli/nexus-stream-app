const USERNAME_MAX_LENGTH = 24;
const MESSAGE_MAX_LENGTH = 300;
const ROOM_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/i;
const ALLOWED_RESOLUTIONS = [720, 1080, 2160];
const ALLOWED_FPS = [30, 60, 120];
const ALLOWED_SOUND_MODES = ['game_only', 'all', 'mute'];

export class InputSanitizer {
  static roomId(value, fallback = 'nexus-room') {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.trim().toLowerCase();
    return ROOM_ID_PATTERN.test(cleaned) ? cleaned : fallback;
  }

  static username(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value
      .replace(/[<>]/g, '')
      .trim()
      .substring(0, USERNAME_MAX_LENGTH);
    return cleaned.length > 0 ? cleaned : null;
  }

  static message(value) {
    if (typeof value !== 'string') return null;
    const cleaned = value.trim().substring(0, MESSAGE_MAX_LENGTH);
    return cleaned.length > 0 ? cleaned : null;
  }

  static streamConfig(config) {
    if (!config || typeof config !== 'object') return null;

    const safe = {};
    const res = parseInt(config.res ?? config.resolution, 10);
    if (ALLOWED_RESOLUTIONS.includes(res)) safe.res = res;

    const fps = parseInt(config.fps, 10);
    if (ALLOWED_FPS.includes(fps)) safe.fps = fps;

    if (ALLOWED_SOUND_MODES.includes(config.sound ?? config.soundMode)) {
      safe.sound = config.sound ?? config.soundMode;
    }

    return Object.keys(safe).length > 0 ? safe : null;
  }
}
