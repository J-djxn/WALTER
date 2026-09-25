
window.connectedAccount = null;
window.connectedProvider = null;
window.gameSecurityToken = null;
window.userStats = { bestDist: 0, bestCoins: 0, totalDist: 0, totalCoins: 0, name: '', races: [], unlockedSkins: ['walkingwalter.gif'], activeSkin: 'walkingwalter.gif' };
window.leaderboardData = { weekly: [], allTime: [] };
window.activeLbSubTab = 'weekly';

function showNotice(msg) {
  const box = document.getElementById('noticeBox');
  if (!box) return;
  box.textContent = msg;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

async function fetchLeaderboardPHP(account = '') {
  try {
    const localStats = localStorage.getItem('walter_userStats');
    if (localStats) {
      window.userStats = { ...window.userStats, ...JSON.parse(localStats) };
    }
    if (!window.userStats.unlockedSkins) window.userStats.unlockedSkins = ['walkingwalter.gif'];
    if (!window.userStats.activeSkin) window.userStats.activeSkin = 'walkingwalter.gif';

    window.leaderboardData = { weekly: [], allTime: [] };
    renderLeaderboard();
    if (account) {
      updateConnectedAccountStats(window.userStats);
    }
  } catch (err) {
    console.warn("Could not load scores:", err);
  }
}

async function savePlayerScorePHP(account, dist, coins) {
  try {
    window.userStats.totalCoins += coins;
    window.userStats.totalDist += dist;
    if (dist > window.userStats.bestDist) window.userStats.bestDist = dist;
    if (coins > window.userStats.bestCoins) window.userStats.bestCoins = coins;
    
    window.userStats.races.unshift({ dist, coins, timestamp: Math.floor(Date.now() / 1000) });
    if (window.userStats.races.length > 5) window.userStats.races.pop();

    localStorage.setItem('walter_userStats', JSON.stringify(window.userStats));
    renderLeaderboard();
    updateConnectedAccountStats(window.userStats);
    
    return {
      newBestDist: window.userStats.bestDist,
      userBestCoins: window.userStats.bestCoins
    };
  } catch (err) {
    console.warn("Could not save score:", err);
  }
  return { newBestDist: dist, newBestCoins: coins };
}

const STORE_SKINS = [
  { id: 'walkingwalter.gif', name: 'Default Walter', price: 0 },
  { id: 'walter_astro.gif', name: 'Astro Walter', price: 500 },
  { id: 'walter_ninja.gif', name: 'Ninja Walter', price: 1000 }
];

window.renderSkinStore = function() {
  const container = document.getElementById('skinStoreGrid');
  if (!container) return;
  container.innerHTML = '';
  
  STORE_SKINS.forEach(skin => {
    const isOwned = window.userStats.unlockedSkins.includes(skin.id);
    const isActive = window.userStats.activeSkin === skin.id;
    const canAfford = window.userStats.totalCoins >= skin.price;
    
    let btnHtml = '';
    if (isActive) {
      btnHtml = `<button class="secondary" disabled style="width:100%; opacity:0.8;">Equipped</button>`;
    } else if (isOwned) {
      btnHtml = `<button onclick="purchaseSkin('${skin.id}', 0)" style="width:100%;">Equip</button>`;
    } else {
      btnHtml = `<button onclick="purchaseSkin('${skin.id}', ${skin.price})" style="width:100%; ${!canAfford ? 'opacity:0.5; cursor:not-allowed;' : ''}" ${!canAfford ? 'disabled' : ''}>Buy (${skin.price} Coins)</button>`;
    }

    container.innerHTML += `
      <div style="background:#17101d; border:1px solid #87513e; border-radius:8px; padding:10px; display:flex; align-items:center; gap:10px;">
        <img src="${skin.id}" style="width:40px; height:44px; image-rendering:pixelated;" alt="${skin.name}">
        <div style="flex:1; text-align:left;">
          <div style="font-size:9px; color:#ffe9b0; margin-bottom:4px;">${skin.name}</div>
          <div style="font-size:7px; color:#ffd76a;">${skin.price > 0 ? skin.price + ' Coins' : 'Free'}</div>
        </div>
        <div style="width:100px;">
          ${btnHtml}
        </div>
      </div>
    `;
  });
};

window.purchaseSkin = function(skinId, cost) {
  if (!window.userStats.unlockedSkins.includes(skinId)) {
    if (window.userStats.totalCoins >= cost) {
      window.userStats.totalCoins -= cost;
      window.userStats.unlockedSkins.push(skinId);
      window.userStats.activeSkin = skinId;
      localStorage.setItem('walter_userStats', JSON.stringify(window.userStats));
      updateConnectedAccountStats(window.userStats);
      if (typeof window.renderSkinStore === 'function') window.renderSkinStore();
      showNotice("Skin Purchased & Equipped!");
    } else {
      showNotice("Not enough coins!");
    }
  } else {
    window.userStats.activeSkin = skinId;
    localStorage.setItem('walter_userStats', JSON.stringify(window.userStats));
    if (typeof window.renderSkinStore === 'function') window.renderSkinStore();
    showNotice("Skin Equipped!");
  }
};

async function updateProfileName() {
  if (!window.connectedAccount) {
    showNotice("Please connect wallet first.");
    return;
  }
  const nameInput = document.getElementById('profNameInput');
  if (!nameInput) return;
  const newName = nameInput.value.trim();
  if (!newName) {
    showNotice("Please enter a valid display name.");
    return;
  }

  try {
    const res = await fetch('api.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Game-Token': window.gameSecurityToken || ''
      },
      body: JSON.stringify({
        address: window.connectedAccount,
        name: newName,
        action: 'update_name',
        token: window.gameSecurityToken || ''
      })
    });
    const data = await res.json();
    if (data.success) {
      showNotice("Name updated successfully!");
      if (data.userProfile) {
        updateConnectedAccountStats(data.userProfile);
      }
      if (data.weekly || data.allTime) {
        window.leaderboardData = {
          weekly: data.weekly || [],
          allTime: data.allTime || []
        };
        renderLeaderboard();
      }
    } else {
      showNotice(data.message || "Failed to update name.");
    }
  } catch (err) {
    showNotice("Error updating name.");
  }
}

