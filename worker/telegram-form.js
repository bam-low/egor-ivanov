// Cloudflare Worker: присылает в Telegram уведомление «на сайте собрали сообщение и открыли Telegram/Kwork».
// Никаких данных о человеке сюда не приходит и отсюда не уходит: ни имени, ни текста, ни контактов.
// IP-адрес не сохраняется и не пересылается (лимит считается общим, а не по адресам) — 152-ФЗ не затрагивается.
// Токен бота хранится в секретах Cloudflare (BOT_TOKEN), на сайте его нет.
//
// Переменные окружения (Settings → Variables and Secrets):
//   BOT_TOKEN       — токен бота от @BotFather (тип Secret)
//   CHAT_ID         — ваш chat id (куда присылать уведомления)
//   ALLOWED_ORIGIN  — адреса сайта через запятую: https://ivanovdev.site, https://www.ivanovdev.site

const TEXTS = {
  telegram: '👀 Кто-то на сайте собрал сообщение и открыл Telegram.\nЕсли в течение пары минут не напишет — значит, передумал отправлять.',
  kwork: '👀 Кто-то на сайте собрал сообщение и перешёл на ваш профиль Kwork.\nЗагляните в сообщения на Kwork.',
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const list = (env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': list.includes(origin) ? origin : (list[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    // принимаем только с адресов сайта
    if (!list.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors });

    // Сайт присылает одно слово — куда человек перешёл. Всё остальное игнорируем.
    let via = '';
    try { via = String(JSON.parse(await request.text()).via || ''); } catch { /* пусто */ }
    if (!TEXTS[via]) return new Response('Bad request', { status: 400, headers: cors });

    // защита от накрутки: не больше 10 уведомлений в минуту на весь сайт (без учёта IP)
    if (env.FORM_LIMIT) {
      const { success } = await env.FORM_LIMIT.limit({ key: 'site' });
      if (!success) return new Response('Too many requests', { status: 429, headers: cors });
    }

    const token = String(env.BOT_TOKEN || '').trim().replace(/^bot/, '');
    const chatId = String(env.CHAT_ID || '').trim();
    if (!token || !chatId) return new Response('not configured', { status: 500, headers: cors });

    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: TEXTS[via], disable_web_page_preview: true }),
    });
    return new Response(tg.ok ? 'ok' : 'telegram error', { status: tg.ok ? 200 : 502, headers: cors });
  },
};
