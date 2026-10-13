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

function sanitizeText(value, max = 120) {
  return String(value ?? '').trim().substring(0, max);
}

class Toast {
  static show(msg) {
    const toast = el('toast');
    toast.textContent = sanitizeText(msg);
    toast.classList.remove('opacity-0', 'translate-y-2');
    setTimeout(() => toast.classList.add('opacity-0', 'translate-y-2'), 2500);
  }
}

class SetupPanel {
  constructor(onChange) {
    this.captureMode = 'screen';
    this.res = 1080;
    this.fps = 60;
    this.sound = 'game_only';
    this.onChange = onChange;

    this.#bindPills('.capture-btn', 'mode', (v) => this.#onCaptureMode(v));
    this.#bindPills('.res-pill', 'res', (v) => { this.res = parseInt(v, 10); });
    this.#bindPills('.fps-pill', 'fps', (v) => { this.fps = parseInt(v, 10); });
    this.#bindPills('.sound-pill', 'sound', (v) => this.#onSoundMode(v));
  }

  get config() {
    return { res: this.res, fps: this.fps, sound: this.sound };
  }

  #bindPills(selector, key, apply) {
    document.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(selector).forEach(b => {
          b.classList.remove('bg-[#c026d3]', 'text-white', 'font-bold');
          b.classList.add('text-[#9ca3af]', 'font-medium');
        });
        btn.classList.add('bg-[#c026d3]', 'text-white', 'font-bold');
        btn.classList.remove('text-[#9ca3af]', 'font-medium');

        apply(btn.dataset[key]);
        this.onChange();
      });
    });
  }

  #onCaptureMode(mode) {
    this.captureMode = mode;
    const desc = el('captureDesc');
    if (mode === 'screen') {
      desc.textContent = 'O normal. Voce escolhe uma janela, uma aba ou a tela inteira no seletor do navegador.';
    } else if (mode === 'turbo') {
      desc.textContent = 'NexusTurbo: Modo Gamer 120 FPS de altissima taxa de quadros e menor tempo de resposta.';
      this.fps = 120;
    } else if (mode === 'camera') {
      desc.textContent = 'Transmite diretamente da sua Webcam, Camera Virtual do OBS Studio ou Placa de Captura USB.';
    }
  }

  #onSoundMode(mode) {
    this.sound = mode;
    const desc = el('soundDesc');
    if (mode === 'game_only') {
      desc.textContent = 'Tenta levar so o som da janela escolhida, sem as vozes do Discord. A tela inteira vai sem som.';
    } else if (mode === 'all') {
      desc.textContent = 'Captura todo o som do computador (atencao: vozes de amigos podem ecoar sem fones).';
    } else {
      desc.textContent = 'Transmissao silenciosa (muda), sem enviar nenhum audio.';
    }
  }

  estimatedBandwidth() {
    let mbps = 2.6;
    if (this.res === 720 && this.fps === 30) mbps = 1.8;
    else if (this.res === 720 && this.fps >= 60) mbps = 2.8;
    else if (this.res === 1080 && this.fps === 30) mbps = 3.2;
    else if (this.res === 1080 && this.fps === 60) mbps = 4.8;
    else if (this.res === 2160) mbps = 15.0;
    if (this.captureMode === 'turbo') mbps = mbps * 1.5;
    return mbps;
  }
}

class StudioUI {
  constructor(panel) {
    this.panel = panel;
    this.setupView = el('setupView');
    this.studioView = el('studioView');
    this.video = el('hostStudioVideo');
    this.duration = el('liveDuration');
    this.viewerCount = el('studioViewerCount');
    this.clock = null;
    this.startTime = null;
  }

  showStudio(stream) {
    this.video.srcObject = stream;
    this.setupView.classList.add('hidden');
    this.studioView.classList.remove('hidden');
    this.#updateBadges();
    this.#startClock();
  }

  showSetup(message) {
    this.video.srcObject = null;
    this.studioView.classList.add('hidden');
    this.setupView.classList.remove('hidden');
    this.#stopClock();

    if (message) {
      el('statusAlert').className = 'bg-[#241e17] border border-[#784617]/40 rounded-xl px-4 py-2.5 text-xs text-[#eab308] flex items-center justify-between';
      el('statusMessage').textContent = message;
      el('statusDot').className = 'w-2 h-2 rounded-full bg-yellow-500';
    }
    lucide.createIcons();
  }

  setViewerCount(count) {
    this.viewerCount.textContent = String(Math.max(0, count - 1));
  }

  #updateBadges() {
    const cfg = this.panel.config;
    el('studioQualityBadge').textContent = `${cfg.res === 2160 ? '4K Fonte' : cfg.res + 'p'} • ${cfg.fps} FPS`;

