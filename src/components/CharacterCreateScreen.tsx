import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { generateCharacter, generateCharacterImage, preloadImage, probeImage, AIConfig } from '../utils/ai';
import { getFallbackAvatarUrl, presetCharacters } from '../data/presetCharacters';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Heart, Brain, Sparkles, ImageIcon, Flame, Store, Shield, Gauge, ChevronDown } from 'lucide-react';
import { ParticleField } from './ParticleField';

const LOADING_STEPS = [
  { icon: Brain, text: '正在解析灵魂数据...' },
  { icon: Zap, text: '注入战斗参数...' },
  { icon: Sparkles, text: '生成专属技能体系...' },
  { icon: Flame, text: '凝聚大招能量...' },
  { icon: ImageIcon, text: '召唤实体形象...' },
];

const tryLoadRemoteAvatar = async (generator: () => Promise<string>): Promise<string | null> => {
  try {
    const url = await generator();
    if (!url) return null;
    const result = await probeImage(url, 10000);
    if (result.ok) return url;
  } catch {
    // Local fallback stays in place.
  }
  return null;
};

export const CharacterCreateScreen: React.FC = () => {
  const { phase, apiKey, baseUrl, model, apiMode, setPlayer1, setPlayer2, setPhase, player1 } = useGameStore();
  const cfg: AIConfig = { apiKey, baseUrl, model, apiMode };
  const isPlayer1 = phase === 'PLAYER1_CREATE';
  const playerName = isPlayer1 ? 'PLAYER 1' : 'PLAYER 2';
  const themeColor = isPlayer1 ? '#66FCF1' : '#FF003C';
  const themeColorHex = isPlayer1 ? '102, 252, 241' : '255, 0, 60';

  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);
  const [avatarHint, setAvatarHint] = useState<string | null>(null);
  const [selectingPreset, setSelectingPreset] = useState<string | null>(null);
  const [isMarketOpen, setIsMarketOpen] = useState(false);

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
    setAvatarHint(null);
    setIsGenerating(true);
    const interval = cycleLoadingSteps();
    const player: 1 | 2 = isPlayer1 ? 1 : 2;

    try {
      const charData = await generateCharacter(cfg, description);
      const ultimateSkill = charData.skills.find((s) => s.isUltimate || s.type === 'ultimate');
      const fallbackAvatarUrl = getFallbackAvatarUrl({
        name: charData.name,
        imagePrompt: charData.imagePrompt,
        description,
        ultimateType: ultimateSkill?.ultimateType,
        player,
      });

      setAvatarHint('正在尝试生成头像...');
      const avatarUrl = await tryLoadRemoteAvatar(() => generateCharacterImage(cfg, charData.imagePrompt, player));
      charData.imageUrl = avatarUrl || fallbackAvatarUrl;

      if (isPlayer1) {
        setPlayer1(charData);
        setPhase('PLAYER2_CREATE');
        setDescription('');
      } else {
        setPlayer2(charData);
        setPhase('BATTLE_ARENA');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '生成失败，请检查 API Key 或网络连接');
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
      setAvatarHint(null);
    }
  };

  // 选择预设角色：跳过 LLM 生成，仅预加载已预生成的图片
  const handleSelectPreset = async (preset: typeof presetCharacters[number]) => {
    setSelectingPreset(preset.name);
    setError('');

    try {
      // 并行预加载头像和大招图片，确保进入下一阶段时图片已就绪
      const ultimateSkill = preset.skills.find((s) => s.isUltimate || s.type === 'ultimate');
      await Promise.all([
        preset.imageUrl ? preloadImage(preset.imageUrl, 30000) : Promise.resolve(false),
        ultimateSkill?.imageUrl ? preloadImage(ultimateSkill.imageUrl, 30000) : Promise.resolve(false),
      ]);

      // 深拷贝一份，重置运行时状态，避免污染预设数据
      const charData: typeof preset = JSON.parse(JSON.stringify(preset));
      charData.hp = charData.maxHp;
      charData.ultimateCharge = 0;
      charData.attackBuff = 0;
      charData.defenseBuff = 0;
      charData.buffTurnsLeft = 0;

      if (isPlayer1) {
        setPlayer1(charData);
        setPhase('PLAYER2_CREATE');
      } else {
        setPlayer2(charData);
        setPhase('BATTLE_ARENA');
      }
    } catch {
      // 即使预加载失败也继续，图片会在后续阶段懒加载
      const charData: typeof preset = JSON.parse(JSON.stringify(preset));
      charData.hp = charData.maxHp;
      charData.ultimateCharge = 0;
      charData.attackBuff = 0;
      charData.defenseBuff = 0;
      charData.buffTurnsLeft = 0;

      if (isPlayer1) {
        setPlayer1(charData);
        setPhase('PLAYER2_CREATE');
      } else {
        setPlayer2(charData);
        setPhase('BATTLE_ARENA');
      }
    } finally {
      setSelectingPreset(null);
    }
  };

  const StepIcon = LOADING_STEPS[loadingStep].icon;

  const featuredNames = new Set(['唐三', '孙悟空', '奥特曼', '钢铁侠', '梅西']);
  const featuredPresets = presetCharacters.filter((p) => featuredNames.has(p.name));
  const morePresets = presetCharacters.filter((p) => !featuredNames.has(p.name));

  const renderPresetGrid = (items: typeof presetCharacters) => (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {items.map((preset) => {
        const isSelecting = selectingPreset === preset.name;
        const isDisabled = isGenerating || !!selectingPreset;
        return (
          <motion.button
            key={preset.name}
            onClick={() => handleSelectPreset(preset)}
            disabled={isDisabled}
            whileHover={!isDisabled ? { scale: 1.04, y: -2 } : {}}
            whileTap={!isDisabled ? { scale: 0.97 } : {}}
            className="relative group text-left rounded-lg overflow-hidden border-2 transition-all disabled:opacity-50"
            style={{
              borderColor: `rgba(${themeColorHex}, 0.3)`,
              backgroundColor: 'rgba(11, 12, 16, 0.8)',
            }}
          >
            {/* 头像 */}
            <div className="relative aspect-square overflow-hidden bg-[#1F2833]">
              {preset.imageUrl ? (
                <img
                  src={preset.imageUrl}
                  alt={preset.name}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-black font-display" style={{ color: themeColor }}>
                  {preset.name[0]}
                </div>
              )}
              {/* 选中加载遮罩 */}
              {isSelecting && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-transparent rounded-full"
                    style={{ borderTopColor: themeColor }}
                  />
                </div>
              )}
              {/* 名称条 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-1.5">
                <div className="text-[10px] font-bold font-display truncate" style={{ color: themeColor }}>
                  {preset.name}
                </div>
              </div>
            </div>
            {/* 数值 */}
            <div className="p-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
              <span className="flex items-center gap-1 text-[#C5C6C7]">
                <Heart size={8} className="text-pink-400" /> {preset.hp}
              </span>
              <span className="flex items-center gap-1 text-[#C5C6C7]">
                <Zap size={8} className="text-yellow-400" /> {preset.attack}
              </span>
              <span className="flex items-center gap-1 text-[#C5C6C7]">
                <Shield size={8} className="text-blue-400" /> {preset.defense}
              </span>
              <span className="flex items-center gap-1 text-[#C5C6C7]">
                <Gauge size={8} className="text-green-400" /> {preset.speed}
              </span>
            </div>
          </motion.button>
        );
      })}
    </div>
  );

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
                  key={avatarHint || loadingStep}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <StepIcon className="animate-spin" size={18} />
                  {avatarHint || LOADING_STEPS[loadingStep].text}
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
            <p className="text-sm text-[#8a8d91] mb-3 tracking-wider">▸ 已就绪的对手</p>
            <div className="flex items-center gap-5 bg-[#0B0C10]/80 p-4 rounded-lg border-2 border-[#66FCF1]/50 relative overflow-hidden">
              {player1.imageUrl ? (
                <img src={player1.imageUrl} alt="P1" className="w-20 h-20 rounded-lg object-cover border-2 border-[#66FCF1]" />
              ) : (
                <div className="w-20 h-20 bg-[#1F2833] rounded-lg border-2 border-[#66FCF1] flex items-center justify-center text-2xl font-black text-[#66FCF1] font-display">
                  {player1.name?.[0] || 'P'}
                </div>
              )}
              <div className="flex-1">
                <div className="text-lg font-bold text-[#66FCF1] font-display">{player1.name}</div>
                <div className="flex gap-4 text-sm text-[#8a8d91] mt-2">
                  <span className="flex items-center gap-1"><Heart size={14} className="text-pink-400"/> {player1.hp}</span>
                  <span className="flex items-center gap-1"><Zap size={14} className="text-yellow-400"/> {player1.attack}</span>
                </div>
              </div>
              <div className="text-xs text-[#66FCF1] tracking-wider animate-pulse">READY</div>
            </div>
          </motion.div>
        )}

        {/* 角色市场：预设角色，可直接选择跳过生成 */}
        <div className="mt-8 pt-6 border-t" style={{ borderColor: `rgba(${themeColorHex}, 0.2)` }}>
          <button
            type="button"
            onClick={() => setIsMarketOpen((v) => !v)}
            className="w-full flex items-center gap-2 mb-3 group"
            aria-expanded={isMarketOpen}
          >
            <Store size={14} style={{ color: themeColor }} />
            <h3 className="text-xs font-bold tracking-wider" style={{ color: themeColor }}>
              角色市场 · PRESET CHARACTERS
            </h3>
            <span className="text-[9px] text-[#8a8d91] ml-auto">一键选择 · 免生成</span>
            <motion.div
              animate={{ rotate: isMarketOpen ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              style={{ color: themeColor }}
            >
              <ChevronDown size={14} />
            </motion.div>
          </button>
          {/* 第一行：推荐角色 */}
          {renderPresetGrid(featuredPresets)}

          {/* 展开后：其余角色 */}
          <AnimatePresence initial={false}>
            {isMarketOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="mt-2">
                  {renderPresetGrid(morePresets)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
