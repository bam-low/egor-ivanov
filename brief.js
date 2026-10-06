// Форма «Обсудить проект» — помощник, а не отправка заявки.
// Из ответов собирается готовое сообщение: оно копируется в буфер обмена, и человек сам отправляет его
// мне в Telegram (текст подставляется в поле ввода) или на Kwork. Сайт ничего никуда не отправляет
// и не хранит — так не нужно собирать персональные данные (152-ФЗ).
// Единственное, что уходит с сайта, — сигнал «открыли Telegram/Kwork» (одно слово, без данных о человеке)
// на адрес из data-notify: Cloudflare Worker присылает мне об этом уведомление.
(() => {
  const dialog = document.querySelector('.brief');
  if (!dialog) return;
  const form = dialog.querySelector('.brief__form');
  const root = document.documentElement;
  const stepForm = dialog.querySelector('[data-step="form"]');
  const stepDone = dialog.querySelector('[data-step="done"]');
  const errorBox = dialog.querySelector('.brief__error');
  const submitText = dialog.querySelector('.brief__submit-text');
  const doneText = dialog.querySelector('[data-done-text]');
  const preview = dialog.querySelector('[data-preview]');
  const go = dialog.querySelector('[data-go]');
  const copyBtn = dialog.querySelector('[data-copy]');
  const TELEGRAM = 'https://t.me/ivanov_web';
  const KWORK = 'https://kwork.ru/user/egor-c';
  let message = '';
  let notified = false; // одно уведомление на одно собранное сообщение

  const notify = (via) => {
    const url = form.dataset.notify;
    if (!url || notified) return;
    notified = true;
    // text/plain — без лишнего предварительного запроса; sendBeacon доходит, даже если вкладка уходит в мессенджер
    const body = JSON.stringify({ via });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })))) {
      fetch(url, { method: 'POST', body, mode: 'no-cors', keepalive: true }).catch(() => {});
    }
  };

  // Пока форма открыта, бесконечные анимации страницы стоят на паузе:
  // стеклу не нужно заново размывать фон на каждом кадре
  const paused = [];
  const pausePage = () => {
    document.querySelectorAll('.hero, .marquee, .contact__card').forEach((el) => {
      if (!el.classList.contains('is-offscreen')) { el.classList.add('is-offscreen'); paused.push(el); }
    });
  };
  const resumePage = () => { paused.splice(0).forEach((el) => el.classList.remove('is-offscreen')); };

  const open = () => {
    if (dialog.open) return;
    pausePage();
    root.classList.add('is-locked');
    dialog.showModal();
    setTimeout(() => form.elements.name.focus({ preventScroll: true }), 350);
  };
  const close = () => {
    if (!dialog.open || dialog.classList.contains('is-closing')) return;
    dialog.classList.add('is-closing');
    setTimeout(() => { dialog.classList.remove('is-closing'); dialog.close(); }, 260);
  };
  dialog.addEventListener('close', () => {
    root.classList.remove('is-locked');
    resumePage();
    // после готового сообщения следующая форма открывается чистой
    if (!stepDone.hidden) reset();
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc — с анимацией
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); }); // клик по затемнению
  dialog.querySelectorAll('[data-brief-close]').forEach((b) => b.addEventListener('click', close));
  document.querySelectorAll('[data-brief-open]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));

  // Надпись на кнопке зависит от выбранного мессенджера
  const isKwork = () => form.elements.platform.value === 'kwork';
  const syncPlatform = () => { submitText.textContent = isKwork() ? 'Продолжить на Kwork' : 'Продолжить в Telegram'; };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'platform') syncPlatform();
    const field = e.target.closest('.glass-field');
    if (field) field.classList.remove('is-invalid');
  });
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.glass-field');
    if (field) field.classList.remove('is-invalid');
    errorBox.hidden = true;
  });
  syncPlatform();

  const validate = () => {
    const f = form.elements;
    const bad = [];
    if (f.name.value.trim().length < 2) bad.push(f.name);
    if (f.project.value.trim().length < 2) bad.push(f.project);
    if (f.description.value.trim().length < 10) bad.push(f.description);
    bad.forEach((el) => el.closest('.glass-field').classList.add('is-invalid'));
    if (bad.length) {
      errorBox.textContent = bad[0] === f.name ? 'Подскажите, как к вам обращаться.'
        : bad[0] === f.description ? 'Опишите проект хотя бы парой предложений.'
        : 'Заполните отмеченные поля.';
      errorBox.hidden = false;
      bad[0].focus();
    }
    return !bad.length;
  };

  const build = () => {
    const f = form.elements;
    const lines = [
      'Здравствуйте, Егор! Пишу с сайта ivanovdev.site.',
      '',
      `Меня зовут: ${f.name.value.trim()}`,
      `Проект: ${f.project.value.trim()}`,
      `Задача: ${f.description.value.trim()}`,
    ];
    const comment = f.comment.value.trim();
    if (comment) lines.push(`Комментарий: ${comment}`);
    return lines.join('\n');
  };

  // Копирование: современный способ, а если браузер не разрешил — через скрытое поле
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      dialog.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  };

  const showDone = (copied) => {
    const kwork = isKwork();
    preview.textContent = message;
    // Telegram сам подставит текст в поле ввода чата; на Kwork его нужно вставить вручную
    go.href = kwork ? KWORK : `${TELEGRAM}?text=${encodeURIComponent(message)}`;
    go.firstChild.textContent = kwork ? 'Открыть Kwork ' : 'Открыть Telegram ';
    doneText.textContent = kwork
      ? (copied ? 'Текст скопирован. Откройте мой профиль на Kwork, нажмите «Написать» и вставьте его.'
        : 'Скопируйте текст ниже, откройте мой профиль на Kwork, нажмите «Написать» и вставьте его.')
      : (copied ? 'Откроется чат со мной — текст уже будет в поле ввода (и в буфере обмена). Останется нажать «Отправить».'
        : 'Откроется чат со мной — текст уже будет в поле ввода. Останется нажать «Отправить».');
    copyBtn.textContent = 'Скопировать ещё раз';
    stepForm.hidden = true;
    stepDone.hidden = false;
    dialog.scrollTop = 0;
  };

  const reset = () => {
    form.reset();
    stepDone.hidden = true;
    stepForm.hidden = false;
    errorBox.hidden = true;
    syncPlatform();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    message = build();
    notified = false;
    showDone(await copy(message));
  });

  // перед переходом в мессенджер копируем ещё раз — на случай, если буфер успели перезаписать
  go.addEventListener('click', () => { copy(message); notify(isKwork() ? 'kwork' : 'telegram'); });
  copyBtn.addEventListener('click', async () => {
    copyBtn.textContent = (await copy(message)) ? 'Скопировано ✓' : 'Выделите текст и скопируйте';
  });
  dialog.querySelector('[data-edit]').addEventListener('click', () => {
    stepDone.hidden = true;
    stepForm.hidden = false;
  });
})();
