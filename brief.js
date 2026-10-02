// Форма «Обсудить проект»: открытие, проверка полей и отправка заявки.
// Заявка уходит на адрес из data-endpoint (Cloudflare Worker из папки worker/),
// а тот пересылает её в Telegram. Токен бота на сайте не хранится.
(() => {
  const dialog = document.querySelector('.brief');
  if (!dialog) return;
  const form = dialog.querySelector('.brief__form');
  const root = document.documentElement;
  const stepForm = dialog.querySelector('[data-step="form"]');
  const stepDone = dialog.querySelector('[data-step="done"]');
  const contactBox = dialog.querySelector('.brief__contact');
  const contactInput = form.elements.contact;
  const errorBox = dialog.querySelector('.brief__error');
  const submit = dialog.querySelector('.brief__submit');
  const kworkLink = dialog.querySelector('.brief__kwork');
  const KWORK = 'https://kwork.ru/user/egor-c';

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
    // после успешной отправки следующая форма открывается чистой
    if (!stepDone.hidden) reset();
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc — с анимацией
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); }); // клик по затемнению
  dialog.querySelectorAll('[data-brief-close]').forEach((b) => b.addEventListener('click', close));
  document.querySelectorAll('[data-brief-open]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(); }));

  // Поле «как связаться» — только для «другой платформы»
  const placeholders = { telegram: '@username', phone: '+7 900 000-00-00', whatsapp: '+7 900 000-00-00' };
  const syncChannel = () => {
    const ch = form.elements.channel.value || 'telegram';
    contactInput.placeholder = placeholders[ch];
    contactInput.inputMode = ch === 'telegram' ? 'text' : 'tel';
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'platform') {
      const other = e.target.value === 'other';
      contactBox.hidden = !other;
      if (other) setTimeout(() => contactInput.focus({ preventScroll: true }), 150);
    }
    if (e.target.name === 'channel') { syncChannel(); contactInput.focus({ preventScroll: true }); }
    const field = e.target.closest('.glass-field');
    if (field) field.classList.remove('is-invalid');
  });
  form.addEventListener('input', (e) => {
    const field = e.target.closest('.glass-field');
    if (field) field.classList.remove('is-invalid');
    errorBox.hidden = true;
  });
  syncChannel();

  const showError = (html) => { errorBox.innerHTML = html; errorBox.hidden = false; };

  const validate = () => {
    const f = form.elements;
    const bad = [];
    if (f.name.value.trim().length < 2) bad.push(f.name);
    if (f.project.value.trim().length < 2) bad.push(f.project);
    if (f.description.value.trim().length < 10) bad.push(f.description);
    if (!f.platform.value) bad.push(dialog.querySelector('#pf-kwork'));
    if (f.platform.value === 'other') {
      const v = f.contact.value.trim();
      const ok = f.channel.value === 'telegram'
        ? /^@?[a-zA-Z0-9_]{4,32}$/.test(v) || /^\+?[\d\s()-]{10,18}$/.test(v)
        : /^\+?[\d\s()-]{10,18}$/.test(v);
      if (!ok) bad.push(f.contact);
    }
    bad.forEach((el) => el.closest('.glass-field').classList.add('is-invalid'));
    if (bad.length) {
      const msg = bad[0] === f.name ? 'Подскажите, как к вам обращаться.'
        : bad[0] === f.description ? 'Опишите проект хотя бы парой предложений.'
        : bad[0] === f.contact ? 'Проверьте контакт: для Telegram — @username, для телефона и WhatsApp — номер.'
        : bad[0].name === 'platform' ? 'Выберите, где удобнее работать.'
        : 'Заполните отмеченные поля.';
      showError(msg);
      bad[0].focus({ preventScroll: false });
    }
    return !bad.length;
  };

  // успех: экран «я скоро свяжусь»; если выбран Kwork — ссылка на профиль
  const showDone = (data) => {
    kworkLink.hidden = data.platform !== 'kwork';
    stepForm.hidden = true;
    stepDone.hidden = false;
    dialog.scrollTop = 0;
  };

  const reset = () => {
    form.reset();
    contactBox.hidden = true;
    stepDone.hidden = true;
    stepForm.hidden = false;
    errorBox.hidden = true;
    kworkLink.hidden = true;
    syncChannel();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.classList.contains('is-sending') || !validate()) return;
    const f = form.elements;
    const data = {
      name: f.name.value.trim(),
      project: f.project.value.trim(),
      description: f.description.value.trim(),
      platform: f.platform.value,
      channel: f.platform.value === 'other' ? f.channel.value : '',
      contact: f.platform.value === 'other' ? f.contact.value.trim() : '',
      comment: f.comment.value.trim(),
      website: f.website.value, // ловушка для ботов
      page: location.href,
    };
    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      showError(`Форма временно не работает. Напишите мне в&nbsp;<a href="https://t.me/ivanov_web" target="_blank" rel="noopener">Telegram</a> или на&nbsp;<a href="${KWORK}" target="_blank" rel="noopener">Kwork</a>.`);
      return;
    }
    submit.classList.add('is-sending');
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showDone(data);
    } catch (err) {
      showError(`Не получилось отправить заявку. Попробуйте ещё раз или напишите мне в&nbsp;<a href="https://t.me/ivanov_web" target="_blank" rel="noopener">Telegram</a> или на&nbsp;<a href="${KWORK}" target="_blank" rel="noopener">Kwork</a>.`);
    } finally {
      submit.classList.remove('is-sending');
    }
  });
})();
