const channels = ['streamdatabase', 'streamdatabase', 'streamdatabase', 'streamdatabase'];
const players = [];
const playerReadyPromises = [];
const streams = document.querySelector('.streams');
let expandedIndex = -1;
const saved = {};

function createPlayer(i, channel) {
    const container = document.getElementById('player-' + i);
    const host = window.location.hostname || 'localhost';
    const opts = { channel, width: '100%', height: '100%', parent: [host], muted: true, autoplay: true };
    players[i] = null;
    playerReadyPromises[i] = new Promise((resolve) => {
        try {
            const player = new Twitch.Player(container, opts);
            players[i] = player;
            player.addEventListener(Twitch.Player.READY, () => {
                player.setVolume(0.6);
                resolve();
            });
        } catch (e) {
            resolve(); // на случай ошибки — резолвим, чтобы не зависать
        }
    });
}

for (let i = 0; i < channels.length; i++) createPlayer(i, channels[i]);

async function setPlayerVolumeAndMute(i, mute, volume = 0.6) {
    if (!players[i]) return;
    await playerReadyPromises[i]; // ждём, пока плеер готов
    try {
        players[i].setMuted(mute);
        if (!mute) {
            // Лучше чуть задержать, чтобы плеер успел размутиться
            setTimeout(() => {
                try { players[i].setVolume(volume); } catch {}
            }, 50);
        }
    } catch {}
}

async function expandBlock(idx) {
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
    await setPlayerVolumeAndMute(idx, false, 0.6);
    const onEnd = (e) => {
        if (e.target !== block) return;
        block.classList.remove('animating');
        block.removeEventListener('transitionend', onEnd);
    };
    block.addEventListener('transitionend', onEnd);
}

async function collapseBlock(idx) {
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
    const onEnd = async (e) => {
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
        await setPlayerVolumeAndMute(idx, true);
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
        if (expandedIndex === -1) setPlayerVolumeAndMute(i, false, 0.6);
    });
    ov.addEventListener('mouseleave', () => {
        if (expandedIndex === -1) setPlayerVolumeAndMute(i, true);
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') collapseAll();
});
