const socket = io();
const roomId = 'nexus-room';

const streamVideo = document.getElementById('streamVideo');
const standbyScreen = document.getElementById('standbyScreen');
const liveBadge = document.getElementById('liveBadge');
const viewerPulseDot = document.getElementById('viewerPulseDot');
const liveStatusText = document.getElementById('liveStatusText');
const viewerCountEl = document.getElementById('viewerCount');
const streamBadge = document.getElementById('streamBadge');
const reactionCanvas = document.getElementById('reactionCanvas');

// HUD Stats
const toggleHudBtn = document.getElementById('toggleHudBtn');
const hudOverlay = document.getElementById('hudOverlay');
const hudRes = document.getElementById('hudRes');
const hudFps = document.getElementById('hudFps');
const hudBitrate = document.getElementById('hudBitrate');
const hudPing = document.getElementById('hudPing');
const hudEchoStatus = document.getElementById('hudEchoStatus');

// Controles de Mídia
const playPauseBtn = document.getElementById('playPauseBtn');
const muteBtn = document.getElementById('muteBtn');
const volumeSlider = document.getElementById('volumeSlider');
const boostBtn = document.getElementById('boostBtn');
const antiEchoBtn = document.getElementById('antiEchoBtn');
const antiEchoStatusLabel = document.getElementById('antiEchoStatusLabel');
const pipBtn = document.getElementById('pipBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const stageContainer = document.getElementById('stageContainer');

let peerConnection = null;
let statsInterval = null;
let audioContext = null;
let gainNode = null;
let notchFilter1 = null;
let notchFilter2 = null;

let isBoosted = false;
let isAntiEchoActive = true; // Ativado por padrão para proteger contra eco

let lastBytesReceived = 0;
let lastTimestamp = 0;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const viewerName = `Viewer_${Math.floor(Math.random()*9000+1000)}`;
socket.emit('room:join', { roomId, username: viewerName });

socket.on('stream:status', ({ isLive, config }) => {
  updateLiveState(isLive, config);
});

socket.on('stream:config', (config) => {
  if (config) {
    streamBadge.textContent = `${config.res === 2160 ? '4K' : config.res + 'p'} • ${config.fps || 60} FPS`;
  }
});

socket.on('participants:update', (list) => {
  if (Array.isArray(list)) viewerCountEl.textContent = list.length;
});

function updateLiveState(isLive, config) {
  if (isLive) {
    liveBadge.classList.remove('bg-slate-800/80', 'border-slate-700/60', 'text-slate-400');
    liveBadge.classList.add('bg-nexus-red/20', 'border-nexus-red', 'text-white');
    viewerPulseDot.classList.remove('hidden');
    liveStatusText.textContent = 'AO VIVO';
    if (config) {
      streamBadge.textContent = `${config.res === 2160 ? '4K' : (config.res || 1080) + 'p'} • ${config.fps || 60} FPS`;
    }
  } else {
    liveBadge.classList.add('bg-slate-800/80', 'border-slate-700/60', 'text-slate-400');
    liveBadge.classList.remove('bg-nexus-red/20', 'border-nexus-red', 'text-white');
    viewerPulseDot.classList.add('hidden');
    liveStatusText.textContent = 'STANDBY';
    standbyScreen.style.display = 'flex';
    streamVideo.srcObject = null;
    clearInterval(statsInterval);
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  }
}

// Sinalização WebRTC
socket.on('signal:offer', async ({ streamerId, offer }) => {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.ontrack = (event) => {
    if (!streamVideo.srcObject) {
      streamVideo.srcObject = event.streams[0];
      setupAudioDSP(event.streams[0]);
    }
    standbyScreen.style.display = 'none';
    streamVideo.play().catch(() => {});
    startStatsMonitoring();
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal:ice-candidate', {
        targetId: streamerId,
        candidate: event.candidate
      });
    }
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit('signal:answer', { streamerId, answer });
});

socket.on('signal:ice-candidate', async ({ candidate }) => {
  if (peerConnection && candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error(e);
    }
  }
});

// Configuração de Áudio Web Audio com FILTRO DSP ANTI-ECO
function setupAudioDSP(mediaStream) {
  try {
    if (mediaStream.getAudioTracks().length === 0) return;

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Filtro Peaking 1: Atenua frequências vocais médias (1000 Hz)
    notchFilter1 = audioContext.createBiquadFilter();
    notchFilter1.type = 'peaking';
    notchFilter1.frequency.value = 1000;
    notchFilter1.Q.value = 1.0;
    notchFilter1.gain.value = isAntiEchoActive ? -20 : 0; // -20 dB de redução no eco da voz!

    // Filtro Peaking 2: Atenua frequências vocais agudas (2400 Hz)
    notchFilter2 = audioContext.createBiquadFilter();
    notchFilter2.type = 'peaking';
    notchFilter2.frequency.value = 2400;
    notchFilter2.Q.value = 1.2;
    notchFilter2.gain.value = isAntiEchoActive ? -18 : 0;

    // Nó de Ganho / Volume
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;

    // Conecta a cadeia de áudio: Fonte -> Filtro 1 -> Filtro 2 -> Ganho -> Alto-falantes
    source.connect(notchFilter1);
    notchFilter1.connect(notchFilter2);
    notchFilter2.connect(gainNode);
    gainNode.connect(audioContext.destination);

    streamVideo.muted = true; // Muta o elemento de vídeo para o áudio sair exclusivamente pelo processador DSP
    console.log('[Áudio] Escudo Anti-Eco ativado com sucesso.');
  } catch (err) {
    console.warn('Erro ao configurar DSP de áudio:', err);
  }
}

