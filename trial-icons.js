// أيقونات «أجل كم؟»: رسم SVG بخط واحد موحّد، يطلع نفس الشكل على كل الأجهزة.
(function (root) {
  const svg = (body, extra) => `<svg class="ico${extra ? ' ' + extra : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    call: svg('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
    opts: svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
    sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
    mute: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
    full: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
    menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    gavel: svg('<path d="m14 4 6 6M11 7l6 6M12.5 5.5l-4 4 6 6 4-4M9.5 12.5 3 19l2 2 6.5-6.5"/>'),
    coins: svg('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    cross: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    run: svg('<circle cx="15" cy="4.5" r="2"/><path d="m8 21 3-6 3 2v5M7 12l3-4 4 1 3 4 3 1M10 8 7 7"/>')
  };
  // أيقونة لكل فئة. فئة جديدة بدون أيقونة تاخذ النجمة
  const CAT = {
    'كورة سعودية': '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M21 10l-5 0M3 10h5M7 20l2.5-5.5M17 20l-2.5-5.5"/>',
    'رياضة عالمية': '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
    'جغرافيا': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    'جغرافيا السعودية': '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    'عواصم': '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
    'أكلات شعبية': '<path d="M3 12h18a9 9 0 0 1-18 0zM12 3v3M8 5l1 2M16 5l-1 2"/>',
    'علوم': '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>',
    'تقنية': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    'تاريخ السعودية': '<path d="M5 3h11a3 3 0 0 1 3 3v15H8a3 3 0 0 1-3-3z"/><path d="M5 18a3 3 0 0 1 3-3h11M9 7h6M9 11h4"/>',
    'معلومات عامة': '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    'حيوانات': '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="5.5" r="2"/><circle cx="14" cy="5.5" r="2"/><circle cx="18" cy="10" r="2"/><path d="M12 11c-3 0-5.5 4-5.5 6.5 0 2 1.5 3 3 3 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c1.5 0 3-1 3-3 0-2.5-2.5-6.5-5.5-6.5z"/>',
    'لغة عربية': '<path d="M4 20h16M6 16l6-12 6 12M8.5 11h7"/>',
    'ثقافة إسلامية': '<path d="M4 21V11a8 8 0 0 1 16 0v10M4 21h16M12 3V1M9 21v-5a3 3 0 0 1 6 0v5"/>',
    'جسم الإنسان وصحة': '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/><path d="M3 12h5l2-3 3 6 2-3h6"/>',
    'شركات وعلامات تجارية': '<path d="M3 7h18v13H3zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    'شعر وأدب': '<path d="M20 4c-6 0-11 5-12 12l-3 4M20 4c0 6-5 11-11 12M14 4c0 4-2 7-6 9"/>',
    'أفلام ومسلسلات وأنمي': '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 6l2 4M12 6l2 4M17 6l2 4"/>'
  };
  const STAR = '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>';
  const catIcon = (cat, cls) => svg(CAT[cat] || STAR, cls || 'cic');
  // علامة اللعبة: مضرب المزاد وعليه «؟» (الشعار المعتمد، assets/logo/mark.svg)
  const MARK = `<svg class="mark" viewBox="0 0 110 104" aria-hidden="true"><g transform="translate(0 2)"><g stroke-linejoin="round" stroke-linecap="round"><g transform="translate(5 6)" fill="#1d1446"><rect x="44" y="58" width="13" height="36" rx="6"/><circle cx="50" cy="38" r="33.5"/></g><rect x="44" y="58" width="13" height="36" rx="6" fill="#d39556" stroke="#1d1446" stroke-width="5"/><circle cx="50" cy="38" r="31" fill="#ff4f5e" stroke="#1d1446" stroke-width="5"/><path d="M36 26a14 14 0 0 1 8-7" fill="none" stroke="#ff9aa3" stroke-width="5"/><path d="M61 29c0-8-5-12-11-12s-11 4-11 11c0 9 11 9 11 17" fill="none" stroke="#fff" stroke-width="8"/><circle cx="50" cy="56" r="4.5" fill="#fff"/></g></g></svg>`;
  // الشعار المعتمد: الكلمة مع المضرب (assets/logo/wordmark.svg). نص SVG بخط Lalezar اللي تحمّله الصفحات
  const WORD = `<svg class="wordmark" viewBox="0 0 490 150" role="img" aria-label="أجل كم؟"><text x="475" y="118" font-family="Lalezar, Tahoma, sans-serif" font-size="110" text-anchor="start" direction="rtl" fill="#1d1446" stroke="#1d1446" stroke-width="15.4" stroke-linejoin="round">أجل كم</text><text x="470" y="112" font-family="Lalezar, Tahoma, sans-serif" font-size="110" text-anchor="start" direction="rtl" fill="#fff" stroke="#1d1446" stroke-width="15.4" stroke-linejoin="round" paint-order="stroke">أجل <tspan fill="#ff4f5e">كم</tspan></text><g transform="translate(6 10) scale(1.15)"><g stroke-linejoin="round" stroke-linecap="round"><g transform="translate(5 6)" fill="#1d1446"><rect x="44" y="58" width="13" height="36" rx="6"/><circle cx="50" cy="38" r="33.5"/></g><rect x="44" y="58" width="13" height="36" rx="6" fill="#d39556" stroke="#1d1446" stroke-width="5"/><circle cx="50" cy="38" r="31" fill="#ff4f5e" stroke="#1d1446" stroke-width="5"/><path d="M36 26a14 14 0 0 1 8-7" fill="none" stroke="#ff9aa3" stroke-width="5"/><path d="M61 29c0-8-5-12-11-12s-11 4-11 11c0 9 11 9 11 17" fill="none" stroke="#fff" stroke-width="8"/><circle cx="50" cy="56" r="4.5" fill="#fff"/></g></g></svg>`;
  root.AjalIcons = { ICON, catIcon, MARK, WORD };
})(typeof self !== 'undefined' ? self : this);
