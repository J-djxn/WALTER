
(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });

  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const speedEl = document.getElementById('speed');
  const startScreen = document.getElementById('start');
  const overScreen = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const finalCoinsEl = document.getElementById('finalCoins');
  const newRecordBadge = document.getElementById('newRecordBadge');

  const loadedAssets = {};

  const ASSETS_TO_PRELOAD = [
    'walkingwalter.gif',
    'walter_astro.gif',
    'walter_ninja.gif',
    'coin.gif',
    'coin_static.png',
    'terrain.png',
    'rock_1.png',
    'rock_2.png',
    'rock_3.png',
    'rock_4.png'
  ];

  window.terrainTileWidth = 1000;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function preloadAssets(onComplete) {
    let loaded = 0;
    const total = ASSETS_TO_PRELOAD.length;
    const fill = document.getElementById('loaderFill');
    const percent = document.getElementById('loaderPercent');
    const status = document.getElementById('loaderStatus');
    const preloader = document.getElementById('preloader');

    if (total === 0) {
      if (preloader) preloader.style.display = 'none';
      onComplete();
      return;
    }

    function step() {
      loaded++;
      const pct = Math.min(100, Math.floor((loaded / total) * 100));
      if (fill) fill.style.width = pct + '%';
      if (percent) percent.textContent = pct + '%';
      if (status) status.textContent = `Loaded ${loaded} / ${total} assets`;

      if (loaded >= total) {
        setTimeout(() => {
          if (preloader) {
            preloader.style.opacity = '0';
            preloader.style.transition = 'opacity 0.35s ease';
            setTimeout(() => { preloader.style.display = 'none'; }, 350);
          }
          onComplete();
        }, 180);
      }
    }

    ASSETS_TO_PRELOAD.forEach(src => {
      const img = new Image();
      img.onload = () => {
        loadedAssets[src] = img;
        if (src === 'terrain.png' && img.naturalHeight > 0) {
          const trackH = 460;
          const tileW = Math.max(200, Math.round(img.naturalWidth * (trackH / img.naturalHeight)) || 1000);
          window.terrainTileWidth = tileW;
        }
        step();
      };
      img.onerror = step;
      img.src = src;
    });

    setTimeout(() => {
      if (preloader && preloader.style.display !== 'none') {
        preloader.style.display = 'none';
        onComplete();
      }
    }, 4500);
  }

  const ROCK_SRCS = ['rock_1.png','rock_2.png','rock_3.png','rock_4.png'];
  const rocks = [];
  const coins = [];

  let running = false;
  let last = 0;
  let accumulator = 0;
  const FIXED_DT = 1 / 60; // 60 FPS physics

  let worldX = 0;
  let speed = 270;
  let y = 0;
  let vy = 0;
  let dist = 0;
  let coinCount = 0;
  let nextRockAt = 650;
  let nextCoinAt = 400;

  let lastDisplayedScore = -1;
  let lastDisplayedSpeed = -1;

  const GRAVITY = 2300;
  const JUMP = 820;
  const BASE_SPEED = 270;
  const MAX_SPEED = 600;
  const PLAYER_W = 75;
  const PLAYER_H = 100;

  let audioCtx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let muted = false;
  let musicNodes = [];
  let musicTimer = null;

  function ensureAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain();
    musicGain.gain.value = 0.22;
    musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain();
    sfxGain.gain.value = 0.7;
    sfxGain.connect(masterGain);
  }

  function resumeAudio() {
    ensureAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.55;
    document.getElementById('muteBtn').textContent = muted ? 'ðŸ”‡ Muted' : 'ðŸ”Š Sound';
  }

  function noiseBuffer(dur) {
    const len = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playJump() {
    if (muted || !audioCtx) return;
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(280, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.12);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.2);
  }

  function playCoin() {
    if (muted || !audioCtx) return;
    const t = audioCtx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0.22, t + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.16);
      o.connect(g); g.connect(sfxGain);
      o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.18);
    });
  }

  function playCrash() {
    if (muted || !audioCtx) return;
    const t = audioCtx.currentTime;
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer(0.35);
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filter); filter.connect(g); g.connect(sfxGain);
    src.start(t); src.stop(t + 0.4);

    const o = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g2.gain.setValueAtTime(0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g2); g2.connect(sfxGain);
    o.start(t); o.stop(t + 0.32);
  }

  const CHORDS = [
    [220.00, 261.63, 329.63], [174.61, 220.00, 261.63],
    [196.00, 246.94, 293.66], [164.81, 196.00, 246.94]
  ];
  let chordIdx = 0;
  const BAR_SEC = 3.4;

  function stopMusic() {
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    musicNodes.forEach(n => { try { n.stop(); } catch (_) {} });
    musicNodes = [];
  }

  function playPadChord(freqs, start, dur) {
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      filter.type = 'lowpass'; filter.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.05 - i * 0.007, start + 0.45);
      g.gain.setValueAtTime(0.05 - i * 0.007, start + dur - 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(filter); filter.connect(g); g.connect(musicGain);
      o.start(start); o.stop(start + dur + 0.05);
      musicNodes.push(o);
    });
  }

  function scheduleBar() {
    if (!audioCtx || muted || !running) return;
    const t0 = audioCtx.currentTime + 0.04;
    const chord = CHORDS[chordIdx % CHORDS.length];
    chordIdx++;
    playPadChord(chord, t0, BAR_SEC * 0.97);
    musicTimer = setTimeout(scheduleBar, BAR_SEC * 1000);
  }

  function startMusic() {
    stopMusic();
    chordIdx = 0;
    if (!muted) {
      if (musicGain) musicGain.gain.value = 0.30;
      scheduleBar();
    }
  }

  const starsData = [];
  for (let i = 0; i < 40; i++) {
    starsData.push({
      x: Math.random(),
      y: Math.random() * 0.7,
      size: 1 + Math.random() * 2.4,
      opacity: 0.3 + Math.random() * 0.6
    });
  }

  function groundY() { return 245; }
  function playerCenterX() { return canvas.width * 0.22; }

  function makeRock(x) {
    if (rocks.length >= 14) return;
    const src = ROCK_SRCS[Math.floor(Math.random() * ROCK_SRCS.length)];
    const scale = 0.68 + Math.random() * 0.24;
    const w = 110 * scale;
    const h = 115 * scale;
    rocks.push({ x, src, w, h });
  }

  function makeCoin(x, air = true) {
    if (coins.length >= 8) return;
    const size = 44;
    const heightOff = air ? (75 + Math.random() * 85) : 18;
    coins.push({ x, w: size, h: size, heightOff, taken: false });
  }

  function clearEntities() {
    rocks.length = 0;
    coins.length = 0;
  }

  function updateHUD() {
    const curScore = Math.floor(dist);
    const curSpeed = Math.round(speed / 10);
    if (curScore !== lastDisplayedScore) {
      scoreEl.textContent = curScore;
      lastDisplayedScore = curScore;
    }
    if (curSpeed !== lastDisplayedSpeed) {
      speedEl.textContent = curSpeed;
      lastDisplayedSpeed = curSpeed;
    }
  }

  function spawnAhead() {
    const ahead = worldX + canvas.width + 700;
    while (nextRockAt < ahead && rocks.length < 12) {
      makeRock(nextRockAt);
      if (speed >= 450 && Math.random() < 0.35) {
        const doubleOffset = 30 + Math.random() * 12;
        makeRock(nextRockAt + doubleOffset);
        nextRockAt += doubleOffset;
      }
      nextRockAt += 520 + Math.random() * 380 + Math.min(180, dist / 8);
    }
    while (nextCoinAt < ahead && coins.length < 8) {
      makeCoin(nextCoinAt, Math.random() > 0.3);
      nextCoinAt += 340 + Math.random() * 360;
    }
  }

  function recycle() {
    const cx = playerCenterX();
    for (let i = rocks.length - 1; i >= 0; i--) {
      if (cx + rocks[i].x - worldX < -180) {
        rocks.splice(i, 1);
      }
    }
    for (let i = coins.length - 1; i >= 0; i--) {
      if (coins[i].taken || cx + coins[i].x - worldX < -120) {
        coins.splice(i, 1);
      }
    }
  }

  const particles = [];
  function jump() {
    if (running && y === 0) {
      vy = JUMP; y = 0.1; playJump();
      const groundScreenY = canvas.height - groundY();
      for(let i=0; i<15; i++) {
        particles.push({
          x: playerCenterX(),
          y: groundScreenY,
          vx: (Math.random() - 0.5) * 200,
          vy: -(Math.random() * 150 + 50),
          size: Math.random() * 5 + 3,
          life: 1.0
        });
      }
    }
  }

  function startGame() {
    resumeAudio();
    running = true;
    last = performance.now();
    accumulator = 0;
    worldX = 0; speed = BASE_SPEED; y = 0; vy = 0;
    dist = 0; coinCount = 0; nextRockAt = 700; nextCoinAt = 450;
    lastDisplayedScore = -1; lastDisplayedSpeed = -1;
    clearEntities();
    startScreen.style.display = 'none';
    overScreen.style.display = 'none';
    coinsEl.textContent = '0'; scoreEl.textContent = '0';
    speedEl.textContent = Math.round(BASE_SPEED / 10);
    spawnAhead(); render(performance.now()); startMusic();
    requestAnimationFrame(loop);
  }

  async function crash() {
    running = false;
    playCrash(); stopMusic();

    const finalDist = Math.floor(dist);
    finalScoreEl.textContent = finalDist;
    finalCoinsEl.textContent = coinCount;

    let isNewRecord = false;
    const account = window.connectedAccount || ("Guest_" + Math.floor(1000 + Math.random() * 9000));
    
    const res = await savePlayerScorePHP(account, finalDist, coinCount);
    if (res && finalDist >= res.newBestDist && finalDist > 0) {
      isNewRecord = true;
    }

    newRecordBadge.style.display = isNewRecord ? 'block' : 'none';
    overScreen.style.display = 'grid';
  }

  function goHome() {
    overScreen.style.display = 'none';
    startScreen.style.display = 'grid';
    switchTab('game');
    if (window.connectedAccount) {
      fetchLeaderboardPHP(window.connectedAccount);
    }
  }

  function collide() {
    const g = groundY();
    const px = playerCenterX();
    const pL = px - PLAYER_W * 0.32;
    const pR = px + PLAYER_W * 0.32;
    const pB = g + y;
    const pT = pB + PLAYER_H * 0.85;

    for (const r of rocks) {
      const sx = px + r.x - worldX;
      const l = sx - r.w * 0.38;
      const rr = sx + r.w * 0.38;
      const top = g + r.h * 0.78;
      if (pR > l && pL < rr && pB < top && pT > g + 4) {
        if (y < r.h * 0.58) { crash(); return; }
      }
    }

    for (const c of coins) {
      if (c.taken) continue;
      const sx = px + c.x - worldX;
      const cy = g + c.heightOff + c.h * 0.5;
      const dx = Math.abs(px - sx);
      const dy = Math.abs((pB + (pT - pB) / 2) - cy);
      if (dx < 45 && dy < 50) {
        c.taken = true;
        coinCount += 1;
        coinsEl.textContent = coinCount;
        dist += 15;
        playCoin();
      }
    }
  }

  function updatePhysics(dt) {
    speed = Math.min(MAX_SPEED, BASE_SPEED + Math.min(330, dist * 0.15));
    worldX += speed * dt;
    dist += (speed * dt) / 16;

    if (y > 0 || vy > 0) {
      y += vy * dt;
      let currentGravity = GRAVITY;
      if (Math.abs(vy) < 250) {
        currentGravity = GRAVITY * 0.45;
      } else if (vy < 0) {
        currentGravity = GRAVITY * 1.3;
      }
      vy -= currentGravity * dt;
      if (y <= 0) { 
        y = 0; 
        vy = 0; 
        window.landTime = performance.now(); 
      }
    }

    spawnAhead();
    recycle();
    collide();
  }

  function render(now) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#1a0f22');
    skyGrad.addColorStop(0.4, '#2a1535');
    skyGrad.addColorStop(1, '#17101d');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < starsData.length; i++) {
      const s = starsData[i];
      ctx.globalAlpha = s.opacity;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    const g = groundY();
    const groundScreenY = h - g;
    const cx = playerCenterX();

    const terrainImg = loadedAssets['terrain.png'];
    const trackH = 460;
    const tileW = window.terrainTileWidth || 1000;
    const offset = Math.round(worldX % tileW);

    if (terrainImg) {
      for (let tx = -offset; tx < w + tileW; tx += tileW) {
        ctx.drawImage(terrainImg, tx, h - trackH, tileW, trackH);
      }
    }

    for (let i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      const rImg = loadedAssets[r.src];
      if (rImg) {
        const sx = Math.round(cx + r.x - worldX);
        ctx.drawImage(rImg, sx - Math.round(r.w * 0.5), groundScreenY - r.h, r.w, r.h);
      }
    }

    const coinImg = loadedAssets['coin.gif'] || loadedAssets['coin_static.png'];
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.taken) continue;
      const sx = Math.round(cx + c.x - worldX);
      if (coinImg) {
        ctx.drawImage(coinImg, sx - Math.round(c.w * 0.5), groundScreenY - c.heightOff - c.h, c.w, c.h);
      }
    }

    const shadowPx = Math.round(cx);
    const shadowPy = groundScreenY + 4;
    const scaleShadow = (1 + y / 600);
    ctx.fillStyle = 'rgba(0,0,0,' + (y > 10 ? 0.25 : 0.45) + ')';
    ctx.beginPath();
    ctx.ellipse(shadowPx, shadowPy, 35 * scaleShadow, 6 * scaleShadow, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.life -= 0.025;
      if (p.life <= 0) {
        particles.splice(i, 1);
      } else {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1.0;

    const walterImg = loadedAssets[window.userStats.activeSkin || 'walkingwalter.gif'];
    const bob = (y === 0) ? Math.sin(now / 70) * 2.5 : 0;
    const walterX = Math.round(cx - 50);
    const walterY = Math.round(groundScreenY - y + 6 - bob - 110);

    if (walterImg) {
      ctx.save();
      let scaleX = 1.0;
      let scaleY = 1.0;

      if (y > 0) {
        let stretch = Math.min(0.25, Math.abs(vy) / JUMP * 0.25);
        scaleX = 1.0 - stretch;
        scaleY = 1.0 + stretch;
      } else if (window.landTime && (now - window.landTime) < 150) {
        scaleX = 1.2;
        scaleY = 0.8;
      }

      ctx.translate(walterX + 50, walterY + 110);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-(walterX + 50), -(walterY + 110));
      
      ctx.drawImage(walterImg, walterX, walterY, 100, 110);
      ctx.restore();
    }

    updateHUD();
  }

  function loop(now) {
    if (!running) return;
    if (!last) last = now;
    let frameTime = (now - last) / 1000;
    last = now;

    if (frameTime > 0.1) frameTime = 0.1;
    accumulator += frameTime;

    while (accumulator >= FIXED_DT) {
      updatePhysics(FIXED_DT);
      accumulator -= FIXED_DT;
      if (!running) return;
    }

    render(now);
    requestAnimationFrame(loop);
  }

  addEventListener('keydown', e => {
    if (['ArrowUp',' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w' || e.key === 'W') {
      jump();
    }
  });

  document.getElementById('startBtn').onclick = startGame;
  document.getElementById('restartBtn').onclick = startGame;
  document.getElementById('goHomeBtn').onclick = goHome;

  document.getElementById('muteBtn').onclick = () => {
    resumeAudio();
    setMuted(!muted);
    if (muted) stopMusic();
    else if (running) startMusic();
  };

  document.getElementById('game').addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.target.closest('.card')) return;
    if (!running) return;
    jump();
  });

  preloadAssets(() => {
    fetchLeaderboardPHP();
  });
})();

