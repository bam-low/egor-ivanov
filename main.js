(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // ============ Облегчённый режим для слабых устройств ============
  // Если устройство не тянет 60 кадров (слабый ноутбук, браузер без аппаратного ускорения),
  // бесконечные декоративные анимации выключаются — сайт выглядит так же, но не тормозит.
  // ?fx=lite / ?fx=full в адресе — принудительно, для проверки.
  const fxParam = new URLSearchParams(location.search).get('fx');
  const isLite = () => root.classList.contains('fx-lite');
  const setLite = () => root.classList.add('fx-lite');
  if (fxParam === 'lite') setLite();
  else if (fxParam !== 'full') {
    const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
    if ((mem && mem <= 2) || (cores && cores <= 2) || (navigator.connection && navigator.connection.saveData)) setLite();
  }
  // Замер кадров за ms миллисекунд: медиана интервала и доля «рывков» (кадров заметно длиннее обычного).
  const probeFrames = (ms) => new Promise((resolve) => {
    const t = [];
    const start = performance.now();
    const step = (now) => {
      t.push(now);
      if (now - start < ms) requestAnimationFrame(step);
      else {
        const d = t.slice(1).map((v, i) => v - t[i]);
        const sorted = d.slice().sort((a, b) => a - b);
        const median = sorted.length ? sorted[sorted.length >> 1] : 0;
        const jank = d.filter((x) => x > Math.max(25, median * 1.7)).length / Math.max(1, d.length);
        resolve({ median, jank });
      }
    };
    requestAnimationFrame(step);
  });
  // Облегчённый режим включаем только при настоящих рывках. Ровные 30 кадров (так браузер
  // работает на батарее в режиме энергосбережения) — не повод: анимации идут плавно, просто реже.
  root.dataset.fxReason = fxParam ? `?fx=${fxParam}` : (isLite() ? 'слабое железо' : '');
  const checkPerf = (ms, why) => {
    if (fxParam === 'lite' || fxParam === 'full' || isLite() || document.hidden) return;
    probeFrames(ms).then(({ median, jank }) => {
      if (document.hidden) return;
      if (median > 40 || jank > 0.2) {
        setLite();
        root.dataset.fxReason = `${why}: ${Math.round(1000 / median)} fps, рывков ${Math.round(jank * 100)}%`;
      }
    });
  };
  // первый замер — когда страница загрузилась и успокоилась
  window.addEventListener('load', () => setTimeout(() => checkPerf(1500, 'после загрузки'), 1500), { once: true });

  // Отладочная панель: ?debug в адресе — частота кадров, рывки и режим анимаций
  if (new URLSearchParams(location.search).has('debug')) {
    const hud = document.createElement('div');
    hud.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:12px;' +
      'background:rgba(0,0,0,.82);color:#d4ff3f;font:600 12px/1.5 ui-monospace,monospace;pointer-events:none;white-space:pre';
    document.body.appendChild(hud);
    let frames = [];
    let longOnes = 0;
    let last = performance.now();
    const tick = (now) => {
      const d = now - last; last = now;
      frames.push(d);
      if (d > 50) longOnes++;
      if (frames.length >= 30) {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
        const worst = Math.max(...frames);
        hud.textContent =
          `FPS ${Math.round(1000 / avg)}  худший кадр ${Math.round(worst)} мс\n` +
          `кадров >50 мс всего: ${longOnes}\n` +
          `режим: ${isLite() ? 'облегчённый' : 'полный'}${root.dataset.fxReason ? ' (' + root.dataset.fxReason + ')' : ''}\n` +
          `экран ${innerWidth}×${innerHeight} @${devicePixelRatio}x`;
        frames = [];
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Разбиваем заголовки на слова и буквы для анимации появления.
  // Нумерация букв (--i) своя для каждого заголовка.
  const counters = new Map();
  document.querySelectorAll('[data-split]').forEach((line) => {
    const heading = line.closest('h1, h2') || line;
    let i = counters.get(heading) || 0;
    const words = line.textContent.trim().split(/\s+/);
    line.textContent = '';
    words.forEach((word, w) => {
      const wordEl = document.createElement('span');
      wordEl.className = 'word';
      for (const char of word) {
        const span = document.createElement('span');
        span.className = 'ch';
        span.style.setProperty('--i', i++);
        span.textContent = char;
        wordEl.appendChild(span);
      }
      line.appendChild(wordEl);
      if (w < words.length - 1) line.appendChild(document.createTextNode(' '));
    });
    counters.set(heading, i);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-loaded')));

  // Появление блоков при скролле
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const siblings = [...entry.target.parentElement.children].filter((el) => el.classList.contains('reveal'));
        entry.target.style.transitionDelay = `${Math.max(0, siblings.indexOf(entry.target)) * 80}ms`;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  // Цифры доверия: счёт от нуля, когда блок появляется на экране
  const statNums = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const run = (el) => {
      const to = +el.dataset.count;
      const suffix = el.dataset.suffix || '';
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / 1400);
        el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const countIo = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      run(e.target);
      countIo.unobserve(e.target);
    }), { threshold: 0.6 });
    statNums.forEach((el) => { el.textContent = '0' + (el.dataset.suffix || ''); countIo.observe(el); });
  }

  // Вопросы и ответы: открыт только один ответ (name="faq" делает так же в новых браузерах, это — для старых)
  const faqItems = [...document.querySelectorAll('.faq__item')];
  faqItems.forEach((item) => item.addEventListener('toggle', () => {
    if (item.open) faqItems.forEach((other) => { if (other !== item && other.open) other.open = false; });
  }));

  // Навигация: фон при скролле, бургер, активный пункт
  const nav = document.querySelector('.nav');
  const burger = document.querySelector('.nav__burger');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  requestAnimationFrame(onScroll); // не заставляем браузер считать раскладку посреди загрузки

  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => {
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }));

  // подсветка пункта меню — только для якорей на этой же странице (на странице «Портфолио» ссылки ведут на главную)
  const links = [...document.querySelectorAll('.nav__links a')].filter((a) => a.getAttribute('href').startsWith('#'));
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  // Кастомный курсор
  const cursor = document.querySelector('.cursor');
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    let x = 0, y = 0, cx = 0, cy = 0, looping = false;
    window.addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      cursor.classList.add('is-active');
      if (!looping) { looping = true; requestAnimationFrame(loop); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.remove('is-active'));
    document.querySelectorAll('a, button, .service, .tools__list li').forEach((el) => {
      el.addEventListener('pointerenter', () => cursor.classList.add('is-hover'));
      el.addEventListener('pointerleave', () => cursor.classList.remove('is-hover'));
    });
    // цикл работает, только пока точка догоняет мышь
    const loop = () => {
      cx += (x - cx) * 0.2;
      cy += (y - cy) * 0.2;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      if (Math.abs(x - cx) + Math.abs(y - cy) > 0.3) requestAnimationFrame(loop);
      else looping = false;
    };
  }

  // ============ Форматы работы: переключатели над шагами ============
  const formatTabs = [...document.querySelectorAll('.format')];
  const selectFormat = (tab, focus) => {
    formatTabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });
    if (focus) tab.focus();
  };
  formatTabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectFormat(tab));
    // стрелки влево/вправо — как у обычных вкладок
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step) { e.preventDefault(); selectFormat(formatTabs[(i + step + formatTabs.length) % formatTabs.length], true); }
    });
  });

  // ============ Работы ============
  const works = [...document.querySelectorAll('[data-work]')];
  const VER = '?v=26';

  // Формат, который выбрал браузер для обложки (AVIF, если поддерживает, иначе WebP) —
  // в нём же грузим длинный скриншот и полную версию
  const fmtOf = (work) => (work.querySelector('.work__screen img').currentSrc.includes('.avif') ? 'avif' : 'webp');
  const urlOf = (work, kind) => `${work.dataset.img}${kind === 'full' ? '-full' : ''}.${fmtOf(work)}${VER}`;

  // Кэш загрузок: каждая картинка качается и декодируется один раз
  const loads = new Map();
  const preload = (url) => {
    if (!loads.has(url)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      loads.set(url, img.decode().then(() => img).catch(() => img));
    }
    return loads.get(url);
  };

  // Насколько прокручивать скриншот при наведении: высота картинки минус окно.
  // Скорость постоянная (~320 px/с), поэтому длинные сайты листаются дольше.
  const measureWork = (work) => {
    if (!work.classList.contains('is-tall')) return;
    const screen = work.querySelector('.work__screen');
    const img = screen.querySelector('img');
    const shift = Math.max(0, img.offsetHeight - screen.clientHeight);
    work.style.setProperty('--shift', shift.toFixed(0));
    work.style.setProperty('--dur', `${Math.min(14, Math.max(3, shift / 320)).toFixed(1)}s`);
  };

  // Сначала в карточке лёгкая обложка (только верх сайта). Длинный скриншот качаем,
  // когда карточка подъезжает к экрану или на неё навели, и незаметно подменяем:
  // обложка — точная копия его верхней части.
  const upgradeWork = (work) => {
    if (work.dataset.upgrading) return;
    work.dataset.upgrading = '1';
    const img = work.querySelector('.work__screen img');
    const source = work.querySelector('.work__screen source');
    const ready = () => {
      const url = urlOf(work, 'tall');
      preload(url).then(() => {
        // мерить можно только когда браузер подставил новую картинку — по событию load
        img.addEventListener('load', () => {
          work.classList.add('is-tall');
          measureWork(work);
        }, { once: true });
        img.height = Number(work.dataset.tallH);
        if (source) source.srcset = `${work.dataset.img}.avif${VER}`;
        img.src = `${work.dataset.img}.webp${VER}`;
      });
    };
    if (img.complete && img.currentSrc) ready();
    else img.addEventListener('load', ready, { once: true });
  };

  if ('IntersectionObserver' in window) {
    const near = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { upgradeWork(e.target); near.unobserve(e.target); }
    }), { rootMargin: '500px 0px' });
    works.forEach((work) => near.observe(work));
  } else works.forEach(upgradeWork);

  works.forEach((work) => {
    // наведение = намерение: сразу тянем и длинный скриншот, и полную версию для просмотра
    const intent = () => {
      upgradeWork(work);
      const img = work.querySelector('.work__screen img');
      if (img.currentSrc) preload(urlOf(work, 'full'));
    };
    work.addEventListener('pointerenter', intent);
    work.addEventListener('focusin', intent);
  });
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver((entries) => entries.forEach((e) => measureWork(e.target.closest('[data-work]'))));
    works.forEach((work) => ro.observe(work.querySelector('.work__screen')));
    works.forEach((work) => ro.observe(work.querySelector('.work__screen img')));
  }

  // Просмотр проекта целиком
  const viewer = document.querySelector('.viewer');
  if (viewer && works.length) {
    const vImg = viewer.querySelector('.viewer__img');
    const vBody = viewer.querySelector('.viewer__body');
    let current = 0;
    let token = 0;
    const show = (i) => {
      current = (i + works.length) % works.length;
      const work = works[current];
      const cardImg = work.querySelector('.work__screen img');
      const myToken = ++token;
      viewer.querySelector('.viewer__num').textContent = work.querySelector('.work__num').textContent;
      viewer.querySelector('.viewer__title').textContent = work.querySelector('.work__title').textContent;
      viewer.querySelector('.viewer__cat').textContent = work.querySelector('.work__cat').textContent;
      vImg.alt = cardImg.alt;
      vBody.scrollTop = 0;
      // мгновенно — то, что уже загружено для этой карточки (никаких картинок чужого проекта),
      // затем подменяем на полное разрешение, когда оно скачается и декодируется
      const [fw, fh] = work.dataset.fullSize.split('x').map(Number);
      vImg.width = fw; vImg.height = fh;
      vImg.src = cardImg.currentSrc || cardImg.src;
      viewer.classList.add('is-loading');
      preload(urlOf(work, 'full')).then((full) => {
        if (myToken !== token) return; // пока качалось, открыли другой проект
        vImg.src = full.src;
        viewer.classList.remove('is-loading');
      });
      // соседние проекты подгружаем заранее — листание стрелками без ожидания
      preload(urlOf(works[(current + 1) % works.length], 'full'));
    };
    const open = (i) => {
      show(i);
      document.documentElement.classList.add('is-locked');
      viewer.showModal();
    };
    works.forEach((work, i) => work.querySelector('.work__open').addEventListener('click', () => open(i)));
    viewer.querySelectorAll('[data-step]').forEach((btn) =>
      btn.addEventListener('click', () => show(current + Number(btn.dataset.step))));
    viewer.querySelector('.viewer__close').addEventListener('click', () => viewer.close());
    viewer.addEventListener('close', () => document.documentElement.classList.remove('is-locked'));
    // клик по затемнению вокруг окна закрывает его
    viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') show(current + 1);
      if (e.key === 'ArrowLeft') show(current - 1);
    });
  }

  // ============ Контакты: вау-появление ============
  const card = document.querySelector('[data-contact]');
  if (card) {
    const fx = card.querySelector('.contact__fx');
    const colors = ['#d4ff3f', '#7c5cff', '#ff4fd8', '#ffffff', '#a996ff'];
    const rnd = (a, b) => a + Math.random() * (b - a);

    // Конфетти: пул заранее созданных частиц (создаём, пока блок ещё под экраном).
    // В момент взрыва только задаём траекторию и включаем CSS-анимацию — её ведёт видеокарта.
    const pool = [];
    const fillPool = () => {
      if (pool.length || reduceMotion) return;
      const frag = document.createDocumentFragment();
      for (let n = 0; n < 72; n++) {
        const el = document.createElement('i');
        const kind = n % 3;
        el.className = 'confetti' + (kind === 1 ? ' confetti--dot' : kind === 2 ? ' confetti--diamond' : '');
        el.style.setProperty('--c', colors[n % colors.length]);
        el.addEventListener('animationend', () => el.classList.remove('is-go'));
        pool.push(el);
        frag.appendChild(el);
      }
      fx.appendChild(frag);
    };
    const burst = (x, y, count = 24, power = 1) => {
      if (reduceMotion) return;
      fillPool();
      if (isLite()) count = Math.ceil(count / 2);
      const free = pool.filter((el) => !el.classList.contains('is-go')).slice(0, count);
      free.forEach((el) => {
        const angle = rnd(-Math.PI, 0); // веером вверх
        const speed = rnd(120, 340) * power;
        const up = Math.sin(angle) * speed;
        el.style.cssText +=
          `;--x:${x.toFixed(0)}px;--y:${y.toFixed(0)}px;--s:${rnd(6, 12).toFixed(1)}px;` +
          `--dx:${(Math.cos(angle) * speed * 1.4).toFixed(0)}px;--up:${up.toFixed(0)}px;` +
          `--down:${(up + rnd(260, 480)).toFixed(0)}px;--r:${rnd(-540, 540).toFixed(0)}deg;` +
          `--t:${rnd(1.4, 2.4).toFixed(2)}s;--delay:${rnd(0, 0.12).toFixed(2)}s`;
        el.classList.add('is-go');
      });
    };

    const go = () => {
      card.classList.add('is-live');
      // два залпа из нижних углов и один из центра, когда карточка раскрылась
      setTimeout(() => {
        const w = card.clientWidth, h = card.clientHeight;
        burst(w * 0.12, h * 0.9, 22, 1.2);
        burst(w * 0.88, h * 0.9, 22, 1.2);
      }, 700);
      setTimeout(() => burst(card.clientWidth / 2, card.clientHeight * 0.42, 28, 1.1), 1500);
    };

    if (reduceMotion || !('IntersectionObserver' in window)) {
      card.classList.add('is-live');
    } else {
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { go(); obs.disconnect(); }
      }, { threshold: 0.35 });
      obs.observe(card);
      // частицы конфетти создаём заранее, примерно за экран до появления блока,
      // пока браузер ничем не занят, — в момент появления остаётся только запустить анимацию
      const arm = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        fillPool();
        // второй замер — пока человек подлистывает к блоку: если прокрутка уже
        // дёргается, облегчённый режим включится ещё до вау-анимации
        checkPerf(800, 'при прокрутке');
        arm.disconnect();
      }, { rootMargin: '0px 0px 900px 0px' });
      arm.observe(card);
    }

    // Прожектор и параллакс фигур за курсором.
    // Обновляем не чаще раза за кадр и только transform / переменные контейнера фигур.
    const spot = card.querySelector('.contact__spot');
    const shapes = card.querySelector('.contact__shapes');
    let mouse = null, queued = false;
    const applyMouse = () => {
      queued = false;
      if (!mouse) {
        shapes.style.setProperty('--px', 0);
        shapes.style.setProperty('--py', 0);
        return;
      }
      const r = card.getBoundingClientRect();
      const x = mouse.x - r.left, y = mouse.y - r.top;
      spot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      shapes.style.setProperty('--px', ((x / r.width - 0.5) * 2).toFixed(3));
      shapes.style.setProperty('--py', ((y / r.height - 0.5) * 2).toFixed(3));
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(applyMouse); } };
    card.addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY }; queue(); }, { passive: true });
    card.addEventListener('pointerleave', () => { mouse = null; queue(); });

    // Магнитные кнопки + конфетти по клику
    card.querySelectorAll('.magnetic').forEach((btn) => {
      if (window.matchMedia('(hover: hover)').matches && !reduceMotion) {
        btn.addEventListener('pointermove', (e) => {
          const r = btn.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          btn.style.transform = `translate(${dx * 0.25}px, ${dy * 0.35}px)`;
        });
        btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
      }
      btn.addEventListener('click', () => {
        const r = btn.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        burst(r.left + r.width / 2 - c.left, r.top + r.height / 2 - c.top, 20, 0.8);
      });
    });
  }

  // Бесконечные анимации блоков вне экрана ставим на паузу — видеокарта не тратит на них кадры
  if ('IntersectionObserver' in window) {
    const pauser = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
    }, { rootMargin: '100px 0px' });
    document.querySelectorAll('.hero, .marquee, .contact__card').forEach((el) => pauser.observe(el));
  }

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
