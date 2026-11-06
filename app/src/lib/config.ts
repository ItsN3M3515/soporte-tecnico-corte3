import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * URL del backend.
 * 1. Si existe EXPO_PUBLIC_API_URL (archivo .env), se usa esa. El valor `mismo-origen`
 *    lo usa la imagen web de Docker: nginx sirve la app y pasa /api y /socket.io al backend.
 * 2. En el celular con Expo Go se toma la IP del computador que corre `expo start`
 *    (la misma máquina donde corre el backend) y se usa el puerto 3000.
 * 3. En el navegador, el mismo host de la página.
 * En la pantalla de inicio de sesión se puede cambiar a mano.
 */
export function urlPorDefecto(): string {
  if (process.env.EXPO_PUBLIC_API_URL === 'mismo-origen' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}