// Alternar Escudo Anti-Eco
antiEchoBtn.addEventListener('click', () => {
  isAntiEchoActive = !isAntiEchoActive;
  if (notchFilter1 && notchFilter2) {
    notchFilter1.gain.value = isAntiEchoActive ? -20 : 0;
    notchFilter2.gain.value = isAntiEchoActive ? -18 : 0;
  }

  if (isAntiEchoActive) {
    antiEchoBtn.classList.remove('bg-slate-700/40', 'border-slate-600', 'text-slate-400');
    antiEchoBtn.classList.add('bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-300');
    antiEchoStatusLabel.textContent = 'ATIVADO';
    hudEchoStatus.textContent = 'ATIVO (-20dB)';
    hudEchoStatus.classList.replace('text-red-400', 'text-emerald-400');
  } else {
    antiEchoBtn.classList.add('bg-slate-700/40', 'border-slate-600', 'text-slate-400');
    antiEchoBtn.classList.remove('bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-300');
    antiEchoStatusLabel.textContent = 'DESLIGADO';
    hudEchoStatus.textContent = 'DESLIGADO';
    hudEchoStatus.classList.replace('text-emerald-400', 'text-red-400');
  }
});

// Telemetria (Stats for Nerds)
function startStatsMonitoring() {
  clearInterval(statsInterval);
  statsInterval = setInterval(async () => {
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          if (report.framesPerSecond) {
            hudFps.textContent = `${report.framesPerSecond} FPS`;
          }
          if (report.frameWidth && report.frameHeight) {
            hudRes.textContent = `${report.frameWidth}x${report.frameHeight}`;
          }
          if (report.bytesReceived && lastTimestamp) {
            const timeDiff = report.timestamp - lastTimestamp;
            const bps = ((report.bytesReceived - lastBytesReceived) * 8) / (timeDiff / 1000);
            hudBitrate.textContent = `${(bps / (1024 * 1024)).toFixed(2)} Mbps`;
            lastBytesReceived = report.bytesReceived;
          } else {
            lastBytesReceived = report.bytesReceived || 0;
          }
          lastTimestamp = report.timestamp;
        }

        if (report.type === 'candidate-pair' && report.currentRoundTripTime) {
          hudPing.textContent = `${Math.round(report.currentRoundTripTime * 1000)} ms`;
        }
      });
    } catch (err) {}
  }, 1000);
}

toggleHudBtn.addEventListener('click', () => {
  hudOverlay.classList.toggle('hidden');
  hudOverlay.classList.toggle('flex');
});

// Controles de Volume e Boost
boostBtn.addEventListener('click', () => {
  isBoosted = !isBoosted;
  if (gainNode) {
    gainNode.gain.value = isBoosted ? 2.5 : 1.0;
  }
  boostBtn.classList.toggle('bg-nexus-cyan', isBoosted);
  boostBtn.classList.toggle('text-black', isBoosted);
});

playPauseBtn.addEventListener('click', () => {
  if (streamVideo.paused) {
    streamVideo.play();
  } else {
    streamVideo.pause();
  }
});

muteBtn.addEventListener('click', () => {
  if (gainNode) {
    gainNode.gain.value = gainNode.gain.value > 0 ? 0 : (isBoosted ? 2.5 : 1.0);
  }
});

volumeSlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (gainNode) {
    gainNode.gain.value = val * (isBoosted ? 2.5 : 1.0);
  }
});

pipBtn.addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled && !streamVideo.paused) {
      await streamVideo.requestPictureInPicture();
    }
  } catch (err) {
    console.error(err);
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    stageContainer.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
});

// Reações
document.querySelectorAll('.react-emoji-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.emit('reaction:send', { emoji: btn.dataset.emoji });
  });
});

socket.on('reaction:broadcast', ({ emoji }) => {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.left = `${Math.floor(Math.random() * 80) + 10}%`;
  reactionCanvas.appendChild(el);
  setTimeout(() => el.remove(), 3000);
});

document.body.addEventListener('click', () => {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  if (streamVideo.paused && streamVideo.srcObject) {
    streamVideo.play().catch(() => {});
  }
}, { once: true });
