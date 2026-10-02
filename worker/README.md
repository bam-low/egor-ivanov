# Заявки с сайта → Telegram

Форма «Обсудить проект» отправляет заявку на маленький сервер-посредник (Cloudflare Worker),
а он пересылает её вам в Telegram. Токен бота хранится только в Cloudflare — на сайте его нет,
поэтому украсть его и спамить от вашего бота нельзя. Бесплатно: лимит Cloudflare — 100 000 запросов в день.

## 1. Бот в Telegram (2 минуты)
1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → придумайте имя и логин бота.
2. BotFather пришлёт **токен** вида `1234567890:AA...` — сохраните, никому не показывайте.
3. Найдите своего бота в Telegram и нажмите **Start** (иначе бот не сможет вам писать).
4. Узнайте свой **chat id**: напишите [@userinfobot](https://t.me/userinfobot) — он ответит числом `Id: 123456789`.

## 2. Worker в Cloudflare (5 минут)
1. Зарегистрируйтесь на [dash.cloudflare.com](https://dash.cloudflare.com) (бесплатно).
2. **Workers & Pages → Create → Create Worker** → назовите, например, `brief` → **Deploy**.
3. **Edit code** → удалите шаблон, вставьте содержимое файла `worker/telegram-form.js` → **Deploy**.
4. **Settings → Variables and Secrets → Add**:
   - `BOT_TOKEN` — токен из BotFather, тип **Secret**;
   - `CHAT_ID` — ваш id из @userinfobot;
   - `ALLOWED_ORIGIN` — `https://bam-low.github.io` (только домен, без `/egor-ivanov`).
5. Скопируйте адрес воркера вида `https://brief.<ваш-логин>.workers.dev`.

## 3. Подключить к сайту
В `index.html` у формы `<form class="brief__form" data-endpoint="">` впишите адрес воркера в `data-endpoint`
(или просто пришлите адрес — я вставлю).

## Проверка
Откройте сайт → «Обсудить проект» → заполните → в Telegram придёт сообщение от вашего бота.

## Когда подключите свой домен
Воркер менять не нужно — у него свой адрес `*.workers.dev`, он не зависит от домена сайта.
Достаточно в Cloudflare → воркер → **Settings → Variables** дописать новый домен в `ALLOWED_ORIGIN` через запятую:
`https://bam-low.github.io, https://ваш-домен.ru` — заявки будут приходить с обоих адресов.
