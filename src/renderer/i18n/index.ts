import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'

const guess = (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: guess,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false
})

export default i18n
