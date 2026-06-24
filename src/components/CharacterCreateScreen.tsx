import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { generateCharacter, generateCharacterImage, AIConfig } from '../utils/ai';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Heart, Brain, Sparkles, ImageIcon } from 'lucide-react';
import { ParticleField } from './ParticleField';

const LOADING_STEPS = [
  { icon: Brain, text: '正在解析灵魂数据...' },
  { icon: Zap, text: '注入战斗参数...' },
  { icon: Sparkles, text: '生成专属技能...' },
  { icon: ImageIcon, text: '召唤实体形象...' },
  { icon: ImageIcon, text: '渲染像素粒子，请稍候...' },
];

const preloadImage = (url: string, timeoutMs = 25000): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), timeoutMs);
  });
};

const generateImageWithRetry = async (
  cfg: AIConfig,
  prompt: string,
  onAttempt?: (attempt: number) => void,
  maxAttempts = 3,
): Promise<string | null> => {
  for (let i = 1; i <= maxAttempts; i++) {
    onAttempt?.(i);
    try {
      const url = await generateCharacterImage(cfg, prompt);
      if (!url) continue;
      const ok = await preloadImage(url);
      if (ok) return url;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 600 * i));
  }
  return null;
};

export const CharacterCreateScreen: React.FC = () => {
  const { phase, apiKey, baseUrl, model, setPlayer1, setPlayer2, setPhase, player1 } = useGameStore();
  const cfg: AIConfig = { apiKey, baseUrl, model };
  const isPlayer1 = phase === 'PLAYER1_CREATE';
  const playerName = isPlayer1 ? 'PLAYER 1' : 'PLAYER 2';
  const themeColor = isPlayer1 ? '#66FCF1' : '#FF003C';
  const themeColorHex = isPlayer1 ? '102, 252, 241' : '255, 0, 60';

  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [retryHint, setRetryHint] = useState<string | null>(null);

  const cycleLoadingSteps = () => {
    let step = 0;
    setLoadingStep(0);
    const interval = setInterval(() => {
      step = (step + 1) % LOADING_STEPS.length;
      setLoadingStep(step);
    }, 1100);
    return interval;
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('请输入角色描述！');
      return;
    }
    setError('');
    setRetryHint(null);
    setIsGenerating(true);
    const interval = cycleLoadingSteps();

    try {
      const charData = await generateCharacter(cfg, description);
      const imageUrl = await generateImageWithRetry(
        cfg,
        charData.imagePrompt,
        (attempt) => {
          if (attempt > 1) setRetryHint(`头像加载失败，正在重试 (${attempt}/3)...`);
        },
      );
      if (imageUrl) charData.imageUrl = imageUrl;

      if (isPlayer1) {
        setPlayer1(charData);
        setPhase('PLAYER2_CREATE');
        setDescription('');
      } else {
        setPlayer2(charData);
        setPhase('BATTLE_ARENA');
      }
    } catch (err: any) {
      setError(err?.message || '生成失败，请检查 API Key 或网络连接');
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
      setRetryHint(null);
    }
  };

  const StepIcon = LOADING_STEPS[loadingStep].icon;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden grid-bg">
      <ParticleField count={25} colors={[themeColor, '#FFD700']} />

      <motion.div
        animate={{ x: [0, 60, 0], y: [0, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity }}
        className="absolute top-10 right-10 w-72 h-72 rounded-full blur-[120px] z-0 opacity-40"
        style={{ backgroundColor: themeColor }}
      />

      <div 
        className="absolute inset-0 z-0 opacity-10 pointer-events-none scanlines"
        style={{
          background: `radial-gradient(circle at center, rgba(${themeColorHex}, 0.5) 0%, transparent 70%)`
        }}
      />

      <motion.div 
        key={phase}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="z-10 w-full max-w-2xl bg-[#1F2833]/80 backdrop-blur-md border-2 rounded-xl p-8 shadow-2xl relative corner-frame crt-flicker"
        style={{ 
          borderColor: themeColor,
          color: themeColor,
          boxShadow: `0 0 30px rgba(${themeColorHex}, 0.3), inset 0 0 30px rgba(${themeColorHex}, 0.05)`
        }}
      >
        <div className="flex justify-between items-center mb-8 border-b pb-4" style={{ borderColor: `rgba(${themeColorHex}, 0.2)` }}>
          <h2 
            data-text={playerName}
            className="text-3xl font-black italic tracking-widest font-display glitch-text" 
            style={{ color: themeColor }}
          >
            {playerName}
          </h2>
          <div className="flex flex-col items-end">
            <div className="text-[10px] text-[#8a8d91] tracking-widest">CREATION MODE</div>
            <div className="text-xs flex items-center gap-2 text-[#C5C6C7] mt-1">
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColor }}/>
              {isPlayer1 ? '等待 P1 输入...' : 'P1 已就绪 · 等待 P2 输入...'}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 bg-red-900/30 border border-red-500/50 text-red-400 rounded text-sm flex items-center gap-2"
            >
              <span className="text-lg">⚠</span> {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold mb-2 tracking-wider" style={{ color: themeColor }}>
              ▸ 描述你想操控的角色 (脑洞越大越好)
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isGenerating}
              placeholder="例如：一个穿着机甲的退休外星宇航员，手里拿着一把生锈的光剑，绝招是‘星际碰瓷’..."
              className="w-full bg-[#0B0C10]/80 border rounded p-4 text-[#C5C6C7] focus:outline-none transition-all resize-none font-mono"
              style={{ borderColor: `rgba(${themeColorHex}, 0.4)` }}
              onFocus={(e) => e.target.style.borderColor = themeColor}
              onBlur={(e) => e.target.style.borderColor = `rgba(${themeColorHex}, 0.4)`}
            />
            <div className="text-[10px] text-[#8a8d91] mt-1 flex justify-between">
              <span>支持 emoji · 中英混合 · 越夸张越好玩</span>
              <span>{description.length} chars</span>
            </div>
          </div>

          <motion.button
            onClick={handleGenerate}
            disabled={isGenerating}
            whileHover={!isGenerating ? { scale: 1.02 } : {}}
            whileTap={!isGenerating ? { scale: 0.98 } : {}}
            className="w-full py-4 rounded font-black tracking-[0.3em] transition-all disabled:opacity-90 flex justify-center items-center gap-3 relative overflow-hidden"
            style={{ 
              backgroundColor: isGenerating ? `rgba(${themeColorHex}, 0.05)` : `rgba(${themeColorHex}, 0.1)`,
              border: `2px solid ${themeColor}`,
              color: themeColor,
              boxShadow: isGenerating ? 'none' : `0 0 20px rgba(${themeColorHex}, 0.4)`
            }}
          >
            {isGenerating ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={retryHint || loadingStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <StepIcon className="animate-spin" size={18} />
                  {retryHint || LOADING_STEPS[loadingStep].text}
                </motion.div>
              </AnimatePresence>
            ) : (
              <>
                <Sparkles size={18} />
                MATERIALIZE CHARACTER
                <Sparkles size={18} />
              </>
            )}
            {/* Animated scan-bar overlay during loading */}
            {isGenerating && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                style={{ background: `linear-gradient(90deg, transparent, rgba(${themeColorHex}, 0.4), transparent)` }}
              />
            )}
          </motion.button>
        </div>

        {!isPlayer1 && player1 && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 pt-6 border-t border-[#45A29E]/20"
          >
            <p className="text-xs text-[#8a8d91] mb-2 tracking-wider">▸ 已就绪的对手</p>
            <div className="flex items-center gap-4 bg-[#0B0C10]/80 p-3 rounded border border-[#66FCF1]/40 relative overflow-hidden">
              {player1.imageUrl ? (
                <img src={player1.imageUrl} alt="P1" className="w-14 h-14 rounded object-cover border-2 border-[#66FCF1]" />
              ) : (
                <div className="w-14 h-14 bg-[#1F2833] rounded border-2 border-[#66FCF1] flex items-center justify-center text-xl font-black text-[#66FCF1] font-display">
                  {player1.name?.[0] || 'P'}
                </div>
              )}
              <div className="flex-1">
                <div className="font-bold text-[#66FCF1] font-display">{player1.name}</div>
                <div className="flex gap-3 text-xs text-[#8a8d91] mt-1">
                  <span className="flex items-center gap-1"><Heart size={12} className="text-pink-400"/> {player1.hp}</span>
                  <span className="flex items-center gap-1"><Zap size={12} className="text-yellow-400"/> {player1.attack}</span>
                </div>
              </div>
              <div className="text-[10px] text-[#66FCF1] tracking-wider animate-pulse">READY</div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};
