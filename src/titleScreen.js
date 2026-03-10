// ─── Title Screen ───

export function createTitleScreen() {
  // Load decorative fonts
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@600;700&display=swap';
  document.head.appendChild(fontLink);

  const overlay = document.createElement('div');
  overlay.className = 'title-overlay';

  overlay.innerHTML = `
    <div class="title-content">
      <div class="title-flourish-top"></div>
      <div class="title-subtitle">The Case of</div>
      <div class="title-main">Chinese<br>John</div>
      <div class="title-flourish-bottom"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Fade in
  requestAnimationFrame(() => {
    overlay.classList.add('title-visible');
  });

  // Auto-fade out after 5 seconds, remove after transition
  setTimeout(() => {
    overlay.classList.add('title-fadeout');
    setTimeout(() => {
      overlay.remove();
    }, 3000);
  }, 5000);
}
