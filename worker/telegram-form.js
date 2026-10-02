// Cloudflare Worker: принимает заявку с сайта и пересылает её в Telegram.
// Токен бота хранится в секретах Cloudflare (BOT_TOKEN), на сайте его нет.
//
// Переменные окружения (Settings → Variables and Secrets):
//   BOT_TOKEN       — токен бота от @BotFather (тип Secret)
//   CHAT_ID         — ваш chat id (куда присылать заявки)
//   ALLOWED_ORIGIN  — адрес сайта (без пути), например https://bam-low.github.io;
//                     несколько адресов — через запятую: https://bam-low.github.io, https://ivanov.design
//   TURNSTILE_SECRET — необязательно: секретный ключ Cloudflare Turnstile (тип Secret).
//                     Если задан — заявка принимается только с пройденной проверкой «не робот».
//
// Защита от спама: ловушка-поле, слишком быстрое заполнение, лимит заявок с одного IP
// (привязка FORM_LIMIT в wrangler.toml) и, если включён, Turnstile.

const LABELS = { kwork: 'Kwork', other: 'Другая платформа' };
const CHANNELS = { telegram: 'Telegram', phone: 'Телефон', whatsapp: 'WhatsApp' };

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    // можно перечислить несколько адресов через запятую — например, GitHub Pages и свой домен
    const list = (env.ALLOWED_ORIGIN || '*').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    const anyOrigin = list.includes('*');
    const originOk = anyOrigin || list.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': anyOrigin ? '*' : (originOk ? origin : list[0]),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    // заявки принимаем только с вашего сайта
    if (!originOk) return new Response('Forbidden', { status: 403, headers: cors });

    let d;
    try { d = await request.json(); } catch { return new Response('Bad request', { status: 400, headers: cors }); }

    // ловушка для спам-ботов: человек это поле не заполняет.
    // Форму, заполненную быстрее 3 секунд, тоже молча отбрасываем — так печатают только боты.
    // Боту отвечаем «ok», чтобы он не понял, что его отсеяли.
    if (d.website || (typeof d.elapsed === 'number' && d.elapsed < 3000)) {
      console.log('Отсеяна заявка бота');
      return new Response('ok', { headers: cors });
    }

    // не больше 5 заявок в минуту с одного адреса
    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (env.FORM_LIMIT && ip) {
      const { success } = await env.FORM_LIMIT.limit({ key: ip });
      if (!success) {
        console.warn('Слишком много заявок с одного адреса');
        return new Response('Too many requests', { status: 429, headers: cors });
      }
    }

    // проверка Cloudflare Turnstile («я не робот»), если задан секретный ключ
    if (env.TURNSTILE_SECRET) {
      const form = new FormData();
      form.append('secret', env.TURNSTILE_SECRET);
      form.append('response', String(d.turnstile || ''));
      if (ip) form.append('remoteip', ip);
      const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
        .then((r) => r.json()).catch(() => ({ success: false }));
      if (!check.success) {
        console.warn(`Turnstile не пройден: ${(check['error-codes'] || []).join(', ') || 'нет ответа'}`);
        return new Response('Captcha failed', { status: 403, headers: cors });
      }
    }

    const name = clip(d.name, 60);
    const project = clip(d.project, 120);
    const description = clip(d.description, 2000);
    const platform = LABELS[d.platform] ? d.platform : '';
    const channel = CHANNELS[d.channel] ? d.channel : '';
    const contact = clip(d.contact, 80);
    const comment = clip(d.comment, 300);
    if (name.length < 2 || project.length < 2 || description.length < 10 || !platform || (platform === 'other' && !contact)) {
      return new Response('Invalid form', { status: 422, headers: cors });
    }

    let link = '';
    if (platform === 'other' && channel === 'telegram') link = `https://t.me/${contact.replace(/^@/, '')}`;
    if (platform === 'other' && channel === 'whatsapp') link = `https://wa.me/${contact.replace(/\D/g, '')}`;

    const lines = [
      '🚀 <b>Новая заявка с сайта</b>',
      '',
      `<b>Имя:</b> ${esc(name)}`,
      `<b>Проект:</b> ${esc(project)}`,
      `<b>Описание:</b>\n${esc(description)}`,
      '',
      `<b>Где работать:</b> ${LABELS[platform]}`,
    ];
    if (platform === 'other') lines.push(`<b>Связь (${CHANNELS[channel] || '—'}):</b> ${esc(contact)}${link ? `\n${link}` : ''}`);
    if (comment) lines.push(`<b>Комментарий:</b> ${esc(comment)}`);

    // пробелы и переносы, случайно скопированные вместе с токеном или id, ломают запрос
    const token = String(env.BOT_TOKEN || '').trim().replace(/^bot/, '');
    const chatId = String(env.CHAT_ID || '').trim();
    if (!token || !chatId) {
      // только имена переменных, без значений — чтобы увидеть опечатку в названии
      console.error(`Не заданы секреты: ${!token ? 'BOT_TOKEN ' : ''}${!chatId ? 'CHAT_ID' : ''}. Воркер видит переменные: ${Object.keys(env).join(', ') || 'никаких'}`);
      return new Response('not configured', { status: 500, headers: cors });
    }

    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!tg.ok) {
      // причина от Telegram попадёт в логи воркера (Observability), токен в лог не пишем
      const info = await tg.json().catch(() => ({}));
      console.error(`Telegram ${tg.status}: ${info.description || 'нет описания'}`);
    }
    return new Response(tg.ok ? 'ok' : 'telegram error', { status: tg.ok ? 200 : 502, headers: cors });
  },
};
