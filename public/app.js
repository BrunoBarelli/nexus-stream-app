const ROOM_ID = 'nexus-room';
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
const RES_MAP = {
  720: { width: 1280, height: 720 },
  1080: { width: 1920, height: 1080 },
  2160: { width: 3840, height: 2160 }
};

function el(id) {
  return document.getElementById(id);
}

function sanitizeText(value, max = 300) {
  return String(value ?? '').trim().substring(0, max);
}

class Toast {
  static show(msg) {
    const toast = el('toast');
    toast.textContent = sanitizeText(msg, 120);
    toast.classList.remove('opacity-0', 'translate-y-2');
    setTimeout(() => toast.classList.add('opacity-0', 'translate-y-2'), 2500);
  }
}

class AuthManager {
  constructor(onAuthenticated) {
    this.modal = el('authModal');
    this.closeBtn = el('closeAuthBtn');
    this.openBtn = el('authModalBtn');
    this.guestBtn = el('guestInstantBtn');
    this.divider = el('authDivider');
    this.headerName = el('headerUserName');
    this.headerAvatar = el('headerUserAvatar');
    this.onAuthenticated = onAuthenticated;
    this.user = JSON.parse(localStorage.getItem('nexus_auth_user') || 'null');
  }

  get displayName() {
    return this.user?.name || `Convidado_${Math.floor(Math.random() * 8999 + 1000)}`;
  }

  init() {
    this.openBtn.addEventListener('click', () => this.open(true));
    this.closeBtn.addEventListener('click', () => this.modal.classList.add('hidden'));
    this.guestBtn.addEventListener('click', () => {
      this.guestBtn.classList.add('hidden');
      el('guestNickRow').classList.remove('hidden');
      el('guestNickInput')?.focus();
    });

    el('guestConfirmBtn')?.addEventListener('click', () => this.#continueAsGuest());
    el('guestAutoBtn')?.addEventListener('click', () => {
      if (el('guestNickInput')) el('guestNickInput').value = '';
      this.#continueAsGuest();
    });

    window.handleGoogleCredentialResponse = (response) => this.#onGoogleCredential(response);
    window.addEventListener('load', () => setTimeout(() => this.#initGoogle(), 800));

    if (this.user) {
      this.#applyUser(this.user);
      this.closeBtn.classList.remove('hidden');
    } else {
      this.open(false);
      this.#applyUser({ name: 'Novo Visitante', provider: 'guest' });
    }
  }

  open(allowClose) {
    this.closeBtn.classList.toggle('hidden', !allowClose);
    this.modal.classList.remove('hidden');
  }

  #initGoogle() {
    const clientId = window.NEXUS_CONFIG?.googleClientId;
    if (!clientId || !window.google?.accounts?.id) return;

    google.accounts.id.initialize({
      client_id: clientId,
      callback: window.handleGoogleCredentialResponse,
      auto_select: false
    });
    const wrapper = el('googleOfficialBtnWrapper');
    if (wrapper) {
      google.accounts.id.renderButton(wrapper, {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 320
      });
    }
    this.divider?.classList.remove('hidden');
  }

  #onGoogleCredential(response) {
    const payload = this.#parseJwt(response.credential);
    if (!payload || !payload.email) return;

    const user = {
      name: sanitizeText(payload.name || payload.email.split('@')[0], 24),
      avatarUrl: typeof payload.picture === 'string' && payload.picture.startsWith('https://') ? payload.picture : null,
      provider: 'google'
    };
    this.#login(user);
  }

  #continueAsGuest() {
    const nick = sanitizeText(el('guestNickInput')?.value, 24);
    const name = sanitizeText(nick, 24) || `Convidado_${Math.floor(Math.random() * 8999 + 1000)}`;
    this.#login({ name, provider: 'guest' });
  }

