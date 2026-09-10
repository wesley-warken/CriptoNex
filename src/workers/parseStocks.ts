import { parseNasdaqTsv } from '@/services/universeTypes';

self.onmessage = (ev: MessageEvent<{ text: string; fallbackExchange: string }>) => {
  const { text, fallbackExchange } = ev.data;
  const rows = parseNasdaqTsv(text, fallbackExchange);
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage(rows);
};

export {};
