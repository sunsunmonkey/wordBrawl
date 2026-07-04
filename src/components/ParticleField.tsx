import React, { useMemo } from "react";

interface ParticleFieldProps {
  count?: number;
  colors?: string[];
  variant?: "spark" | "drift";
}

export const ParticleField: React.FC<ParticleFieldProps> = ({
  count = 30,
  colors = ["#66FCF1", "#FF003C", "#FFD700"],
  variant = "spark",
}) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      const size = Math.random() * 3 + 1;
      const duration = Math.random() * 8 + 6;
      const delay = Math.random() * 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      return { i, left, top, size, duration, delay, color };
    });
  }, [count, colors]);

  if (variant === "drift") {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {particles.map((p) => (
          <div
            key={p.i}
            className="absolute rounded-full drift-particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size + 1}px`,
              height: `${p.size + 1}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size * 6}px ${p.color}, 0 0 ${p.size * 12}px ${p.color}55`,
              animationDuration: `${p.duration + 4}s`,
              animationDelay: `${p.delay}s`,
              opacity: 0.85,
            }}
          />
        ))}
        <style>{`
          @keyframes drift-float {
            0% { transform: translate(0, 0) scale(1); opacity: 0; }
            15% { opacity: 0.9; }
            50% { transform: translate(20px, -30px) scale(1.15); opacity: 1; }
            85% { opacity: 0.7; }
            100% { transform: translate(-15px, 20px) scale(0.95); opacity: 0; }
          }
          .drift-particle {
            animation-name: drift-float;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <div
          key={p.i}
          className="absolute spark-particle rounded-full"
          style={{
            left: `${p.left}%`,
            bottom: "-10px",
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};
