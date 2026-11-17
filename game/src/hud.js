// The DOM HUD: health, ammo, money, timer, score, weapon, bomb, kill feed
// and the overlays for menu, buy, round end and match end. It never touches
// the simulation; main.js pushes numbers in and reads callbacks out.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const buyPanel = $('buy');
  const buyMoney = $('buy-money');
  const feed = $('feed');
  const banner = $('banner');
  let hitTimer = 0;
  let bannerTimer = 0;

  const COPY = {
    start: {
      title: 'Harbourline',
      copy: 'A dusk harbour yard. Two teams, two bomb sites, five rounds to win. Plant the device, or stop it being planted.',
      action: 'Click to play',
    },
    paused: { title: 'Harbourline', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  };

  function setText(id, value, last) {
    const el = $(id);
    if (last !== value) el.textContent = String(value);
    return value;
  }
  let last = {};

  return {
    setAmmo(mag, reserve, weaponName, grenades) {
      last.mag = setText('ammo-mag', mag, last.mag);
      last.reserve = setText('ammo-reserve', `/ ${reserve}`, last.reserve);
      last.weapon = setText('weapon-name', weaponName, last.weapon);
      last.grenades = setText('grenade-count', grenades > 0 ? `Grenades ${grenades} (G)` : '', last.grenades);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(health) {
      last.health = setText('health-value', Math.max(0, Math.ceil(health)), last.health);
      $('health-fill').style.width = `${Math.max(0, health)}%`;
      $('health-fill').classList.toggle('low', health <= 30);
    },
    setMoney(money) {
      last.money = setText('money-value', `$${money}`, last.money);
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      last.timer = setText('timer-value', text, last.timer);
    },
    setScore(a, b) {
      last.score = setText('score-value', `${a} — ${b}`, last.score);
    },
    setRound(round) {
      last.round = setText('round-value', `Round ${round}`, last.round);
    },
    setBomb(text) {
      last.bomb = setText('bomb-value', text, last.bomb);
    },
    hitMarker(killed, holdMs = 90) {
      const el = $('hitmarker');
      el.classList.add('on');
      el.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        el.classList.remove('on');
        el.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      const el = $('damage');
      el.classList.add('on');
      setTimeout(() => el.classList.remove('on'), 140);
    },
    feedLine(text) {
      const line = document.createElement('div');
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    },
    banner(text, ms = 2200) {
      banner.textContent = text;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    showOverlay(mode, extra = '') {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    showEnd(titleText, copyText, actionText) {
      title.textContent = titleText;
      copy.textContent = copyText;
      play.textContent = actionText;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    showBuy(money, onBuy, onDeploy) {
      buyMoney.textContent = `$${money} — press 1 Raptor $900 · 2 Hush $600 · 3 Longbow $1500 · 4 Grenade $300`;
      buyPanel.hidden = false;
      buyPanel.querySelectorAll('[data-buy]').forEach((button) => {
        button.onclick = () => onBuy(button.dataset.buy);
      });
      $('deploy').onclick = onDeploy;
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
