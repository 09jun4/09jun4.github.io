// volume.js — 소리 설정 UI: 전체 / 엔진 / 효과음 sliders + 음소거.
// Load order: after audio.js, before menu.js. Depends on: Audio.
//
// The same controls appear twice (the menu's 소리 panel and the pause card);
// every copy follows Audio.onChange, so moving one moves the other.
(function () {
  'use strict';
  window.CR = window.CR || {};

  var ROWS = [
    { key: 'master', label: '전체' },
    { key: 'engine', label: '엔진' },
    { key: 'sfx', label: '효과음', hint: '타이어 · 변속 · 충돌' },
  ];

  var Volume = {};
  var copies = [];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function pct(v) { return Math.round(v * 100); }

  // One-line summary for the menu fold header.
  Volume.summary = function () {
    var A = CR.Audio;
    if (A.muted) return '음소거';
    return ROWS.map(function (r) { return r.label + ' ' + pct(A.volume[r.key]) + '%'; }).join(' · ');
  };

  Volume.build = function (container, opts) {
    opts = opts || {};
    var A = CR.Audio;
    var box = el('div', 'vol' + (opts.compact ? ' is-compact' : ''));
    var copy = { inputs: {}, values: {}, mute: null, box: box };

    ROWS.forEach(function (r) {
      var row = el('label', 'vol-row');
      var name = el('span', 'vol-name', r.label);
      if (r.hint && !opts.compact) name.appendChild(el('small', null, r.hint));
      row.appendChild(name);
      var input = el('input', 'vol-range');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.setAttribute('aria-label', r.label + ' 음량');
      input.addEventListener('input', function () {
        A.setVolume(r.key, input.value / 100);
      });
      // Sample sound when the thumb is let go, at the new level.
      input.addEventListener('change', function () { A.preview(r.key); });
      row.appendChild(input);
      var val = el('span', 'vol-val');
      row.appendChild(val);
      box.appendChild(row);
      copy.inputs[r.key] = input;
      copy.values[r.key] = val;
    });

    var mute = el('button', 'vol-mute');
    mute.type = 'button';
    mute.addEventListener('click', function () { A.setMuted(!A.muted); });
    box.appendChild(mute);
    copy.mute = mute;

    container.appendChild(box);
    copies.push(copy);
    sync(copy);
    return box;
  };

  function sync(copy) {
    var A = CR.Audio;
    ROWS.forEach(function (r) {
      var v = A.volume[r.key];
      copy.inputs[r.key].value = String(pct(v));
      copy.inputs[r.key].style.setProperty('--fill', pct(v) + '%');
      copy.values[r.key].textContent = pct(v) + '%';
    });
    copy.box.classList.toggle('is-muted', A.muted);
    copy.mute.textContent = A.muted ? '소리 켜기' : '음소거';
    copy.mute.setAttribute('aria-pressed', A.muted ? 'true' : 'false');
  }

  Volume.init = function () {
    CR.Audio.onChange(function () {
      copies.forEach(sync);
      if (Volume.onSummary) Volume.onSummary(Volume.summary());
    });
  };

  CR.Volume = Volume;
})();
