const channels = ['miyuchiiro','nubchann','iwyry','nyamuras'];

channels.forEach((ch, i) => {
  const el = document.getElementById('name-' + i);
  if (el) el.textContent = ch;
});

const players = [];

function createPlayer(i, channel) {
  const container = document.getElementById('player-' + i);
  const host = window.location.hostname || 'localhost';
  const opts = {
    channel: channel,
    width: '100%',
    height: '100%',
    parent: [host],
    muted: true,
    autoplay: true
  };
  try {
    players[i] = new Twitch.Player(container, opts);
    players[i].setVolume(0.6);
  } catch (e) {
    players[i] = null;
  }
}

for (let i = 0; i < channels.length; i++) {
  createPlayer(i, channels[i]);
}

function muteAll() {
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p) continue;
    try { p.setMuted(true); } catch (e) {}
  }
}

function unmute(i) {
  for (let k = 0; k < players.length; k++) {
    const p = players[k];
    if (!p) continue;
    try {
      p.setMuted(k !== i);
      if (k === i) p.setVolume(0.6);
    } catch (e) {}
  }
}

document.querySelectorAll('.block').forEach(tile => {
  const i = Number(tile.getAttribute('data-i'));
  tile.addEventListener('mouseenter', () => unmute(i));
  tile.addEventListener('mouseleave', () => muteAll());
  tile.addEventListener('click', () => unmute(i));
  tile.setAttribute('tabindex', '0');
  tile.addEventListener('focus', () => unmute(i));
  tile.addEventListener('blur', () => muteAll());
});
