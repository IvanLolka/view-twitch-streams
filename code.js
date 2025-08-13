const channels = ['streamdatabase', 'streamdatabase', 'streamdatabase', 'streamdatabase'];
const players = [];
const streamsContainer = document.querySelector('.streams');
let expandedIndex = -1;
const savedBlockRects = {};
const volControls = [];
const hideTimers = [];

function saveVolume(index, value) {
    try { localStorage.setItem('stream_vol_' + index, String(value)); } catch (e) {}
}
function loadVolume(index, fallback = 60) {
    try {
        const s = localStorage.getItem('stream_vol_' + index);
        if (s === null || s === undefined) return fallback;
        const n = Number(s);
        if (Number.isNaN(n)) return fallback;
        return Math.max(0, Math.min(100, Math.round(n)));
    } catch (e) {
        return fallback;
    }
}

function loadTwitchEmbedScript() {
    return new Promise((resolve, reject) => {
        if (window.Twitch && window.Twitch.Player) return resolve();
        const existing = document.querySelector('script[data-twitch-embed]');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Twitch script load error')));
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://player.twitch.tv/js/embed/v1.js';
        s.setAttribute('data-twitch-embed', '1');
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Twitch script load error'));
        document.head.appendChild(s);
    });
}

function waitForIframe(player, timeout = 4000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
            try {
                const iframe = player && typeof player.getIframe === 'function' ? player.getIframe() : null;
                if (iframe && iframe.contentWindow) return resolve(iframe);
            } catch (e) {}
            if (Date.now() - start > timeout) return reject(new Error('iframe not ready'));
            setTimeout(check, 75);
        })();
    });
}

function ensureVolume(index, vol = 0.6, attempts = 8, delay = 120) {
    const p = players[index];
    if (!p) return;
    let tries = 0;
    const attempt = () => {
        if (!players[index]) return;
        tries++;
        try { if (typeof p.setVolume === 'function') p.setVolume(vol); } catch (e) {}
        let ok = false;
        try {
            if (typeof p.getVolume === 'function') {
                const gv = p.getVolume();
                if (typeof gv === 'number' && Math.abs(gv - vol) < 0.02) ok = true;
            } else ok = true;
        } catch (e) {}
        if (!ok && tries < attempts) setTimeout(attempt, delay);
    };
    attempt();
}

function ensureUnmute(index, attempts = 8, delay = 120) {
    const p = players[index];
    if (!p) return;
    let tries = 0;
    const attempt = () => {
        tries++;
        try {
            if (typeof p.setMuted === 'function') p.setMuted(false);
            const iframe = p.getIframe && p.getIframe();
            if (iframe && iframe.contentWindow && typeof iframe.focus === 'function') {
                try { iframe.focus(); } catch (e) {}
            }
        } catch (e) {}
        let stillMuted = null;
        try { if (typeof p.getMuted === 'function') stillMuted = p.getMuted(); } catch (e) { stillMuted = null; }
        if ((stillMuted === false) || tries >= attempts) return;
        setTimeout(attempt, delay);
    };
    attempt();
}

async function createPlayer(index, channelName) {
    const container = document.getElementById('player-' + index);
    const host = window.location.hostname || 'localhost';
    const opts = { channel: channelName, width: '100%', height: '100%', parent: [host], muted: true, autoplay: true };

    const titleEl = document.getElementById('name-' + index);
    if (titleEl) titleEl.textContent = channelName || ('channel_' + (index + 1));

    try {
        const p = new Twitch.Player(container, opts);
        players[index] = p;
        players[index].__ready = false;
        players[index].__readyAt = 0;

        const onReady = async () => {
            players[index].__ready = true;
            players[index].__readyAt = Date.now();
            const initial = loadVolume(index) / 100;
            try { p.setVolume(initial); } catch (e) {}
            try { p.setMuted(true); } catch (e) {}
            try {
                await waitForIframe(p, 3000);
                try { p.setVolume(initial); } catch (e) {}
                try { p.setMuted(true); } catch (e) {}
            } catch (e) {}
            ensureVolume(index, initial, 6, 120);
        };

        if (typeof p.addEventListener === 'function') {
            p.addEventListener(Twitch.Player.READY, onReady);
        } else {
            setTimeout(onReady, 400);
        }
    } catch (e) {
        players[index] = null;
    }
}

