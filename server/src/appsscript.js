// Client for the Google Apps Script web app in apps-script/Code.gs.
import { scriptCfg } from './config.js';

const TIMEOUT_MS = 180_000;

/** POSTs a JSON action. Apps Script answers /exec with a 302 to the result, which fetch follows. */
export async function callScript(action, payload = {}, cfg = scriptCfg) {
  let res;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain avoids a CORS-style preflight
      body: JSON.stringify({ ...payload, action, secret: cfg.secret }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`Apps Script request failed: ${e.message}`);
  }
  const text = await res.text();
  let out;
  try { out = JSON.parse(text); } catch {
    throw new Error(`Apps Script returned an unexpected response (HTTP ${res.status}). Check the deployment is "Anyone" access and the URL ends in /exec.`);
  }
  if (!out.ok) throw new Error(`Apps Script: ${out.error || 'unknown error'}`);
  return out;
}
