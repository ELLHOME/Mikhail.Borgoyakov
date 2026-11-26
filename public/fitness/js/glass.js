/** Liquid-glass helpers: SVG refraction filters and the sliding lens behind the active tab. */
(() => {
  const ua = navigator.userAgent;
  // Only Chromium renders SVG filters inside backdrop-filter; WebKit (all iOS browsers) does not.
  if (/Chrome\//.test(ua) && !/iPhone|iPad|iPod/.test(ua)) document.documentElement.classList.add('lg-refract');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const map = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100' viewBox='0 0 200 100' preserveAspectRatio='none'><defs><linearGradient id='r' x1='0' x2='1'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#f00'/></linearGradient><linearGradient id='g' y1='0' y2='1' x1='0' x2='0'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#0f0'/></linearGradient><filter id='b'><feGaussianBlur stdDeviation='9'/></filter></defs><rect width='200' height='100' fill='url(#r)'/><rect width='200' height='100' fill='url(#g)' style='mix-blend-mode:screen'/><rect x='22' y='22' width='156' height='56' rx='28' fill='#808000' filter='url(#b)'/></svg>`;
  svg.innerHTML = `<filter id="lgRefract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage href="data:image/svg+xml,${encodeURIComponent(map)}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="soft"/>
    <feDisplacementMap in="soft" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="lgRefractBar" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage href="data:image/svg+xml,${encodeURIComponent(map)}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="18" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
  document.body.appendChild(svg);

  const nav = document.querySelector('.nav-tabs');
  if (!nav) return;
  const lens = document.createElement('span');
  lens.className = 'nav-lens';
  lens.setAttribute('aria-hidden', 'true');
  nav.prepend(lens);
  let last = null;
  const place = (animate) => {
    const t = nav.querySelector('.nav-tab.active');
    if (!t) { lens.style.opacity = '0'; return; }
    lens.style.opacity = '1';
    if (!animate) lens.style.transition = 'none';
    lens.style.width = `${t.offsetWidth}px`;
    lens.style.transform = `translateX(${t.offsetLeft}px)`;
    if (!animate) { lens.offsetWidth; lens.style.transition = ''; }
    else if (last && last !== t) { lens.classList.remove('is-moving'); lens.offsetWidth; lens.classList.add('is-moving'); }
    last = t;
  };
  new MutationObserver(() => place(true)).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', () => place(false));
  document.fonts?.ready.then(() => place(false));
  place(false);
})();