async function createAllPlayers() {
    try {
        await loadTwitchEmbedScript();
    } catch (e) {
        console.error('Не удалось загрузить Twitch embed script', e);
    }
    for (let i = 0; i < channels.length; i++) {
        await createPlayer(i, channels[i]);
    }
    initOverlaysHandlers();
    initVolumeControls();
}

function initVolumeControls() {
    for (let i = 0; i < channels.length; i++) {
        const control = document.createElement('div');
        control.className = 'vol-control';
        control.setAttribute('data-v', String(i));
        const savedVal = loadVolume(i);
        control.innerHTML = `
            <input type="range" min="0" max="100" step="1" value="${savedVal}">
            <div class="vol-value">${savedVal}</div>
        `;
        streamsContainer.appendChild(control);
        volControls[i] = control;

        const range = control.querySelector('input[type="range"]');
        const val = control.querySelector('.vol-value');

        const initial = savedVal / 100;
        if (players[i]) {
            try { players[i].setVolume(initial); } catch (e) {}
            try { players[i].setMuted(true); } catch (e) {}
            ensureVolume(i, initial, 6, 120);
        }

        range.addEventListener('input', () => {
            const v = Number(range.value);
            val.textContent = String(v);
            const volNormalized = v / 100;
            try {
                if (players[i] && typeof players[i].setVolume === 'function') players[i].setVolume(volNormalized);
                if (players[i] && typeof players[i].setMuted === 'function') players[i].setMuted(false);
            } catch (e) {}
            saveVolume(i, v);
        });

        const muteOnRelease = () => {
            try { if (players[i] && typeof players[i].setMuted === 'function') players[i].setMuted(true); } catch (e) {}
        };
        range.addEventListener('pointerup', muteOnRelease);
        range.addEventListener('mouseup', muteOnRelease);
        range.addEventListener('touchend', muteOnRelease);
        range.addEventListener('change', muteOnRelease);

        control.addEventListener('mouseenter', () => {
            showControl(i);
            clearTimeout(hideTimers[i]);
        });
        control.addEventListener('mouseleave', () => {
            scheduleHide(i);
        });
    }
}

function positionControl(i) {
    const control = volControls[i];
    if (!control) return;

    if (expandedIndex === i) {
        control.style.left = '10px';
        control.style.top = (streamsContainer.clientHeight - control.offsetHeight - 10) + 'px';
        return;
    }

    const block = document.querySelector(`.block[data-i="${i}"]`);
    if (!block) return;
    const containerRect = streamsContainer.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const ctrlRect = control.getBoundingClientRect();

    const isTopRow = (i < 2);
    const left = Math.round(blockRect.left - containerRect.left + 8 + streamsContainer.scrollLeft);
    let top;
    if (isTopRow) {
        top = Math.round(blockRect.bottom - containerRect.top + 8 + streamsContainer.scrollTop);
    } else {
        top = Math.round(blockRect.top - containerRect.top - ctrlRect.height - 8 + streamsContainer.scrollTop);
    }
    control.style.left = left + 'px';
    control.style.top = top + 'px';
}
function positionAllControls() {
    for (let i = 0; i < volControls.length; i++) positionControl(i);
}
window.addEventListener('resize', positionAllControls);
streamsContainer.addEventListener('scroll', positionAllControls);
setTimeout(positionAllControls, 60);
setTimeout(positionAllControls, 350);
window.addEventListener('load', positionAllControls);