function switchTab(tab) {
  document.getElementById('tabGameBtn').classList.toggle('active', tab === 'game');
  document.getElementById('tabLbBtn').classList.toggle('active', tab === 'leaderboard');
  const profBtn = document.getElementById('tabProfBtn');
  if (profBtn) profBtn.classList.toggle('active', tab === 'profile');

  document.getElementById('tabGame').classList.toggle('active', tab === 'game');
  document.getElementById('tabLeaderboard').classList.toggle('active', tab === 'leaderboard');
  const profTab = document.getElementById('tabProfile');
  if (profTab) profTab.classList.toggle('active', tab === 'profile');

  if (tab === 'leaderboard') {
    renderLeaderboard();
  } else if (tab === 'profile' && window.connectedAccount) {
    fetchLeaderboardPHP(window.connectedAccount);
  }
}

function switchProfSubTab(subTab) {
  document.getElementById('profUserSubTabBtn').classList.toggle('active', subTab === 'user');
  document.getElementById('profRedeemSubTabBtn').classList.toggle('active', subTab === 'redeem');
  document.getElementById('profSubTabUser').style.display = subTab === 'user' ? 'block' : 'none';
  document.getElementById('profSubTabRedeem').style.display = subTab === 'redeem' ? 'block' : 'none';
  if (subTab === 'redeem' && typeof window.renderSkinStore === 'function') window.renderSkinStore();
}

function switchLbSubTab(type) {
  window.activeLbSubTab = type;
  document.getElementById('lbWeeklyBtn').classList.toggle('active', type === 'weekly');
  document.getElementById('lbAllTimeBtn').classList.toggle('active', type === 'allTime');
  
  const notice = document.getElementById('lbSubtabNotice');
  if (notice) {
    notice.textContent = type === 'weekly' 
      ? 'Top 10 Weekly Runners (Resets Sun Midnight)' 
      : 'Top 10 All-Time Highest Runners';
  }
  
  renderLeaderboard();
}

