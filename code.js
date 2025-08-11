const channels = ['streamdatabase', 'streamdatabase', 'streamdatabase', 'streamdatabase'];
channels.forEach((ch, i) => {
    const el = document.getElementById('name-' + i);
    if (el) el.textContent = ch;
});
const players = [];
const streams = document.querySelector('.streams');
let expandedIndex = -1;
const saved = {};

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
    ensureVolume(idx, 0.6, 12, 100);
    const onEnd = (e) => {
        if (e.target !== block) return;
        block.classList.remove('animating');
        block.removeEventListener('transitionend', onEnd);
    };
    block.addEventListener('transitionend', onEnd);
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
    };
    block.addEventListener('transitionend', onEnd);
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
            ensureVolume(i, 0.6, 10, 100);
        }
    });
    ov.addEventListener('mouseleave', () => {
        if (expandedIndex === -1) {
            try { players[i]?.setMuted(true); } catch (e) {}
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') collapseAll();
});
