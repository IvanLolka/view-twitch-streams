const channels = ['streamdatabase', 'streamdatabase', 'streamdatabase', 'streamdatabase'];
channels.forEach((ch, i) => {
    const el = document.getElementById('name-' + i);
    if (el) el.textContent = ch;
});
const players = [];
const streams = document.querySelector('.streams');
let expandedIndex = -1;
const saved = {};
const volControls = [];
const hideTimers = [];

function createPlayer(i, channel) {
    const container = document.getElementById('player-' + i);
    const host = window.location.hostname || 'localhost';
    const opts = { channel, width: '100%', height: '100%', parent: [host], muted: true, autoplay: true };
    try {
        players[i] = new Twitch.Player(container, opts);
        try { players[i].setVolume(0.6); } catch (e) {}
    } catch (e) {
        players[i] = null;
    }
}

for (let i = 0; i < channels.length; i++) createPlayer(i, channels[i]);

function ensureVolume(i, vol = 0.6, attempts = 8, delay = 120) {
    const p = players[i];
    if (!p) return;
    let tries = 0;
    const trySet = () => {
        if (!players[i]) return;
        try {
            if (typeof p.setVolume === 'function') p.setVolume(vol);
            if (typeof p.setMuted === 'function') p.setMuted(false);
        } catch (e) {}
        tries++;
        let ok = false;
        try {
            if (typeof p.getVolume === 'function') {
                const gv = p.getVolume();
                if (typeof gv === 'number' && Math.abs(gv - vol) < 0.02) ok = true;
            } else {
                ok = true;
            }
        } catch (e) {}
        if (!ok && tries < attempts) {
            setTimeout(trySet, delay);
        }
    };
    trySet();
}

function saveVolume(i, v) {
    try { localStorage.setItem('stream_vol_' + i, String(v)); } catch (e) {}
}
function loadVolume(i, defaultVal = 60) {
    try {
        const s = localStorage.getItem('stream_vol_' + i);
        if (s === null || s === undefined) return defaultVal;
        const n = Number(s);
        if (isNaN(n)) return defaultVal;
        return Math.max(0, Math.min(100, Math.round(n)));
    } catch (e) { return defaultVal; }
}

function initVolumeControls() {
    for (let i = 0; i < channels.length; i++) {
        const control = document.createElement('div');
        control.className = 'vol-control';
        control.setAttribute('data-v', String(i));
        control.innerHTML = `
            <input type="range" min="0" max="100" step="1" value="${loadVolume(i)}">
            <div class="vol-value">${loadVolume(i)}</div>
        `;
        streams.appendChild(control);
        volControls[i] = control;

        const range = control.querySelector('input[type="range"]');
        const val = control.querySelector('.vol-value');

        const initial = loadVolume(i) / 100;
        if (players[i]) {
            try { players[i].setVolume(initial); } catch (e) {}
            try { players[i].setMuted(true); } catch (e) {}
            ensureVolume(i, initial, 8, 100);
        }

        range.addEventListener('input', (e) => {
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
initVolumeControls();

function positionControl(i) {
    const control = volControls[i];
    if (!control) return;

    if (expandedIndex === i) {
        control.style.left = '10px';
        control.style.top = (streams.clientHeight - control.offsetHeight - 10) + 'px';
        return;
    }

    const block = document.querySelector(`.block[data-i="${i}"]`);
    if (!block) return;
    const containerRect = streams.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const ctrlRect = control.getBoundingClientRect();

    const isTopRow = (i < 2);
    const left = Math.round(blockRect.left - containerRect.left + 8 + streams.scrollLeft);
    let top;
    if (isTopRow) {
        top = Math.round(blockRect.bottom - containerRect.top + 8 + streams.scrollTop);
    } else {
        top = Math.round(blockRect.top - containerRect.top - ctrlRect.height - 8 + streams.scrollTop);
    }
    control.style.left = left + 'px';
    control.style.top = top + 'px';
}


function positionAllControls() {
    for (let i = 0; i < volControls.length; i++) positionControl(i);
}
window.addEventListener('resize', positionAllControls);
streams.addEventListener('scroll', positionAllControls);

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
    const containerRect = streams.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    const relLeft = blockRect.left - containerRect.left + streams.scrollLeft;
    const relTop = blockRect.top - containerRect.top + streams.scrollTop;
    saved[idx] = {
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
        block.style.width = streams.clientWidth + 'px';
        block.style.height = streams.clientHeight + 'px';
    });
    expandedIndex = idx;
    const savedVol = loadVolume(idx) / 100;
    ensureVolume(idx, savedVol, 12, 100);
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
    if (!block || !saved[idx]) return;
    const orig = saved[idx];
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
        delete saved[idx];
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
    delete saved[prevIdx];
    scheduleHide(prevIdx, 0);
}

document.querySelectorAll('.overlay').forEach(ov => {
    const i = Number(ov.getAttribute('data-ov'));
    ov.addEventListener('click', (e) => {
        e.stopPropagation();
        if (expandedIndex === i) collapseAll();
        else expandBlock(i);
    });
    ov.addEventListener('mouseenter', () => {
        if (expandedIndex === -1) {
            showControl(i);
            const savedVol = loadVolume(i) / 100;
            ensureVolume(i, savedVol, 10, 100);
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

setTimeout(positionAllControls, 60);
setTimeout(positionAllControls, 350);
window.addEventListener('load', positionAllControls);
