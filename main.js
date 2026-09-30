(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  // Навигация: фон при скролле, бургер, активный пункт
  const nav = document.querySelector('.nav');
  const burger = document.querySelector('.nav__burger');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('.nav__links a').forEach((a) => a.addEventListener('click', () => {
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
  }));

  const links = [...document.querySelectorAll('.nav__links a')];
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

  // ============ Контакты: вау-появление ============
  const card = document.querySelector('[data-contact]');
  if (card) {
    const fx = card.querySelector('.contact__fx');
    const ctx = fx.getContext('2d');
    const colors = ['#d4ff3f', '#7c5cff', '#ff4fd8', '#ffffff', '#a996ff'];
    let particles = [];
    let running = false;

    let dpr = 1;
    const sizeFx = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      fx.width = card.clientWidth * dpr;
      fx.height = card.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeFx();
    window.addEventListener('resize', sizeFx);

    // Конфетти: x, y — точка взрыва внутри карточки
    const burst = (x, y, count = 120, power = 1) => {
      if (reduceMotion) return;
      for (let n = 0; n < count; n++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (4 + Math.random() * 9) * power;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 4 * power,
          size: 4 + Math.random() * 7,
          color: colors[(Math.random() * colors.length) | 0],
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4,
          shape: Math.random() < 0.3 ? 'circle' : Math.random() < 0.5 ? 'star' : 'rect',
          life: 1,
          decay: 0.4 + Math.random() * 0.5, // доля жизни в секунду: частица живёт 1.1–2.5 с
        });
      }
      if (!running) { running = true; fx.hidden = false; last = performance.now(); requestAnimationFrame(tick); }
    };

    const drawStar = (r) => {
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const rad = k % 2 ? r * 0.35 : r;
        const a = (k * Math.PI) / 4;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fill();
    };

    // физика по реальному времени, а не по кадрам: на слабом устройстве конфетти
    // не «зависает» дольше, а просто рисуется реже
    let last = 0;
    const tick = (now) => {
      const k = Math.min((now - last) / 16.67, 4); // 1 = один кадр при 60 fps
      last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, fx.width, fx.height);
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        const drag = Math.pow(0.985, k);
        p.vx *= drag;
        p.vy = p.vy * drag + 0.22 * k;
        p.x += p.vx * k;
        p.y += p.vy * k;
        p.rot += p.vr * k;
        p.life -= p.decay * k / 60;
        const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
        ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin, dpr * cos, dpr * p.x, dpr * p.y);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        else if (p.shape === 'star') drawStar(p.size * 0.8);
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (particles.length) requestAnimationFrame(tick);
      else { running = false; fx.hidden = true; } // пустой холст не держим отдельным слоем
    };

    const go = () => {
      card.classList.add('is-live');
      // два залпа из нижних углов и один из центра, когда карточка раскрылась
      setTimeout(() => {
        const w = card.clientWidth, h = card.clientHeight;
        burst(w * 0.12, h * 0.9, 60, 1.1);
        burst(w * 0.88, h * 0.9, 60, 1.1);
      }, 700);
      setTimeout(() => burst(card.clientWidth / 2, card.clientHeight * 0.42, 90, 1.2), 1500);
    };

    if (reduceMotion || !('IntersectionObserver' in window)) {
      card.classList.add('is-live');
    } else {
      const obs = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { go(); obs.disconnect(); }
      }, { threshold: 0.35 });
      obs.observe(card);
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
        burst(r.left + r.width / 2 - c.left, r.top + r.height / 2 - c.top, 60, 0.8);
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
