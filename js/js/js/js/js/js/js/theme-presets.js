/* ==========================================================
   SaaS Multi-Tenant Engine — js/theme-presets.js
   Version: 4.0.0 (Lightweight Design Tokens & Preset Presets)
   ========================================================== */

export const THEME_PRESETS = {
  // القالب الافتراضي الكلاسيكي
  template_default: {
    id: 'template_default',
    name: 'القالب الافتراضي الكلاسيكي',
    tokens: {
      '--radius-lg': '20px',
      '--radius-md': '16px',
      '--radius-sm': '12px',
      '--shadow-soft': '0 4px 20px rgba(0, 0, 0, 0.05)',
      '--shadow-hover': '0 10px 26px rgba(0, 0, 0, 0.12)'
    },
    cardVariant: 'classic',
    heroVariant: 'hybrid-model',
    badgeStyle: 'gradient-pill'
  },

  // القالب الوردي العصري الناعم
  template_a: {
    id: 'template_a',
    name: 'القالب العصري الناعم (Soft Aesthetic)',
    tokens: {
      '--radius-lg': '24px',
      '--radius-md': '18px',
      '--radius-sm': '12px',
      '--shadow-soft': '0 8px 25px rgba(232, 93, 138, 0.08)',
      '--shadow-hover': '0 12px 30px rgba(232, 93, 138, 0.16)'
    },
    cardVariant: 'modern-soft',
    heroVariant: 'badge-pill',
    badgeStyle: 'soft-pill'
  },

  // القالب الطبي السريري الأزرق
  template_b: {
    id: 'template_b',
    name: 'القالب الطبي الحديث (Clinical Blue Pro)',
    tokens: {
      '--radius-lg': '12px',
      '--radius-md': '8px',
      '--radius-sm': '6px',
      '--surface': '#F0F9FF',
      '--surface-hover': '#E0F2FE',
      '--line': '#BAE6FD',
      '--shadow-soft': '0 2px 10px rgba(2, 132, 199, 0.08)',
      '--shadow-hover': '0 6px 20px rgba(2, 132, 199, 0.14)'
    },
    cardVariant: 'clinical-sharp',
    heroVariant: 'banner-clean',
    badgeStyle: 'clinical-box'
  }
};