function showControl(i) {
    const c = volControls[i];
    if (!c) return;
    positionControl(i);
    c.classList.add('visible');
    clearTimeout(hideTimers[i]);
}
function hideControl(i) {
    const c = volControls[i];
    if (!c) return;
    c.classList.remove('visible');
}
function scheduleHide(i, delay = 350) {
    clearTimeout(hideTimers[i]);
    hideTimers[i] = setTimeout(() => hideControl(i), delay);
}

function expandBlock(idx) {
    if (expandedIndex === idx) return;
    collapseAllImmediate();
    const block = document.querySelector(`.block[data-i="${idx}"]`);
    if (!block) return;
    const containerRect = streamsContainer.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const relLeft = blockRect.left - containerRect.left + streamsContainer.scrollLeft;
    const relTop = blockRect.top - containerRect.top + streamsContainer.scrollTop;
    savedBlockRects[idx] = {
        left: relLeft,
        top: relTop,
        width: blockRect.width,
        height: blockRect.height
    };
    block.style.position = 'absolute';
    block.style.left = relLeft + 'px';
    block.style.top = relTop + 'px';
    block.style.width = blockRect.width + 'px';
    block.style.height = blockRect.height + 'px';
    block.style.zIndex = 999;
    block.classList.add('animating');
    block.getBoundingClientRect();
    requestAnimationFrame(() => {
        block.style.left = '0px';
        block.style.top = '0px';
        block.style.width = streamsContainer.clientWidth + 'px';
        block.style.height = streamsContainer.clientHeight + 'px';
    });
    expandedIndex = idx;

    try {
        const player = players[idx];
        const savedVol = loadVolume(idx) / 100;
        if (player) {
            try { player.setMuted(false); } catch (e) {}
            try { player.setVolume(savedVol); } catch (e) {}
            ensureVolume(idx, savedVol, 10, 120);
            try {
                const iframe = player.getIframe && player.getIframe();
                if (iframe && typeof iframe.focus === 'function') iframe.focus();
            } catch (e) {}
        }
    } catch (e) {}

    positionControl(idx);
    showControl(idx);

    const onEnd = (e) => {
        if (e.target !== block) return;
        block.classList.remove('animating');
        block.removeEventListener('transitionend', onEnd);
    };
    block.addEventListener('transitionend', onEnd);
    positionControl(idx);
}
function collapseBlock(idx) {
    const block = document.querySelector(`.block[data-i="${idx}"]`);
    if (!block || !savedBlockRects[idx]) return;
    const orig = savedBlockRects[idx];
    block.classList.add('animating');
    requestAnimationFrame(() => {
        block.style.left = orig.left + 'px';
        block.style.top = orig.top + 'px';
        block.style.width = orig.width + 'px';
        block.style.height = orig.height + 'px';
    });
    const onEnd = (e) => {
        if (e.target !== block) return;
        block.removeEventListener('transitionend', onEnd);
        block.classList.remove('animating');
        block.style.position = '';
        block.style.left = '';
        block.style.top = '';
        block.style.width = '';
        block.style.height = '';
        block.style.zIndex = '';
        expandedIndex = -1;
        delete savedBlockRects[idx];
        try { players[idx]?.setMuted(true); } catch (e) {}
        scheduleHide(idx, 0);
    };
    block.addEventListener('transitionend', onEnd);
    positionControl(idx);
}
function collapseAll() {
    if (expandedIndex === -1) return;
    collapseBlock(expandedIndex);
}
function collapseAllImmediate() {
    if (expandedIndex === -1) return;
    const prevIdx = expandedIndex;
    const prev = document.querySelector(`.block[data-i="${prevIdx}"]`);
    if (!prev) { expandedIndex = -1; return; }
    prev.classList.remove('animating', 'expanded');
    prev.style.position = '';
    prev.style.left = '';
    prev.style.top = '';
    prev.style.width = '';
    prev.style.height = '';
    prev.style.zIndex = '';
    expandedIndex = -1;
    delete savedBlockRects[prevIdx];
    scheduleHide(prevIdx, 0);
}

