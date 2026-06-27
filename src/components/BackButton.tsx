import React from 'react';
import { ArrowLeft } from 'lucide-react';

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
  <button
    type="button"
    onClick={onClick}
    className={`group flex items-center gap-2 rounded-md border-2 bg-[#0B0C10]/85 px-5 py-3 text-sm font-black font-display tracking-[0.22em] backdrop-blur-sm transition-all hover:text-[#0B0C10] ${className}`}
    style={{
      borderColor: color,
      color,
      boxShadow: `0 0 18px ${color}66, inset 0 0 18px ${color}14`,
    }}
    onMouseEnter={(event) => {
      event.currentTarget.style.backgroundColor = color;
      event.currentTarget.style.color = '#0B0C10';
      event.currentTarget.style.boxShadow = `0 0 26px ${color}aa`;
    }}
    onMouseLeave={(event) => {
      event.currentTarget.style.backgroundColor = 'rgba(11,12,16,0.85)';
      event.currentTarget.style.color = color;
      event.currentTarget.style.boxShadow = `0 0 18px ${color}66, inset 0 0 18px ${color}14`;
    }}
  >
    <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" />
    {label}
  </button>
);
