/**
 * Web Worker para parsear BC3 fuera del hilo principal.
 * Fichero dedicado (no se construye con .toString() en runtime) — Vite lo
 * empaqueta como worker module y resuelve sus imports correctamente.
 */
import { parseBC3 } from './bc3Parser';

self.onmessage = (e) => {
  try {
    const result = parseBC3(e.data.text);
    self.postMessage({ success: true, data: result });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};