function renderLeaderboard() {
  const tbody = document.getElementById('lbTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const list = window.activeLbSubTab === 'weekly' 
    ? (window.leaderboardData.weekly || []) 
    : (window.leaderboardData.allTime || []);

  if (!list || list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:18px 8px; color:#a38173; font-size:8px; line-height:1.6;">
          NO SCORES YET<br><span style="font-size:7px; color:#ffe9b0;">Play a run to save to scores.json!</span>
        </td>
      </tr>
    `;
    return;
  }

  list.slice(0, 10).forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="lb-rank">${idx + 1}</td>
      <td>${item.name || item.address}</td>
      <td style="text-align:right;">${item.dist}m</td>
      <td style="text-align:right;">${item.coins}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderLastRaces(races) {
  const tbody = document.getElementById('profRacesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!races || races.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center; padding:12px; color:#a38173; font-size:7px;">
          No races recorded yet. Play a run!
        </td>
      </tr>
    `;
    return;
  }

  races.slice(0, 5).forEach((race) => {
    const d = race.timestamp ? new Date(race.timestamp * 1000) : new Date();
    const timeStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
                    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:#ffe9b0;">${timeStr}</td>
      <td style="text-align:right; color:#6affd7;">${race.dist}m</td>
      <td style="text-align:right; color:#ffd76a;">${race.coins}</td>
    `;
    tbody.appendChild(tr);
  });
}

function updateConnectedAccountStats(userProfile) {
  if (!window.connectedAccount) return;

  if (userProfile) {
    window.userStats.bestDist = userProfile.bestDist || 0;
    window.userStats.bestCoins = userProfile.bestCoins || 0;
    window.userStats.totalDist = userProfile.totalDist || 0;
    window.userStats.totalCoins = userProfile.totalCoins || 0;
    window.userStats.name = userProfile.name || '';
    window.userStats.races = userProfile.races || [];
  } else {
    const allList = window.leaderboardData.allTime || [];
    const ex = allList.find(p => p.address && p.address.toLowerCase() === window.connectedAccount.toLowerCase());
    if (ex) {
      window.userStats.bestDist = Math.max(window.userStats.bestDist || 0, ex.dist);
      window.userStats.bestCoins = Math.max(window.userStats.bestCoins || 0, ex.coins);
    }
  }

  // Update Player Account HUD Badge
  document.getElementById('userBestDist').textContent = window.userStats.bestDist;
  document.getElementById('userBestCoins').textContent = window.userStats.bestCoins;

  // Update Profile Tab Elements
  const nameInput = document.getElementById('profNameInput');
  if (nameInput && window.userStats.name) {
    nameInput.value = window.userStats.name;
  }
  
  const totalDistEl = document.getElementById('profTotalDist');
  if (totalDistEl) totalDistEl.textContent = (window.userStats.totalDist || 0) + ' m';

  const totalCoinsEl = document.getElementById('profTotalCoins');
  if (totalCoinsEl) totalCoinsEl.textContent = window.userStats.totalCoins || 0;

  renderLastRaces(window.userStats.races || []);
  if (typeof window.renderSkinStore === 'function') window.renderSkinStore();
}

function getMetaMaskProvider() {
  if (typeof window.ethereum === 'undefined') return null;
  if (Array.isArray(window.ethereum.providers)) {
    return window.ethereum.providers.find(p => p.isMetaMask) || null;
  }
  return window.ethereum.isMetaMask ? window.ethereum : null;
}

function getPhantomProvider() {
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solana?.isPhantom) return window.solana;
  return null;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function connectMetaMask(forceSelect = false) {
  const provider = getMetaMaskProvider();
  if (!provider) {
    if (isMobileDevice()) {
      showNotice("Opening MetaMask app...");
      const dappUrl = window.location.href.replace(/^https?:\/\//, '');
      window.location.href = "https://metamask.app.link/dapp/" + dappUrl;
      return;
    }
    showNotice("MetaMask extension not found! Please install MetaMask.");
    return;
  }

  try {
    if (forceSelect) {
      try {
        await provider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch (pErr) {
        if (pErr.code === 4001) {
          showNotice("Account selection prompt canceled.");
          return;
        }
      }
    }
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (accounts && accounts.length > 0) {
      setConnectedAccount(accounts[0], 'METAMASK');
    }
  } catch(e) {
    if (e.code === 4001) {
      showNotice("MetaMask connection request rejected.");
    } else {
      showNotice("MetaMask error: " + (e.message || "Failed to connect"));
    }
  }
}

async function connectPhantom(forceSelect = false) {
  const provider = getPhantomProvider();
  if (!provider) {
    if (isMobileDevice()) {
      showNotice("Opening Phantom app...");
      const url = encodeURIComponent(window.location.href);
      window.location.href = "https://phantom.app/ul/browse/" + url + "?ref=" + url;
      return;
    }
    showNotice("Phantom Solana wallet extension not found!");
    return;
  }

  try {
    if (forceSelect && typeof provider.disconnect === 'function') {
      await provider.disconnect();
    }
    const resp = await provider.connect({ onlyIfTrusted: false });
    if (resp && resp.publicKey) {
      setConnectedAccount(resp.publicKey.toString(), 'PHANTOM');
    }
  } catch(e) {
    showNotice("Phantom connection canceled.");
  }
}

function switchWalletAccount() {
  if (window.connectedProvider === 'METAMASK') {
    connectMetaMask(true);
  } else if (window.connectedProvider === 'PHANTOM') {
    connectPhantom(true);
  }
}

function disconnectWallet() {
  window.connectedAccount = null;
  window.connectedProvider = null;
  window.userStats = { bestDist: 0, bestCoins: 0, totalDist: 0, totalCoins: 0, name: '', races: [] };
  
  document.getElementById('walletLoggedOut').style.display = 'block';
  document.getElementById('walletLoggedIn').style.display = 'none';
  document.getElementById('loginBadge').textContent = 'GUEST';
  document.getElementById('loginBadge').style.color = '#a38173';
  
  // Hide Profile Tab
  const profBtn = document.getElementById('tabProfBtn');
  if (profBtn) profBtn.style.display = 'none';
  switchTab('game');

  showNotice("Wallet disconnected.");
}

function setConnectedAccount(account, providerName) {
  window.connectedAccount = account;
  window.connectedProvider = providerName;
  document.getElementById('walletLoggedOut').style.display = 'none';
  document.getElementById('walletLoggedIn').style.display = 'block';
  document.getElementById('loginBadge').textContent = providerName;
  document.getElementById('loginBadge').style.color = '#6affd7';
  document.getElementById('userAddressText').textContent = account.length > 16 ? account.substring(0,8) + '...' + account.slice(-6) : account;
  
  // Show Profile Tab for logged in user
  const profBtn = document.getElementById('tabProfBtn');
  if (profBtn) profBtn.style.display = 'flex';

  fetchLeaderboardPHP(account);
  setupWalletEventListeners();
  showNotice(`Connected: ${providerName}`);
}

function setupWalletEventListeners() {
  const mmProvider = getMetaMaskProvider();
  if (mmProvider && mmProvider.on && !mmProvider._hasWalterListeners) {
    mmProvider._hasWalterListeners = true;
    mmProvider.on('accountsChanged', (accounts) => {
      if (accounts && accounts.length > 0 && window.connectedProvider === 'METAMASK') {
        setConnectedAccount(accounts[0], 'METAMASK');
      } else if (window.connectedProvider === 'METAMASK') {
        disconnectWallet();
      }
    });
  }

  const phProvider = getPhantomProvider();
  if (phProvider && phProvider.on && !phProvider._hasWalterListeners) {
    phProvider._hasWalterListeners = true;
    phProvider.on('accountChanged', (publicKey) => {
      if (publicKey && window.connectedProvider === 'PHANTOM') {
        setConnectedAccount(publicKey.toString(), 'PHANTOM');
      } else if (window.connectedProvider === 'PHANTOM') {
        disconnectWallet();
      }
    });
  }
}

