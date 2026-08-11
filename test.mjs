// node test.mjs — самопроверка ядра. Падает assert'ом, если логика сломана.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('astronomy-engine');
const N = require('./natal.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const angClose = (a, b, tol, msg) => {
  const d = Math.abs(((a - b + 540) % 360) - 180);
  assert.ok(d <= tol, `${msg}: ${a.toFixed(2)}° vs ${b.toFixed(2)}° (Δ${d.toFixed(2)}°)`);
};

// 1. Сидерическое время — эталон из Meeus (1987-04-10 00:00 UT, GAST 13h10m46.3668s).
close(A.SiderealTime(new Date(Date.UTC(1987, 3, 10))), 13.1795463, 0.001, 'GAST Meeus');

// 2. Асцендент: на восходе Солнца (центр диска, alt=0) асцендент ≈ эклиптическая долгота Солнца.
for (const [lat, lon, iso] of [
  [55.75, 37.62, '2000-03-20'], [55.75, 37.62, '1991-07-15'],
  [43.12, 131.89, '2010-12-01'], [-33.87, 151.21, '1995-05-05'],
]) {
  const obs = new A.Observer(lat, lon, 0);
  const rise = A.SearchAltitude(A.Body.Sun, obs, +1, new Date(iso + 'T00:00:00Z'), 2, 0);
  angClose(N.ascendant(rise.date, lat, lon), N.sunLon(rise.date), 1.0, `asc@sunrise ${iso} lat${lat}`);
}

// 3. MC: в местный истинный полдень MC ≈ долгота Солнца.
{
  const obs = new A.Observer(55.75, 37.62, 0);
  const noon = A.SearchHourAngle(A.Body.Sun, obs, 0, new Date('1991-07-15T00:00:00Z'));
  angClose(N.mc(noon.time.date, 37.62), N.sunLon(noon.time.date), 1.0, 'MC@noon');
}

// 4. Перебор суток: окна непрерывны, знаки асцендента идут по зодиаку, все 12 за сутки.
{
  const s = N.sweepDay('1991-07-15', 'Europe/Moscow', 55.75, 37.62);
  const w = N.ascWindows(s);
  assert.equal(w[0].startMin, 0);
  assert.equal(w[w.length - 1].endMin, 1440);
  for (let i = 1; i < w.length; i++) {
    assert.equal(w[i].startMin, w[i - 1].endMin, 'окна стыкуются');
    assert.equal(w[i].asc, (w[i - 1].asc + 1) % 12, 'зодиакальный порядок');
  }
  assert.equal(new Set(w.map(x => x.asc)).size, 12, 'все 12 асцендентов за сутки');

  // 5. Пресет: лучшее окно — из желаемых асцендентов.
  const top = N.scoreWindows(w, { asc: [6, 3, 4], moon: [3, 1, 11] })[0];
  assert.ok([6, 3, 4].includes(top.asc), 'топ-окно из пресета');
}

// 6. Часовые пояса: Intl знает историю (Москва летом 1985 = UTC+4, декрет+лето; 2020 = UTC+3).
assert.equal(N.utcFromLocal('1985-06-15', 12 * 60, 'Europe/Moscow').toISOString(), '1985-06-15T08:00:00.000Z');
assert.equal(N.utcFromLocal('2020-06-15', 12 * 60, 'Europe/Moscow').toISOString(), '2020-06-15T09:00:00.000Z');

console.log('OK — все проверки прошли');
