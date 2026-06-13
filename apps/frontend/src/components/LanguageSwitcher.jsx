import { useTranslation } from 'react-i18next';

/**
 * LanguageSwitcher — dropdown to select between Spanish and English.
 * Shows flag + language code. Compact enough to sit next to page titles.
 */
export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const currentLang = i18n.language?.startsWith('es') ? 'es' : 'en';

  const handleChange = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <select
      value={currentLang}
      onChange={handleChange}
      className="cursor-pointer rounded-lg border border-border bg-white px-2 py-1 text-xs font-semibold text-text-muted transition-all duration-200 hover:bg-border/30 focus:outline-none focus:ring-2 focus:ring-secondary/30 sm:px-2.5 sm:py-1.5"
      aria-label="Select language"
    >
      <option value="es">🇦🇷 ES</option>
      <option value="en">🇺🇸 EN</option>
    </select>
  );
}
