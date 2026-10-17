// Cloudflare Worker сайта ivanovdev.site. Две задачи, обе — без персональных данных:
//
// 1) Уведомление «на сайте собрали сообщение и открыли Telegram/Kwork» — сайт присылает {"via":"telegram"|"kwork"}.
// 2) Анонимная статистика посещений — сайт присылает {"t":"pv","p":"home","s":"yandex","d":"m","v":1}:
//    какая страница, откуда пришли (только категория: Яндекс, Google, Telegram…), телефон или компьютер,
//    новое ли это посещение (первый просмотр в этой вкладке). Ни IP, ни cookies, ни адресов страниц-источников.
//    Счётчики за день лежат в KV (привязка STATS), каждое утро бот присылает сводку за вчера, по понедельникам — за неделю.
//
// Переменные окружения (Settings → Variables and Secrets):
//   BOT_TOKEN       — токен бота от @BotFather (тип Secret)
//   CHAT_ID         — ваш chat id (куда присылать уведомления и сводки)
//   ALLOWED_ORIGIN  — адреса сайта через запятую (задан в wrangler.toml)

const TEXTS = {
  telegram: '👀 Кто-то на сайте собрал сообщение и открыл Telegram.\nЕсли в течение пары минут не напишет — значит, передумал отправлять.',
  kwork: '👀 Кто-то на сайте собрал сообщение и перешёл на ваш профиль Kwork.\nЗагляните в сообщения на Kwork.',
};

// допустимые значения статистики — всё остальное отбрасываем
const PAGES = { home: 'Главная', portfolio: 'Портфолио' };
const SOURCES = { yandex: 'Яндекс', google: 'Google', telegram: 'Telegram', vk: 'ВКонтакте', kwork: 'Kwork', direct: 'напрямую', other: 'другие сайты' };
const DEVICES = { m: 'Телефон', d: 'Компьютер' };
const KEEP_DAYS = 400; // сколько хранить дневные счётчики

// дата по Москве (UTC+3), shift — сдвиг в днях
const mskDate = (shift = 0) => new Date(Date.now() + 3 * 3600e3 + shift * 864e5).toISOString().slice(0, 10);
const emptyDay = () => ({ views: 0, visits: 0, pages: {}, src: {}, dev: {} });
const inc = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; };
// 1 посещение, 2 посещения, 5 посещений
const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
};

async function readDay(env, date) {
  const raw = await env.STATS.get(`d:${date}`);
  return raw ? JSON.parse(raw) : emptyDay();
}

async function sendTelegram(env, text) {
  const token = String(env.BOT_TOKEN || '').trim().replace(/^bot/, '');
  const chatId = String(env.CHAT_ID || '').trim();
  if (!token || !chatId) return false;
  const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  return tg.ok;
}

// «Яндекс 6 · Google 3 · напрямую 2» — по убыванию
const list = (obj, names) => Object.entries(obj)
  .filter(([k, n]) => names[k] && n > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${names[k]} ${n}`)
  .join(' · ');

function summary(title, day) {
  if (!day.views) return `📊 ${title}: посещений не было.`;
  const lines = [`📊 ${title}: ${plural(day.visits, ['посещение', 'посещения', 'посещений'])}, ${plural(day.views, ['просмотр', 'просмотра', 'просмотров'])}`];
  const pages = list(day.pages, PAGES); if (pages) lines.push(pages);
  const src = list(day.src, SOURCES); if (src) lines.push(`Откуда: ${src}`);
  const dev = list(day.dev, DEVICES); if (dev) lines.push(dev);
  return lines.join('\n');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (body, status = 200) => new Response(body, { status, headers: cors });
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return reply('Method not allowed', 405);
    // принимаем только с адресов сайта
    if (!allowed.includes(origin)) return reply('Forbidden', 403);

    let d = {};
    try { d = JSON.parse(await request.text()) || {}; } catch { /* пусто */ }

    // ---------- статистика посещений ----------
    if (d.t === 'pv') {
      const page = PAGES[d.p] ? d.p : '';
      if (!page || !env.STATS) return reply('Bad request', 400);
      // защита от накрутки: не больше 60 просмотров в минуту на весь сайт (общий счётчик, IP не учитывается)
      if (env.STATS_LIMIT) {
        const { success } = await env.STATS_LIMIT.limit({ key: 'site' });
        if (!success) return reply('Too many requests', 429);
      }
      const date = mskDate();
      const day = await readDay(env, date);
      day.views += 1;
      inc(day.pages, page);
      if (d.v === 1) { // новое посещение: источник и устройство считаем один раз за визит
        day.visits += 1;
        inc(day.src, SOURCES[d.s] ? d.s : 'other');
        inc(day.dev, DEVICES[d.d] ? d.d : 'd');
      }
      try {
        await env.STATS.put(`d:${date}`, JSON.stringify(day), { expirationTtl: KEEP_DAYS * 86400 });
      } catch { /* если одновременно пришло несколько просмотров, один может не записаться — для статистики не критично */ }
      return reply('ok');
    }

    // ---------- уведомление о нажатии «Открыть Telegram/Kwork» ----------
    const via = String(d.via || '');
    if (!TEXTS[via]) return reply('Bad request', 400);
    // не больше 10 уведомлений в минуту на весь сайт (без учёта IP)
    if (env.FORM_LIMIT) {
      const { success } = await env.FORM_LIMIT.limit({ key: 'site' });
      if (!success) return reply('Too many requests', 429);
    }
    if (!env.BOT_TOKEN || !env.CHAT_ID) return reply('not configured', 500);
    return (await sendTelegram(env, TEXTS[via])) ? reply('ok') : reply('telegram error', 502);
  },

  // каждое утро (см. [triggers] в wrangler.toml): сводка за вчера, по понедельникам — ещё и за неделю
  async scheduled(event, env, ctx) {
    if (!env.STATS) return;
    const yesterday = await readDay(env, mskDate(-1));
    let text = summary('Вчера на сайте', yesterday);
    const weekday = new Date(Date.now() + 3 * 3600e3).getUTCDay(); // 1 — понедельник по Москве
    if (weekday === 1) {
      const week = emptyDay();
      for (let i = 1; i <= 7; i++) {
        const day = await readDay(env, mskDate(-i));
        week.views += day.views; week.visits += day.visits;
        for (const part of ['pages', 'src', 'dev']) for (const [k, n] of Object.entries(day[part])) inc(week[part], k, n);
      }
      text += `\n\n${summary('За неделю', week)}`;
    }
    ctx.waitUntil(sendTelegram(env, text));
  },
};
