/* natal.js — детерминированная часть «Натального алиби».
   Астрономия — astronomy-engine; здесь только асцендент/MC, знаки и перебор суток. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('astronomy-engine'));
  } else {
    root.Natal = factory(root.Astronomy);
  }
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';

  const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
    'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
  const GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];

  const DEG = Math.PI / 180;
  const norm360 = (x) => ((x % 360) + 360) % 360;
  const signOf = (lon) => Math.floor(norm360(lon) / 30);

  // Средний наклон эклиптики; точности хватает — асцендент нам нужен до знака.
  function obliquity(date) {
    const T = (date.getTime() / 86400000 + 2440587.5 - 2451545) / 36525;
    return 23.4392911 - 0.0130042 * T;
  }

  // Местное сидерическое время как угол (RAMC), градусы.
  function lstDeg(date, lonEast) {
    return norm360(A.SiderealTime(date) * 15 + lonEast);
  }

  function ascendant(date, lat, lonEast) {
    const th = lstDeg(date, lonEast) * DEG;
    const e = obliquity(date) * DEG;
    const phi = lat * DEG;
    return norm360(Math.atan2(Math.cos(th), -(Math.sin(th) * Math.cos(e) + Math.tan(phi) * Math.sin(e))) / DEG);
  }

  function mc(date, lonEast) {
    const th = lstDeg(date, lonEast) * DEG;
    const e = obliquity(date) * DEG;
    return norm360(Math.atan2(Math.sin(th), Math.cos(th) * Math.cos(e)) / DEG);
  }

  const moonLon = (date) => norm360(A.EclipticGeoMoon(date).lon);
  const sunLon = (date) => norm360(A.SunPosition(date).elon);

  // Смещение зоны IANA на момент utcDate, в минутах. Intl знает историю (декретное время и пр.).
  function tzOffsetMin(utcDate, tz) {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(utcDate).find((p) => p.type === 'timeZoneName').value;
    const m = name.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0));
  }

  // Местные dateStr('YYYY-MM-DD') + минуты от полуночи → Date (UTC).
  function utcFromLocal(dateStr, minOfDay, tz) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const base = Date.UTC(y, mo - 1, d);
    let t = base + minOfDay * 60000;
    for (let i = 0; i < 2; i++) t = base + (minOfDay - tzOffsetMin(new Date(t), tz)) * 60000;
    return new Date(t);
  }

  // Перебор суток шагом step минут: кто на асценденте/MC и где Луна.
  function sweepDay(dateStr, tz, lat, lonEast, step = 5) {
    const out = [];
    for (let min = 0; min < 1440; min += step) {
      const t = utcFromLocal(dateStr, min, tz);
      out.push({
        min,
        t,
        asc: signOf(ascendant(t, lat, lonEast)),
        mc: signOf(mc(t, lonEast)),
        moon: signOf(moonLon(t)),
      });
    }
    return out;
  }

  // Слить подряд идущие сэмплы с одним асцендентом в окна [startMin, endMin).
  function ascWindows(samples) {
    const step = samples[1].min - samples[0].min;
    const win = [];
    for (const s of samples) {
      const last = win[win.length - 1];
      if (last && last.asc === s.asc) { last.endMin = s.min + step; last.mids.push(s); }
      else win.push({ asc: s.asc, startMin: s.min, endMin: s.min + step, mids: [s] });
    }
    for (const w of win) {
      const mid = w.mids[Math.floor(w.mids.length / 2)];
      w.midMin = mid.min; w.moon = mid.moon; w.mcSign = mid.mc;
      delete w.mids;
    }
    return win;
  }

  // preset: {asc:[signIdx…по убыванию желанности], moon:[…], mcPref:[…]}
  function scoreWindows(windows, preset) {
    const rank = (list, s, w) => { const i = list.indexOf(s); return i < 0 ? 0 : (list.length - i) * w; };
    return windows
      .map((w) => ({
        ...w,
        score: rank(preset.asc || [], w.asc, 10) + rank(preset.moon || [], w.moon, 3) +
          rank(preset.mcPref || [], w.mcSign, 1) + Math.min(w.endMin - w.startMin, 180) / 180,
      }))
      .sort((a, b) => b.score - a.score);
  }

  return { SIGNS, GLYPHS, signOf, obliquity, lstDeg, ascendant, mc, moonLon, sunLon, tzOffsetMin, utcFromLocal, sweepDay, ascWindows, scoreWindows };
});