  #login(user) {
    this.user = user;
    localStorage.setItem('nexus_auth_user', JSON.stringify(user));
    this.#applyUser(user);
    this.modal.classList.add('hidden');
    this.closeBtn.classList.remove('hidden');
    this.onAuthenticated(user.name);
    Toast.show(`Voce entrou como: ${user.name}`);
  }

  #applyUser(user) {
    this.headerName.textContent = sanitizeText(user.name || 'Convidado', 24);
    this.headerAvatar.replaceChildren();

    if (user.avatarUrl) {
      this.headerAvatar.className = 'w-5 h-5 rounded-full overflow-hidden shadow-sm shrink-0 border border-white/20';
      const img = document.createElement('img');
      img.src = user.avatarUrl;
      img.alt = '';
      img.className = 'w-full h-full object-cover';
      this.headerAvatar.appendChild(img);
      return;
    }

    const styles = {
      google: 'w-4 h-4 rounded-full bg-white text-[#4285F4] flex items-center justify-center text-[9px] font-bold shadow-sm',
      guest: 'w-4 h-4 rounded-full bg-slate-700 text-white flex items-center justify-center text-[9px] font-bold'
    };
    this.headerAvatar.className = styles[user.provider] || styles.guest;
    this.headerAvatar.textContent = (user.provider === 'google' ? 'G' : (user.name || 'C').charAt(0).toUpperCase());
  }

  #parseJwt(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }
}

class ParticipantsUI {
  constructor(socket) {
    this.socket = socket;
    this.count = el('participantsCount');
    this.container = el('participantsContainer');
    this.popover = el('participantsPopover');

    el('participantsDrawerBtn').addEventListener('click', () => this.popover.classList.toggle('hidden'));
    el('closeParticipantsBtn').addEventListener('click', () => this.popover.classList.add('hidden'));
  }

  render(list) {
    this.count.textContent = String(list.length);
    this.container.replaceChildren();

    list.forEach(u => {
      const isMe = u.id === this.socket.id;
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2 rounded-xl bg-white/5 text-xs';

      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 truncate';

      const avatar = document.createElement('div');
      avatar.className = 'w-6 h-6 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-bold text-[10px] text-black shrink-0';
      avatar.textContent = sanitizeText(u.username, 24).charAt(0).toUpperCase() || '?';

      const name = document.createElement('span');
      name.className = 'font-semibold text-slate-200 truncate';
      name.textContent = sanitizeText(u.username, 24);

      left.append(avatar, name);

      if (isMe) {
        const you = document.createElement('span');
        you.className = 'text-[10px] text-emerald-400 font-bold';
        you.textContent = '(voce)';
        left.appendChild(you);
      }

      const icon = document.createElement('i');
      icon.dataset.lucide = u.isMuted ? 'mic-off' : 'mic';
      icon.className = `w-3.5 h-3.5 ${u.isMuted ? 'text-red-400' : 'text-slate-400'}`;

      row.append(left, icon);
      this.container.appendChild(row);
    });

    lucide.createIcons();
  }
}

class ChatUI {
  #isOpen = true;

  constructor(socket, getUsername) {
    this.socket = socket;
    this.getUsername = getUsername;
    this.drawer = el('chatDrawer');
    this.list = el('chatMessageList');
    this.form = el('chatSubmitForm');
    this.input = el('chatTextInput');

    el('chatDrawerBtn').addEventListener('click', () => this.toggle());
    el('closeChatBtn').addEventListener('click', () => this.toggle());

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = sanitizeText(this.input.value);
      if (!text) return;
      this.socket.emit('chat:message', { text });
      this.input.value = '';
    });
  }

  toggle() {
    this.#isOpen = !this.#isOpen;
    this.drawer.classList.toggle('hidden', !this.#isOpen);
  }

  addMessage(msg) {
    el('emptyChatPlaceholder')?.remove();

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-col gap-0.5 text-xs';

    const meta = document.createElement('div');
    meta.className = 'flex items-center gap-1.5';

    const author = document.createElement('span');
    author.className = 'font-bold text-emerald-400';
    author.textContent = sanitizeText(msg.username, 24);

    const time = document.createElement('span');
    time.className = 'text-[10px] text-slate-500 font-mono';
    time.textContent = sanitizeText(msg.time, 10);

    meta.append(author, time);

    const body = document.createElement('p');
    body.className = 'text-slate-200 leading-relaxed break-words bg-white/5 p-2 rounded-xl border border-white/5';
    body.textContent = sanitizeText(msg.text);

    wrapper.append(meta, body);
    this.list.appendChild(wrapper);
    this.list.scrollTop = this.list.scrollHeight;
  }
}

