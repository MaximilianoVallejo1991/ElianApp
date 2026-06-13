import { useTranslation } from 'react-i18next';

/**
 * LanguageSwitcher — toggles between Spanish (ES) and English (EN).
 * Uses localStorage to persist preference across sessions.
 */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language?.startsWith('es') ? 'es' : 'en';

  const toggleLang = () => {
    const next = currentLang === 'es' ? 'en' : 'es';
    i18n.changeLanguage(next);
  };

  return (
    <button
      type="button"
      onClick={toggleLang}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-text-muted transition-all duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30"
      aria-label={`Switch language to ${currentLang === 'es' ? 'English' : 'Español'}`}
    >
      {currentLang === 'es' ? (
        <>
          <span className="text-base leading-none" role="img" aria-label="English">🇺🇸</span>
          EN
        </>
      ) : (
        <>
          <span className="text-base leading-none" role="img" aria-label="Español">🇦🇷</span>
          ES
        </>
      )}
    </button>
  );
}
