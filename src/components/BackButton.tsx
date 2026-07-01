import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  color?: string;
  className?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label = '返回上一页',
  color = '#FFD700',
  className = '',
}) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileHover={{ scale: 1.05, y: -2 }}
    whileTap={{ scale: 0.95 }}
    title={label}
    aria-label={label}
    className={`group flex items-center justify-center rounded-lg border bg-[#1F2833]/70 p-2.5 backdrop-blur-sm transition-all ${className}`}
    style={{
      borderColor: `${color}66`,
      color: color,
      boxShadow: `0 0 14px ${color}22`,
    }}
    onMouseEnter={(event) => {
      event.currentTarget.style.backgroundColor = `${color}22`;
      event.currentTarget.style.boxShadow = `0 0 20px ${color}44`;
    }}
    onMouseLeave={(event) => {
      event.currentTarget.style.backgroundColor = 'rgba(31,40,51,0.7)';
      event.currentTarget.style.boxShadow = `0 0 14px ${color}22`;
    }}
  >
    <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" />
  </motion.button>
);