class SettingsUI {
  constructor(onChange) {
    this.config = { res: 1080, fps: 60, sound: 'game_only' };
    this.onChange = onChange;
    this.modal = el('advancedSettingsModal');

    el('gearSettingsBtn').addEventListener('click', () => {
      this.modal.classList.remove('hidden');
      this.sync();
    });
    el('closeAdvancedSettingsBtn').addEventListener('click', () => this.modal.classList.add('hidden'));
    el('saveAdvSettingsBtn').addEventListener('click', () => {
      this.modal.classList.add('hidden');
      this.onChange();
      Toast.show('Configuracoes salvas!');
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.#applyPreset(btn));
    });
    document.querySelectorAll('.adv-res-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.config.res = parseInt(btn.dataset.res, 10);
        this.sync();
      });
    });
    document.querySelectorAll('.adv-fps-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.config.fps = parseInt(btn.dataset.fps, 10);
        this.sync();
      });
    });
    document.querySelectorAll('.adv-sound-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.adv-sound-pill').forEach(b => {
          b.classList.remove('bg-emerald-500', 'text-white', 'font-bold');
          b.classList.add('text-slate-400', 'font-medium');
        });
        btn.classList.add('bg-emerald-500', 'text-white', 'font-bold');
        btn.classList.remove('text-slate-400', 'font-medium');
        this.config.sound = btn.dataset.sound;
      });
    });
  }

  #applyPreset(btn) {
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.remove('bg-emerald-500/20', 'text-emerald-300', 'border', 'border-emerald-500/30', 'font-bold');
      b.classList.add('text-slate-400', 'font-medium');
    });
    btn.classList.add('bg-emerald-500/20', 'text-emerald-300', 'border', 'border-emerald-500/30', 'font-bold');
    btn.classList.remove('text-slate-400', 'font-medium');

    const presets = {
      gamer: { res: 1080, fps: 120 },
      cinema: { res: 2160, fps: 60 },
      balanced: { res: 720, fps: 60 }
    };
    const preset = presets[btn.dataset.preset];
    if (preset) {
      this.config.res = preset.res;
      this.config.fps = preset.fps;
      this.config.sound = 'game_only';
      this.sync();
    }
    Toast.show(`Preset aplicado: ${btn.textContent.trim()}`);
  }

  sync() {
    this.#mark('.adv-res-pill', 'res', this.config.res);
    this.#mark('.adv-fps-pill', 'fps', this.config.fps);
  }

  #mark(selector, key, value) {
    document.querySelectorAll(selector).forEach(p => {
      const active = parseInt(p.dataset[key], 10) === value;
      p.classList.toggle('bg-emerald-500/20', active);
      p.classList.toggle('border-emerald-500', active);
      p.classList.toggle('text-emerald-300', active);
      p.classList.toggle('font-bold', active);
    });
  }
}

class StreamController {
  constructor(socket, settings) {
    this.socket = socket;
    this.settings = settings;
    this.localStream = null;
    this.isStreaming = false;
    this.isAntiEchoOn = true;
    this.peerConnections = new Map();
    this.statsInterval = null;

    this.idleStage = el('idleHeroStage');
    this.liveStage = el('videoLiveStage');
    this.video = el('mainVideoPlayer');
    this.qualityBadge = el('badgeActiveQuality');
    this.soundBadge = el('badgeActiveSound');
    this.stopBtn = el('stopLiveBtn');
    this.shareBtn = el('shareScreenIslandBtn');
    this.shareLabel = el('screenShareBtnLabel');
    this.cameraBtn = el('shareCameraIslandBtn');

    this.#bindButtons();
    this.#bindSignals();
  }

