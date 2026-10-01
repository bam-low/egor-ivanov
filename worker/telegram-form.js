// Cloudflare Worker: принимает заявку с сайта и пересылает её в Telegram.
// Токен бота хранится в секретах Cloudflare (BOT_TOKEN), на сайте его нет.
//
// Переменные окружения (Settings → Variables and Secrets):
//   BOT_TOKEN       — токен бота от @BotFather (тип Secret)
//   CHAT_ID         — ваш chat id (куда присылать заявки)
//   ALLOWED_ORIGIN  — адрес сайта, например https://bam-low.github.io

const LABELS = { kwork: 'Kwork', other: 'Другая платформа' };
const CHANNELS = { telegram: 'Telegram', phone: 'Телефон', whatsapp: 'WhatsApp' };

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });
    // заявки принимаем только с вашего сайта
    if (allowed !== '*' && origin !== allowed) return new Response('Forbidden', { status: 403, headers: cors });

    let d;
    try { d = await request.json(); } catch { return new Response('Bad request', { status: 400, headers: cors }); }

    // ловушка для спам-ботов: человек это поле не заполняет
    if (d.website) return new Response('ok', { headers: cors });

    const project = clip(d.project, 120);
    const description = clip(d.description, 2000);
    const platform = LABELS[d.platform] ? d.platform : '';
    const channel = CHANNELS[d.channel] ? d.channel : '';
    const contact = clip(d.contact, 80);
    const comment = clip(d.comment, 300);
    if (project.length < 2 || description.length < 10 || !platform || (platform === 'other' && !contact)) {
      return new Response('Invalid form', { status: 422, headers: cors });
    }

    let link = '';
    if (platform === 'other' && channel === 'telegram') link = `https://t.me/${contact.replace(/^@/, '')}`;
    if (platform === 'other' && channel === 'whatsapp') link = `https://wa.me/${contact.replace(/\D/g, '')}`;

    const lines = [
      '🚀 <b>Новая заявка с сайта</b>',
      '',
      `<b>Проект:</b> ${esc(project)}`,
      `<b>Описание:</b>\n${esc(description)}`,
      '',
      `<b>Где работать:</b> ${LABELS[platform]}`,
    ];
    if (platform === 'other') lines.push(`<b>Связь (${CHANNELS[channel] || '—'}):</b> ${esc(contact)}${link ? `\n${link}` : ''}`);
    if (comment) lines.push(`<b>Комментарий:</b> ${esc(comment)}`);

    const tg = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return new Response(tg.ok ? 'ok' : 'telegram error', { status: tg.ok ? 200 : 502, headers: cors });
  },
};