    const badge = el('studioSoundBadge');
    badge.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'w-3.5 h-3.5';
    const labels = { game_only: ['shield-check', 'So do Jogo (Zero Eco)'], all: ['volume-2', 'Audio Completo'], mute: ['volume-x', 'Sem Som'] };
    const [iconName, text] = labels[cfg.sound] || labels.game_only;
    icon.dataset.lucide = iconName;
    badge.appendChild(icon);
    badge.appendChild(document.createTextNode(` ${text}`));
    lucide.createIcons();
  }

  #startClock() {
    this.startTime = Date.now();
    clearInterval(this.clock);
    this.clock = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const s = String(elapsed % 60).padStart(2, '0');
      this.duration.textContent = `${h}:${m}:${s}`;
    }, 1000);
  }

  #stopClock() {
    clearInterval(this.clock);
    this.startTime = null;
  }
}

class StreamerSession {
  constructor(socket, panel, studio) {
    this.socket = socket;
    this.panel = panel;
    this.studio = studio;
    this.localStream = null;
    this.isAudioMuted = false;
    this.peerConnections = new Map();
  }

  async start() {
    try {
      const cfg = this.panel.config;
      const size = RES_MAP[cfg.res] || RES_MAP[1080];

      const audio = cfg.sound === 'mute' ? false : {
        echoCancellation: cfg.sound === 'game_only',
        noiseSuppression: cfg.sound === 'game_only',
        autoGainControl: false,
        suppressLocalAudioPlayback: true
      };

      const stream = this.panel.captureMode === 'camera'
        ? await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: cfg.fps } },
            audio
          })
        : await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: cfg.sound === 'game_only' ? 'window' : 'monitor',
              width: { ideal: size.width, max: size.width },
              height: { ideal: size.height, max: size.height },
              frameRate: { ideal: cfg.fps, max: cfg.fps }
            },
            audio
          });

      this.localStream = stream;
      stream.getVideoTracks()[0].onended = () => this.stop();

      this.socket.emit('stream:start', { config: cfg });
      this.studio.showStudio(stream);
    } catch (err) {
      console.warn('Captura cancelada ou negada:', err);
    }
  }

  stop() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.socket.emit('stream:stop');
    this.studio.showSetup('Transmissao encerrada. Voce ja pode fechar esta aba.');
  }

  toggleAudio() {
    if (!this.localStream) return;
    const track = this.localStream.getAudioTracks()[0];
    if (!track) return;

    this.isAudioMuted = !this.isAudioMuted;
    track.enabled = !this.isAudioMuted;
    el('studioMuteText').textContent = this.isAudioMuted ? 'Audio Mutado' : 'Audio Ativo';
    el('studioMuteBtn').classList.toggle('bg-red-500/20', this.isAudioMuted);
    el('studioMuteBtn').classList.toggle('text-red-300', this.isAudioMuted);
  }

  async connectViewer(viewerId) {
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
  }

  async acceptAnswer(viewerId, answer) {
    const pc = this.peerConnections.get(viewerId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addCandidate(fromId, candidate) {
    const pc = this.peerConnections.get(fromId);
    if (pc && candidate) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }

  dropViewer(viewerId) {
    const pc = this.peerConnections.get(viewerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(viewerId);
    }
  }
}

class StreamerApp {
  constructor() {
    this.socket = io();
    this.panel = new SetupPanel(() => this.#updateBandwidth());
    this.studio = new StudioUI(this.panel);
    this.session = new StreamerSession(this.socket, this.panel, this.studio);
  }

  start() {
    const username = `Host_${Math.floor(Math.random() * 8999 + 1000)}`;
    this.socket.emit('room:join', { roomId: ROOM_ID, username });

    el('mainActionBtn').addEventListener('click', () => this.session.start());
    el('studioStopBtn').addEventListener('click', () => this.session.stop());
    el('studioMuteBtn').addEventListener('click', () => this.session.toggleAudio());
    el('reopenSettingsBtn').addEventListener('click', () => {
      this.studio.studioView.classList.add('hidden');
      this.studio.setupView.classList.remove('hidden');
    });
    el('copyLinkBtnSetup').addEventListener('click', () => this.#copyLink());
    el('studioCopyLinkBtn').addEventListener('click', () => this.#copyLink());

    this.socket.on('viewer:joined', ({ viewerId }) => this.session.connectViewer(viewerId));
    this.socket.on('signal:answer', ({ viewerId, answer }) => this.session.acceptAnswer(viewerId, answer));
    this.socket.on('signal:ice-candidate', ({ fromId, candidate }) => this.session.addCandidate(fromId, candidate));
    this.socket.on('viewer:left', ({ viewerId }) => this.session.dropViewer(viewerId));
    this.socket.on('participants:update', (list) => this.studio.setViewerCount(list.length));

    this.#updateBandwidth();
  }

  #updateBandwidth() {
    const mbps = this.panel.estimatedBandwidth();
    el('bandwidthDisplay').textContent = `${mbps.toFixed(1).replace('.', ',')} Mbps`;
  }

  #copyLink() {
    navigator.clipboard.writeText(window.location.origin)
      .then(() => Toast.show('Link da sala copiado!'))
      .catch(() => prompt('Copie o link abaixo:', window.location.origin));
  }
}

new StreamerApp().start();
