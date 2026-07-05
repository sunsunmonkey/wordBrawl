import React from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";

interface CharacterAvatarProps {
  imageUrl?: string | null;
  name: string;
  themeColor?: string;
  className?: string;
  iconSize?: number;
}

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  imageUrl,
  name,
  themeColor = "#FFD700",
  className = "w-full h-full",
  iconSize = 28,
}) => {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={`${className} object-cover`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${className} relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#1F2833] to-[#0B0C10]`}
      aria-label={name}
    >
      {/* 扫描线 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.05) 2px, rgba(255,255,255,0.05) 4px)",
        }}
      />

      {/* 外环 */}
      <div
        className="absolute rounded-full border"
        style={{
          width: "62%",
          height: "62%",
          borderColor: `${themeColor}22`,
          boxShadow: `inset 0 0 14px ${themeColor}18`,
        }}
      />

      {/* 旋转虚线环 */}
      <motion.div
        className="absolute rounded-full border border-dashed"
        style={{
          width: "72%",
          height: "72%",
          borderColor: `${themeColor}44`,
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />

      {/* 中心图标 */}
      <User
        size={iconSize}
        strokeWidth={1.5}
        style={{
          color: themeColor,
          filter: `drop-shadow(0 0 6px ${themeColor}aa)`,
        }}
      />
    </div>
  );
};
