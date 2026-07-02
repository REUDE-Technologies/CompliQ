/* =============================================
  Compliq by Reude Technologies Landing Page — JavaScript
  Splash Intro, Particles, Auth, Scroll Effects
  ============================================= */

// ── SPLASH SCREEN TIMER ───────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    document.body.style.overflow = 'hidden'; // Lock scrolling
    setTimeout(() => {
      splash.classList.add('fade-out');
      setTimeout(() => {
        document.body.style.overflow = ''; // Restore scrolling
        splash.style.display = 'none';
      }, 800); // Match CSS transition duration
    }, 7000);
  }
});

// ── AUTH SYSTEM ──────────────────────────────
const USERS_KEY = 'compliq_users';
const SESSION_KEY = 'compliq_session';

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
}
function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function openAuth(tab = 'login') {
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.add('show');
  switchAuthTab(tab);
  document.body.style.overflow = 'hidden';
}

function closeAuth() {
  document.getElementById('auth-overlay').classList.remove('show');
  document.body.style.overflow = '';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`form-${tab}`).classList.add('active');
}

document.getElementById('auth-close').addEventListener('click', closeAuth);
document.getElementById('auth-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('auth-overlay')) closeAuth();
});

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
});

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  // Allow demo account
  const isDemoAccount = email === 'admin@reude.com' && password === 'password123';
  const users = getUsers();
  const found = users.find(u => u.email === email && u.password === password);

  if (!isDemoAccount && !found) {
    showAuthError('login-form', 'Invalid email or password.');
    return;
  }

  const userData = found || {
    firstName: 'Admin',
    lastName: 'Operator',
    org: 'Reude Technologies',
    email: 'admin@reude.com',
    role: 'Administrator'
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
  showAuthSuccess('login-form', `Welcome back, ${userData.firstName}! Redirecting…`);
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
}

function handleRegister(e) {
  e.preventDefault();
  const firstName = document.getElementById('reg-fname').value.trim();
  const lastName = document.getElementById('reg-lname').value.trim();
  const org = document.getElementById('reg-org').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const role = document.getElementById('reg-role').value;
  const password = document.getElementById('reg-password').value;

  const users = getUsers();
  if (users.find(u => u.email === email)) {
    showAuthError('register-form', 'An account with this email already exists.');
    return;
  }

  const newUser = { firstName, lastName, org, email, role, password };
  users.push(newUser);
  saveUsers(users);
  localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
  showAuthSuccess('register-form', `Account created! Welcome, ${firstName}. Redirecting…`);
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
}

function showAuthError(formId, msg) {
  clearAuthMessages(formId);
  const form = document.getElementById(formId);
  const div = document.createElement('div');
  div.className = 'auth-message error';
  div.style.cssText = 'background:rgba(150,71,52,0.15);border:1px solid rgba(150,71,52,0.35);color:#C2724A;padding:10px 14px;border-radius:8px;font-size:0.82rem;margin-bottom:14px;';
  div.textContent = msg;
  form.insertBefore(div, form.querySelector('button[type=submit]'));
}
function showAuthSuccess(formId, msg) {
  clearAuthMessages(formId);
  const form = document.getElementById(formId);
  const div = document.createElement('div');
  div.className = 'auth-message success';
  div.style.cssText = 'background:rgba(15,164,175,0.12);border:1px solid rgba(15,164,175,0.3);color:#0FA4AF;padding:10px 14px;border-radius:8px;font-size:0.82rem;margin-bottom:14px;';
  div.textContent = msg;
  form.insertBefore(div, form.querySelector('button[type=submit]'));
}
function clearAuthMessages(formId) {
  document.getElementById(formId).querySelectorAll('.auth-message').forEach(el => el.remove());
}

function togglePwd(id) {
  const inp = document.getElementById(id);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function handleContactSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type=submit]');
  btn.innerHTML = '<span>Message Sent ✓</span>';
  btn.style.background = 'linear-gradient(135deg,#0FA4AF,#024950)';
  setTimeout(() => {
    btn.innerHTML = '<span>Send Message</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    btn.style.background = '';
    form.reset();
  }, 3000);
}