  #bindButtons() {
    this.shareBtn.addEventListener('click', () => this.isStreaming ? this.stop() : this.start(false));
    el('heroStartScreenBtn').addEventListener('click', () => this.start(false));
    this.cameraBtn.addEventListener('click', () => this.isStreaming ? this.stop() : this.start(true));
    el('heroStartCamBtn').addEventListener('click', () => this.start(true));
    this.stopBtn.addEventListener('click', () => this.stop());

    el('antiEchoBadgeBtn').addEventListener('click', () => this.#toggleAntiEcho());
    el('pipBtn').addEventListener('click', () => this.#togglePip());
    el('fullscreenBtn').addEventListener('click', () => this.#toggleFullscreen());
    el('shareRoomBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(window.location.origin)
        .then(() => Toast.show('Link da sala copiado!'))
        .catch(() => prompt('Link:', window.location.origin));
    });
  }

  #bindSignals() {
    this.socket.on('stream:status', ({ isLive, streamerId, config }) => {
      if (config) this.settings.config = { ...this.settings.config, ...config };
      this.#updateLiveUI(isLive, streamerId === this.socket.id);
    });

    this.socket.on('viewer:joined', async ({ viewerId }) => {
      if (!this.localStream) return;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnections.set(viewerId, pc);
      this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

      pc.onicecandidate = (event) => {
        if (event.candidate) this.socket.emit('signal:ice-candidate', { targetId: viewerId, candidate: event.candidate });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('signal:offer', { targetViewerId: viewerId, offer });
    });

    this.socket.on('signal:offer', async ({ streamerId, offer }) => {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.peerConnections.set(streamerId, pc);

      pc.ontrack = (event) => {
        if (!this.video.srcObject) this.video.srcObject = event.streams[0];
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) this.socket.emit('signal:ice-candidate', { targetId: streamerId, candidate: event.candidate });
      };

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('signal:answer', { streamerId, answer });
    });

    this.socket.on('signal:answer', async ({ viewerId, answer }) => {
      const pc = this.peerConnections.get(viewerId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    this.socket.on('signal:ice-candidate', async ({ fromId, candidate }) => {
      const pc = this.peerConnections.get(fromId);
      if (pc && candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { }
      }
    });

    this.socket.on('viewer:left', ({ viewerId }) => {
      const pc = this.peerConnections.get(viewerId);
      if (pc && !this.isStreaming) {
        pc.close();
        this.peerConnections.delete(viewerId);
      }
    });
  }

  async start(isCamera = false) {
    try {
      const cfg = this.settings.config;
      const size = RES_MAP[cfg.res] || RES_MAP[1080];
      const antiEcho = this.isAntiEchoOn && cfg.sound === 'game_only';

      const audio = cfg.sound === 'mute' ? false : {
        echoCancellation: antiEcho,
        noiseSuppression: antiEcho,
        autoGainControl: false,
        suppressLocalAudioPlayback: true
      };

      const videoConstraints = {
        width: { ideal: size.width },
        height: { ideal: size.height },
        frameRate: { ideal: cfg.fps }
      };

      const stream = isCamera
        ? await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio })
        : await navigator.mediaDevices.getDisplayMedia({ video: videoConstraints, audio });

      this.localStream = stream;
      this.video.srcObject = stream;
      this.isStreaming = true;

      stream.getVideoTracks()[0].onended = () => this.stop();
      this.socket.emit('stream:start', { config: cfg });
      this.#updateLiveUI(true, true);
    } catch (err) {
      console.warn('Captura cancelada:', err);
      Toast.show('Nao foi possivel iniciar a captura. Tente de novo.');
    }
  }

  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.isStreaming = false;
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    clearInterval(this.statsInterval);

    this.socket.emit('stream:stop');
    this.#updateLiveUI(false, false);
  }

