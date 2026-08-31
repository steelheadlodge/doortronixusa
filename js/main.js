/* DoortronixUSA.com — Main JS */

// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.querySelector('.nav-toggle');
  const links  = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
    });
  }

  // Accordion
  document.querySelectorAll('.accordion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = btn.nextElementSibling;
      btn.classList.toggle('open');
      body.classList.toggle('open');
    });
  });

  // Account / sign-in (portal)
  if (links && !links.querySelector('.btn-nav-account')) {
    const inProducts = /\/products\//.test(location.pathname);
    const base = inProducts ? '../' : '';
    const signedIn = !!localStorage.getItem('dtx_session');
    const a = document.createElement('a');
    a.className = 'btn-nav-account';
    a.href = signedIn ? base + 'portal/index.html' : base + 'portal/login.html';
    a.textContent = signedIn ? 'My Account' : 'Sign In';
    const cta = links.querySelector('.btn-nav-cta');
    if (cta) links.insertBefore(a, cta);
    else links.appendChild(a);
  }

  // Active nav link
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href && href.includes(path)) a.classList.add('active');
  });
});
