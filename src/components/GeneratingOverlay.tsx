import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ParticleField } from "./ParticleField";
import { LOADING_STEPS } from "./loadingSteps";

interface GeneratingOverlayProps {
  activeStep: number;
  hint?: string | null;
  themeColor?: string;
}

const MagicCircle: React.FC<{ color: string }> = ({ color }) => (
  <div className="relative w-56 h-56 md:w-72 md:h-72">
    {/* 外环 */}
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-dashed opacity-40"
      style={{ borderColor: color }}
      animate={{ rotate: 360 }}
      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
    />
    {/* 符文环 */}
    <motion.div
      className="absolute inset-3 rounded-full border opacity-30"
      style={{ borderColor: color }}
      animate={{ rotate: -360 }}
      transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
    >
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            backgroundColor: color,
            top: "50%",
            left: "50%",
            transform: `rotate(${i * 45}deg) translateY(-68px)`,
            transformOrigin: "center",
          }}
        />
      ))}
    </motion.div>
    {/* 内三角 */}
    <motion.div
      className="absolute inset-10 rounded-full border-2 opacity-25"
      style={{ borderColor: color }}
      animate={{ rotate: 360 }}
      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
    />
    {/* 脉冲核心 */}
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="w-24 h-24 rounded-full blur-2xl"
        style={{ backgroundColor: color, opacity: 0.25 }}
      />
    </motion.div>
    {/* 中心卡片虚影 */}
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      animate={{ scale: [0.95, 1.02, 0.95], opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <div
        className="w-28 h-40 md:w-36 md:h-52 rounded-xl border-2 flex items-center justify-center"
        style={{ borderColor: `${color}88` }}
      >
        <Sparkles size={36} style={{ color }} />
      </div>
    </motion.div>
  </div>
);

export const GeneratingOverlay: React.FC<GeneratingOverlayProps> = ({
  activeStep,
  hint,
  themeColor = "#FFD700",
}) => {
  const CurrentIcon = LOADING_STEPS[activeStep]?.icon || Sparkles;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 背景 */}
      <motion.div
        className="absolute inset-0 bg-black/92"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      {/* 环境光 */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[140px] opacity-30 pointer-events-none"
        style={{ backgroundColor: themeColor }}
      />

      {/* 粒子 */}
      <ParticleField
        count={40}
        colors={[themeColor, "#FFD700", "#ffffff"]}
      />

      {/* 主体内容 */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-md w-full">
        {/* 魔法阵 */}
        <div className="mb-8">
          <MagicCircle color={themeColor} />
        </div>

        {/* 当前步骤标题 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={hint || activeStep}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center"
          >
            <div
              className="flex items-center gap-3 text-2xl md:text-3xl font-black tracking-widest font-display mb-2"
              style={{ color: themeColor, textShadow: `0 0 20px ${themeColor}88` }}
            >
              <CurrentIcon size={28} className="animate-pulse" />
              {hint || LOADING_STEPS[activeStep]?.text}
            </div>
            {!hint && (
              <div className="text-sm text-[#8a8d91]">
                {LOADING_STEPS[activeStep]?.detail}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 进度条 */}
        <div className="w-full mt-6 mb-8">
          <div className="h-1.5 w-full rounded-full bg-[#1F2833] overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${themeColor}88, ${themeColor})`,
                boxShadow: `0 0 12px ${themeColor}`,
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${((activeStep + 1) / LOADING_STEPS.length) * 100}%`,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#8a8d91] mt-2 tracking-wider">
            <span>0%</span>
            <span>{Math.round(((activeStep + 1) / LOADING_STEPS.length) * 100)}%</span>
          </div>
        </div>

        {/* 步骤列表 */}
        <div className="grid grid-cols-5 gap-2 w-full">
          {LOADING_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === activeStep;
            const isDone = idx < activeStep;
            return (
              <motion.div
                key={idx}
                className="flex flex-col items-center gap-1.5"
                animate={{
                  opacity: isActive || isDone ? 1 : 0.35,
                  scale: isActive ? 1.1 : 1,
                }}
                transition={{ duration: 0.3 }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center border"
                  style={{
                    borderColor: isActive || isDone ? themeColor : "#4b5563",
                    background:
                      isActive || isDone
                        ? `radial-gradient(circle at 30% 30%, ${themeColor}33, transparent 70%)`
                        : "#1F2833",
                    boxShadow:
                      isActive ? `0 0 12px ${themeColor}66` : "none",
                  }}
                >
                  <Icon
                    size={14}
                    style={{ color: isActive || isDone ? themeColor : "#6b7280" }}
                  />
                </div>
                <span
                  className="text-[8px] md:text-[9px] text-center leading-tight"
                  style={{ color: isActive || isDone ? themeColor : "#6b7280" }}
                >
                  {step.text}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <motion.div
          className="mt-10 text-[10px] text-[#6b7280] tracking-widest"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          词灵正在回应你的描述，请勿离开
        </motion.div>
      </div>
    </motion.div>
  );
};