// ── PARTICLE CANVAS ───────────────────────────
(function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.r = Math.random() * 1.5 + 0.5;
      this.alpha = Math.random() * 0.5 + 0.2;
      this.color = Math.random() < 0.6
        ? `rgba(15,164,175,${this.alpha})`
        : `rgba(175,221,229,${this.alpha * 0.7})`;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  for (let i = 0; i < 120; i++) particles.push(new Particle());

  const LINE_DIST = 100;
  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });

    // Draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < LINE_DIST) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(15,164,175,${0.06 * (1 - dist / LINE_DIST)})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
})();

// ── NAVBAR SCROLL EFFECT ──────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
  updateActiveNavLink();
});

// ── HAMBURGER MENU ────────────────────────────
const hamburger = document.getElementById('nav-hamburger');
const navLinks  = document.getElementById('nav-links');
const navActions = document.getElementById('nav-actions');
if (hamburger) {
  hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    navLinks.classList.toggle('mobile-open', open);
    navActions.classList.toggle('mobile-open', open);
  });
  // Close on link click
  document.querySelectorAll('.nav-link').forEach(l => {
    l.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('mobile-open');
      navActions.classList.remove('mobile-open');
    });
  });
}

// ── ACTIVE NAV LINK ───────────────────────────
function updateActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const scrollPos = window.scrollY + 100;
  sections.forEach(sec => {
    const top = sec.offsetTop;
    const bottom = top + sec.offsetHeight;
    const link = document.querySelector(`.nav-link[href="#${sec.id}"]`);
    if (link) link.classList.toggle('active', scrollPos >= top && scrollPos < bottom);
  });
}

// ── PARALLAX HERO IMAGE — disabled (video background) ────────────

// ── INTERSECTION OBSERVER FOR REVEAL ─────────
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal-left, .reveal-right, .reveal-up, .feature-card, .team-card').forEach(el => {
  revealObserver.observe(el);
});

// ── ANIMATED COUNTER ─────────────────────────
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      animateCounters();
      counterObserver.disconnect();
    }
  });
}, { threshold: 0.5 });

const statsEl = document.querySelector('.hero-stats');
if (statsEl) counterObserver.observe(statsEl);

function animateCounters() {
  document.querySelectorAll('.stat-number').forEach(el => {
    const target = parseFloat(el.dataset.target);
    const isDecimal = String(target).includes('.');
    const duration = 1800;
    const start = performance.now();
    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      const val = target * ease;
      el.textContent = isDecimal ? val.toFixed(1) : Math.floor(val);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}

// ── SMOOTH SCROLL FOR NAV LINKS ───────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── CHECK EXISTING SESSION + THEME INIT ──────
window.addEventListener('DOMContentLoaded', () => {
  const session = localStorage.getItem(SESSION_KEY);
  if (session) {
    const userData = JSON.parse(session);
    // Update nav to show user name and dashboard link without removing existing buttons (preserve theme toggle)
    const navActions = document.querySelector('.nav-actions');
    if (navActions) {
      const userHtml = `
        <div style="display:flex;align-items:center;gap:12px;margin-left:8px;">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--c-teal);color:var(--c-deep);font-weight:700;font-size:0.8rem;display:flex;align-items:center;justify-content:center;">
            ${userData.firstName ? userData.firstName[0] : ''}${userData.lastName ? userData.lastName[0] : ''}
          </div>
          <span style="font-size:0.85rem;color:var(--c-sky);">${userData.firstName || ''}</span>
          <a href="javascript:goToDashboard()" style="background:var(--c-teal);color:var(--c-deep);padding:8px 18px;border-radius:8px;font-weight:700;font-size:0.85rem;text-decoration:none;">Dashboard →</a>
        </div>
      `;
      navActions.insertAdjacentHTML('beforeend', userHtml);
    }
  }

  // Theme initialization: apply saved theme and wire toggle button
  const savedTheme = localStorage.getItem('site_theme') || 'light';
  applyTheme(savedTheme);

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀️';
    themeBtn.addEventListener('click', () => {
      const current = localStorage.getItem('site_theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('site_theme', next);
      applyTheme(next);
      themeBtn.textContent = next === 'light' ? '🌙' : '☀️';
    });
  }
});

function applyTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
}

function goToDashboard() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const user = JSON.parse(raw);
      if (user.sector === 'solar') { window.location.href = 'solar-dashboard.html'; return; }
    } catch(e) {}
  }
  window.location.href = 'dashboard.html';
}
