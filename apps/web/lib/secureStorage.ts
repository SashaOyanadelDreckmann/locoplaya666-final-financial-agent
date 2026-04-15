// Secure storage utilities
// NOTA: Idealmente user_id y user_name deben venir en httpOnly cookies desde el servidor
// Este archivo proporciona un wrapper para sessionStorage en lugar de localStorage
// para datos sensibles

const SECURE_PREFIX = '__secure_';

export const secureStorage = {
  /**
   * Almacena datos en sessionStorage (se limpia al cerrar pestaña)
   * NUNCA en localStorage
   */
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window === 'undefined') return;
      const secureKey = `${SECURE_PREFIX}${key}`;
      sessionStorage.setItem(secureKey, value);
    } catch (e) {
      console.warn(`Failed to set secure storage: ${key}`);
    }
  },

  /**
   * Obtiene datos de sessionStorage
   */
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined') return null;
      const secureKey = `${SECURE_PREFIX}${key}`;
      return sessionStorage.getItem(secureKey);
    } catch (e) {
      console.warn(`Failed to get secure storage: ${key}`);
      return null;
    }
  },

  /**
   * Elimina datos de sessionStorage
   */
  removeItem: (key: string): void => {
    try {
      if (typeof window === 'undefined') return;
      const secureKey = `${SECURE_PREFIX}${key}`;
      sessionStorage.removeItem(secureKey);
    } catch (e) {
      console.warn(`Failed to remove secure storage: ${key}`);
    }
  },

  /**
   * Limpia todo el sessionStorage (llamar al logout)
   */
  clear: (): void => {
    try {
      if (typeof window === 'undefined') return;
      const keys = Object.keys(sessionStorage);
      keys.forEach((key) => {
        if (key.startsWith(SECURE_PREFIX)) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Failed to clear secure storage');
    }
  },
};

export default secureStorage;
