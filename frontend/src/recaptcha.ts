import { API_BASE_URL } from "./api";

declare global {
  interface Window {
    grecaptcha?: {
      ready(callback: () => void): void;
      execute(siteKey: string, options: { action: string }): Promise<string>;
    };
  }
}

type SecurityConfig = { enabled: boolean; site_key?: string | null };

let configPromise: Promise<SecurityConfig> | null = null;
let scriptPromise: Promise<void> | null = null;

function securityConfig(): Promise<SecurityConfig> {
  if (!configPromise) {
    configPromise = fetch(`${API_BASE_URL}/api/auth/security-config`)
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar la protección anti-bots.");
        return response.json() as Promise<SecurityConfig>;
      });
  }
  return configPromise;
}

function loadScript(siteKey: string): Promise<void> {
  if (window.grecaptcha) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("No se pudo cargar reCAPTCHA."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export async function getRecaptchaToken(action: string): Promise<string> {
  const config = await securityConfig();
  if (!config.enabled) return "";
  if (!config.site_key) throw new Error("reCAPTCHA no está configurado.");
  await loadScript(config.site_key);
  const recaptcha = window.grecaptcha;
  if (!recaptcha) throw new Error("No se pudo iniciar reCAPTCHA.");
  await new Promise<void>((resolve) => recaptcha.ready(resolve));
  return recaptcha.execute(config.site_key, { action });
}