function initOverlaysHandlers() {
    document.querySelectorAll('.overlay').forEach(ov => {
        const i = Number(ov.getAttribute('data-ov'));
        ov.addEventListener('pointerdown', () => {
            try {
                const prevPE = ov.style.pointerEvents;
                ov.style.pointerEvents = 'none';
                setTimeout(() => { ov.style.pointerEvents = prevPE || ''; }, 700);
            } catch (e) {}
            try {
                const player = players[i];
                const volNormalized = loadVolume(i) / 100;
                if (player) {
                    try { player.setMuted(false); } catch (err) {}
                    try { player.setVolume(volNormalized); } catch (err) {}
                    ensureUnmute(i, 10, 100);
                }
            } catch (e) {}
        });

        ov.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
                const player = players[i];
                const volNormalized = loadVolume(i) / 100;
                if (player) {
                    try { player.setMuted(false); } catch (err) {}
                    try { player.setVolume(volNormalized); } catch (err) {}
                    ensureUnmute(i, 10, 120);
                    try {
                        const iframe = player.getIframe && player.getIframe();
                        if (iframe) {
                            const prevPE = ov.style.pointerEvents;
                            ov.style.pointerEvents = 'none';
                            setTimeout(() => {
                                try { iframe.focus && iframe.focus(); } catch (e) {}
                                ov.style.pointerEvents = prevPE || '';
                            }, 60);
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            if (expandedIndex === i) collapseAll();
            else expandBlock(i);
        });

        ov.addEventListener('mouseenter', () => {
            if (expandedIndex === -1) {
                showControl(i);
                try {
                    const player = players[i];
                    if (player) {
                        const savedVol = loadVolume(i) / 100;
                        try { player.setMuted(false); } catch (e) {}
                        try { player.setVolume(savedVol); } catch (e) {}
                        ensureUnmute(i, 8, 120);
                    }
                } catch (e) {}
            }
        });

        ov.addEventListener('mouseleave', () => {
            if (expandedIndex === -1) {
                try { players[i]?.setMuted(true); } catch (e) {}
                scheduleHide(i);
            } else {
                scheduleHide(i, 600);
            }
        });
    });
}

function muteAllPlayers() {
    for (let i = 0; i < players.length; i++) {
        try {
            const p = players[i];
            if (!p) continue;
            const vol = loadVolume(i) / 100;
            try { p.setVolume(vol); } catch (e) {}
            try { p.setMuted(true); } catch (e) {}
        } catch (e) {}
    }
}

function createGestureOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'gesture-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '2000';
    overlay.style.background = 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0))';
    overlay.style.pointerEvents = 'auto';

    const box = document.createElement('div');
    box.textContent = 'Нажмите в любом месте страницы, чтобы загрузить стримы';
    box.style.padding = '12px 16px';
    box.style.borderRadius = '8px';
    box.style.background = 'rgba(0,0,0,0.6)';
    box.style.color = '#fff';
    box.style.fontSize = '14px';
    box.style.pointerEvents = 'auto';
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const onGesture = async () => {
        try {
            window.removeEventListener('pointerdown', onGesture, true);
            window.removeEventListener('touchstart', onGesture, true);
            window.removeEventListener('keydown', onGesture, true);
        } catch (e) {}
        try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
        await createAllPlayers();
        muteAllPlayers();
    };

    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('touchstart', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
}

window.__streamDebug = function() {
    return players.map((p, idx) => ({
        i: idx,
        exists: !!p,
        ready: p?.__ready || false,
        volume: (() => { try { return p?.getVolume?.(); } catch (e) { return null; } })(),
        muted: (() => { try { return p?.getMuted?.(); } catch (e) { return null; } })()
    }));
};

createGestureOverlay();