  #updateLiveUI(isLive, isMe) {
    const cfg = this.settings.config;
    if (isLive) {
      this.idleStage.classList.add('hidden');
      this.liveStage.classList.remove('hidden');
      this.shareLabel.textContent = isMe ? 'Parar' : 'Transmitir';
      this.shareBtn.classList.toggle('bg-red-500', isMe);
      this.stopBtn.style.display = isMe ? 'inline-block' : 'none';
      this.qualityBadge.textContent = `${cfg.res === 2160 ? '4K' : cfg.res + 'p'} • ${cfg.fps} FPS`;
      this.soundBadge.textContent = this.isAntiEchoOn ? 'So do Jogo (Anti-Eco)' : 'Audio Completo';
      this.#startTelemetry();
    } else {
      this.idleStage.classList.remove('hidden');
      this.liveStage.classList.add('hidden');
      this.video.srcObject = null;
      this.shareLabel.textContent = 'Transmitir';
      this.shareBtn.classList.remove('bg-red-500');
      this.stopBtn.style.display = 'none';
      clearInterval(this.statsInterval);
    }
  }

  #startTelemetry() {
    clearInterval(this.statsInterval);
    const cfg = this.settings.config;
    const label = cfg.res === 2160 ? '4K' : cfg.res + 'p';
    this.statsInterval = setInterval(() => {
      el('telemetryStats').textContent = `${label} @ ${cfg.fps} FPS (P2P)`;
    }, 2000);
  }

  #toggleAntiEcho() {
    this.isAntiEchoOn = !this.isAntiEchoOn;
    const badge = el('antiEchoBadgeBtn');
    el('antiEchoStatusText').textContent = this.isAntiEchoOn ? 'ATIVO' : 'DESLIGADO';
    badge.classList.toggle('bg-emerald-500/20', this.isAntiEchoOn);
    badge.classList.toggle('border-emerald-500/40', this.isAntiEchoOn);
    badge.classList.toggle('text-emerald-300', this.isAntiEchoOn);
    badge.classList.toggle('bg-white/10', !this.isAntiEchoOn);
    badge.classList.toggle('text-slate-400', !this.isAntiEchoOn);
    Toast.show(this.isAntiEchoOn ? 'Escudo Anti-Eco ativado.' : 'Escudo Anti-Eco desativado.');
  }

  async #togglePip() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (this.video.srcObject) {
        await this.video.requestPictureInPicture();
      }
    } catch { }
  }

  #toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.liveStage.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen();
    }
  }
}

class ReactionUI {
  constructor(container) {
    this.container = container;
    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => this.spawn(btn.dataset.emoji));
    });
  }

  spawn(emoji) {
    const node = document.createElement('div');
    node.className = 'floating-emoji';
    node.textContent = sanitizeText(emoji, 8);
    node.style.left = `${Math.floor(Math.random() * 80) + 10}%`;
    this.container.appendChild(node);
    setTimeout(() => node.remove(), 3000);
  }
}

class RoomApp {
  constructor() {
    this.socket = io();
    this.auth = new AuthManager((name) => this.#onAuthenticated(name));
    this.settings = new SettingsUI(() => this.socket.emit('stream:config', this.settings.config));
    this.stream = new StreamController(this.socket, this.settings);
    this.participants = new ParticipantsUI(this.socket);
    this.chat = new ChatUI(this.socket, () => this.auth.displayName);
    this.reactions = new ReactionUI(el('reactionCanvas'));
  }

  start() {
    this.auth.init();
    this.socket.emit('room:join', { roomId: ROOM_ID, username: this.auth.displayName });

    this.socket.on('room:state', ({ isLive, streamerId, streamConfig, participants, messages }) => {
      this.participants.render(participants);
      (messages || []).forEach(m => this.chat.addMessage(m));
      if (streamConfig) this.settings.config = { ...this.settings.config, ...streamConfig };
    });

    this.socket.on('participants:update', (list) => this.participants.render(list));
    this.socket.on('chat:broadcast', (msg) => this.chat.addMessage(msg));
  }

  #onAuthenticated(name) {
    this.socket.emit('room:join', { roomId: ROOM_ID, username: name });
  }
}

new RoomApp().start();
