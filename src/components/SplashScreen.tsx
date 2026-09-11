/**
 * SplashScreen — tela de entrada CriptoNex (estilo fintech premium / terminal).
 *
 * COMO CONECTAR AO CARREGAMENTO REAL (Zustand/IndexedDB):
 * 1. Uso simples (demo, 2.5s e sai):
 *      const [boot, setBoot] = useState(true);
 *      <AnimatePresence>{boot && <SplashScreen onDone={() => setBoot(false)} />}</AnimatePresence>
 * 2. Ligado nos dados de verdade:
 *      const u = useUniverseCrypto();           // tem .done / .error
 *      const [minOk, setMinOk] = useState(false);
 *      useEffect(() => { const t = setTimeout(() => setMinOk(true), 2500); return () => clearTimeout(t); }, []);
 *      const ready = minOk && (u.done || !!u.error);
 *      <AnimatePresence>{!ready && <SplashScreen loading={!ready} />}</AnimatePresence>
 *    (nesse modo NÃO precisa de onDone: o pai desmonta e o `exit` toca sozinho)
 * 3. Clique na splash sempre chama onDone (pular).
 */
import { useEffect, useState } from 'react';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Variants,
} from 'framer-motion';

export interface SplashScreenProps {
  /** Controlado: true = visível, false = executa a saída. Omitido = demo com timer interno. */
  loading?: boolean;
  /** Duração mínima visível em ms (padrão 2500, dentro dos 2–3s). */
  minDuration?: number;
  /** Chamado ao terminar o timer ou ao clicar (pular). */
  onDone?: () => void;
}

const BOOT_LINES = [
  'Inicializando motor de análise...',
  'Conectando aos provedores de liquidez...',
  'Sincronizando Radar Multi-Timeframe...',
  'Calibrando indicadores...',
  'Pronto.',
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14, delayChildren: 0.15 } },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

export function SplashScreen({ loading, minDuration = 2500, onDone }: SplashScreenProps) {
  const controlled = loading !== undefined;
  const reduceMotion = useReducedMotion();
  const [line, setLine] = useState(0);

  // Timer demo (só no modo não-controlado)
  useEffect(() => {
    if (controlled) return;
    const t = setTimeout(() => onDone?.(), reduceMotion ? 100 : minDuration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);

  // Texto de boot: troca a cada 400ms até "Pronto."
  useEffect(() => {
    if (reduceMotion) {
      setLine(BOOT_LINES.length - 1);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const i = Math.min(Math.floor((Date.now() - startedAt) / 400), BOOT_LINES.length - 1);
      setLine(i);
      if (i >= BOOT_LINES.length - 1) clearInterval(id);
    }, 400);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // Barra de progresso 0 → 100% no tempo da splash
  const progress = useMotionValue(0);
  const pct = useTransform(progress, (v) => `${Math.round(v)}%`);
  useEffect(() => {
    const controls = animate(progress, 100, { duration: reduceMotion ? 0.1 : minDuration / 1000, ease: 'easeInOut' });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDuration, reduceMotion]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#050505]"
      onClick={() => onDone?.()}
      title="Clique para pular"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Fundo: grid financeiro à deriva + pulsos de radar + brilho radial */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.055) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: 'inherit' }}
          animate={{ backgroundPosition: ['0px 0px', '44px 44px'] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/20"
          initial={reduceMotion ? { opacity: 0.25 } : { scale: 0.5, opacity: 0.5 }}
          animate={reduceMotion ? {} : { scale: [0.5, 1.7], opacity: [0.5, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, delay: i * 1.3, ease: 'easeOut' }}
        />
      ))}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.14) 0%, rgba(0,230,118,0.07) 40%, transparent 70%)' }}
      />

      {/* Núcleo */}
      <motion.div variants={container} initial="hidden" animate="show" className="relative flex w-full max-w-md flex-col items-center px-6">
        {/* Pulso desenhado */}
        <motion.svg
          variants={fadeUp}
          viewBox="0 0 320 84"
          className="h-20 w-72 md:h-24 md:w-80"
          fill="none"
          role="img"
          aria-label="Pulso CriptoNex"
        >
          <motion.path
            d="M4 44 L58 44 L72 44 L84 16 L96 66 L108 44 L156 44 L170 44 L182 26 L194 58 L206 44 L252 44 L264 44 L276 30 L288 52 L300 44 L316 44"
            stroke="#00e676"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.28"
            style={{ filter: 'blur(5px)' }}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduceMotion ? 0.1 : 1.4, ease: 'easeInOut', delay: 0.2 }}
          />
          <motion.path
            d="M4 44 L58 44 L72 44 L84 16 L96 66 L108 44 L156 44 L170 44 L182 26 L194 58 L206 44 L252 44 L264 44 L276 30 L288 52 L300 44 L316 44"
            stroke="#22d3ee"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduceMotion ? 0.1 : 1.4, ease: 'easeInOut', delay: 0.2 }}
          />
        </motion.svg>

        {/* Nome com micro-glitch de estabilização */}
        <motion.h1
          variants={fadeUp}
          animate={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, x: [0, 0, -2, 2, -1, 0] }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-2 font-mono text-4xl font-bold tracking-[0.18em] text-white md:text-5xl"
        >
          CRIPTO<span className="text-cyan-300">NEX</span>
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-slate-400">
          terminal local
        </motion.p>

        {/* Barra de progresso + equalizador */}
        <motion.div variants={fadeUp} className="mt-8 w-full max-w-xs">
          <div className="flex items-end justify-between">
            <div className="flex h-5 items-end gap-1" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <motion.span
                  key={i}
                  className="w-1 rounded-full bg-gradient-to-t from-cyan-400 to-emerald-300"
                  style={{ transformOrigin: 'bottom' }}
                  animate={reduceMotion ? { scaleY: 0.5 } : { scaleY: [0.2, 1, 0.35, 0.85, 0.2] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <motion.span className="font-mono text-xs tabular-nums text-cyan-200">{pct}</motion.span>
          </div>
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full"
              style={{ width: progress, background: 'linear-gradient(90deg, #22d3ee, #00e676)', boxShadow: '0 0 12px rgba(34,211,238,0.8)' }}
            />
          </div>
          <div className="mt-3 h-4 text-center font-mono text-[11px] text-slate-400">
            <AnimatePresence mode="wait">
              <motion.span
                key={line}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="inline-block"
              >
                {BOOT_LINES[line]}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
