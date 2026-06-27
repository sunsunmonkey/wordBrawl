import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bomb,
  Flag,
  Gamepad2,
  Gauge,
  Heart,
  Lock,
  Play,
  RotateCcw,
  Shield,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import { BackButton } from "./BackButton";
import { ParticleField } from "./ParticleField";
import { useGameStore } from "../store/useGameStore";
import {
  isRosterCharacterRecruitLocked,
  isRosterCharacterUnavailable,
  useRosterStore,
  type RosterCharacter,
} from "../store/useRosterStore";
import {
  applyTrainingXp,
  evolutionLabel,
  getNextEvolutionProgress,
  levelAscensionLabel,
  xpProgress,
} from "../utils/towerProgress";

type TrainingGame = "snake" | "minesweeper";
type TrainingStatus = "idle" | "playing" | "finished";
type Direction = "up" | "down" | "left" | "right";

interface TrainingReward {
  xp: number;
  score: number;
  beforeLevel: number;
  afterLevel: number;
  levelUps: number;
  pendingEvolution: string | null;
  triggeredSkillUnlock: boolean;
  learnedSkills: string[];
}

interface Point {
  x: number;
  y: number;
}

interface MineCell {
  hasMine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
}

const SNAKE_SIZE = 12;
const MINE_SIZE = 8;
const MINE_COUNT = 10;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const pointKey = (point: Point): string => `${point.x}:${point.y}`;

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

const randomPoint = (blocked: Point[], size = SNAKE_SIZE): Point => {
  const blockedKeys = new Set(blocked.map(pointKey));
  let point: Point = { x: 0, y: 0 };
  do {
    point = {
      x: Math.floor(Math.random() * size),
      y: Math.floor(Math.random() * size),
    };
  } while (blockedKeys.has(pointKey(point)));
  return point;
};

const buildObstacles = (snake: Point[], food: Point): Point[] => {
  const blocked = [...snake, food];
  return Array.from({ length: 10 }, () => {
    const point = randomPoint(blocked);
    blocked.push(point);
    return point;
  });
};

const initialSnake = (): Point[] => [
  { x: 5, y: 5 },
  { x: 4, y: 5 },
  { x: 3, y: 5 },
];

const emptyMineBoard = (): MineCell[] =>
  Array.from({ length: MINE_SIZE * MINE_SIZE }, () => ({
    hasMine: false,
    revealed: false,
    flagged: false,
    adjacent: 0,
  }));

const mineNeighbors = (index: number): number[] => {
  const row = Math.floor(index / MINE_SIZE);
  const col = index % MINE_SIZE;
  const neighbors: number[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= MINE_SIZE || nc < 0 || nc >= MINE_SIZE) continue;
      neighbors.push(nr * MINE_SIZE + nc);
    }
  }
  return neighbors;
};

const buildMineBoard = (safeIndex: number): MineCell[] => {
  const cells = emptyMineBoard();
  const safeZone = new Set([safeIndex, ...mineNeighbors(safeIndex)]);
  const mineIndexes = new Set<number>();
  while (mineIndexes.size < MINE_COUNT) {
    const index = Math.floor(Math.random() * cells.length);
    if (safeZone.has(index)) continue;
    mineIndexes.add(index);
  }

  mineIndexes.forEach((index) => {
    cells[index].hasMine = true;
  });

  cells.forEach((cell, index) => {
    cell.adjacent = mineNeighbors(index).filter((n) => cells[n].hasMine).length;
  });
  return cells;
};

const revealMineCell = (
  board: MineCell[],
  index: number,
): {
  board: MineCell[];
  revealedCount: number;
  hitMine: boolean;
  won: boolean;
} => {
  const next = board.map((cell) => ({ ...cell }));
  const target = next[index];
  if (!target || target.revealed || target.flagged) {
    return { board: next, revealedCount: 0, hitMine: false, won: false };
  }
  if (target.hasMine) {
    next.forEach((cell) => {
      if (cell.hasMine) cell.revealed = true;
    });
    return { board: next, revealedCount: 0, hitMine: true, won: false };
  }

  let revealedCount = 0;
  const queue = [index];
  const visited = new Set<number>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    const cell = next[current];
    if (!cell || cell.revealed || cell.flagged || cell.hasMine) continue;
    cell.revealed = true;
    revealedCount += 1;
    if (cell.adjacent === 0) {
      mineNeighbors(current).forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
  }

  const won = next.every((cell) => cell.hasMine || cell.revealed);
  return { board: next, revealedCount, hitMine: false, won };
};

const xpRewardForScore = (score: number, game: TrainingGame): number => {
  const bonus = game === "minesweeper" ? 25 : 0;
  return clamp(Math.round(45 + Math.max(0, score) * 0.48 + bonus), 35, 340);
};

export const TrainingGroundScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const roster = useRosterStore((s) => s.roster);
  const updateCharacter = useRosterStore((s) => s.updateCharacter);

  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(
    roster[0]?.rosterId ?? null,
  );
  const [activeGame, setActiveGame] = useState<TrainingGame>("snake");
  const [status, setStatus] = useState<TrainingStatus>("idle");
  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [message, setMessage] = useState("选择经典小游戏开始训练");
  const [reward, setReward] = useState<TrainingReward | null>(null);

  const [snake, setSnake] = useState<Point[]>(() => initialSnake());
  const [direction, setDirection] = useState<Direction>("right");
  const [nextDirection, setNextDirection] = useState<Direction>("right");
  const [food, setFood] = useState<Point>(() => ({ x: 8, y: 5 }));
  const [obstacles, setObstacles] = useState<Point[]>([]);

  const [mineBoard, setMineBoard] = useState<MineCell[]>(() =>
    emptyMineBoard(),
  );
  const [mineStarted, setMineStarted] = useState(false);
  const [flagMode, setFlagMode] = useState(false);

  useEffect(() => {
    if (!selectedRosterId && roster[0]) {
      setSelectedRosterId(roster[0].rosterId);
    }
  }, [roster, selectedRosterId]);

  const selected = useMemo(
    () =>
      roster.find((char) => char.rosterId === selectedRosterId) ??
      roster[0] ??
      null,
    [roster, selectedRosterId],
  );
  const selectedLocked = isRosterCharacterUnavailable(selected);

  const selectedProgress = selected
    ? xpProgress(selected.level, selected.xp)
    : null;
  const selectedEvolution = selected
    ? getNextEvolutionProgress(
        selected.level,
        selected.xp,
        selected.evolutionStage,
      )
    : null;

  const finishGame = useCallback(
    (scoreOverride?: number) => {
      if (!selected || selectedLocked || status === "finished") return;
      const finalScore = Math.max(0, Math.floor(scoreOverride ?? score));
      const xp = xpRewardForScore(finalScore, activeGame);
      const beforeLevel = selected.level;
      const xpResult = applyTrainingXp(selected, xp);
      updateCharacter(selected.rosterId, () => xpResult.character);

      const nextEvolution = getNextEvolutionProgress(
        xpResult.character.level,
        xpResult.character.xp,
        xpResult.character.evolutionStage,
      );
      setReward({
        xp,
        score: finalScore,
        beforeLevel,
        afterLevel: xpResult.character.level,
        levelUps: xpResult.events.length,
        pendingEvolution:
          nextEvolution.ready && nextEvolution.nextStage
            ? evolutionLabel(nextEvolution.nextStage)
            : null,
        triggeredSkillUnlock: xpResult.triggeredSkillUnlock,
        learnedSkills: xpResult.learnedSkills.map((skill) => skill.name),
      });
      setScore(finalScore);
      setStatus("finished");
      setTimeLeft(0);
      setMessage("训练完成，经验已结算");
    },
    [activeGame, score, selected, selectedLocked, status, updateCharacter],
  );

  const resetSnake = () => {
    const nextSnake = initialSnake();
    const nextFood = randomPoint(nextSnake);
    setSnake(nextSnake);
    setDirection("right");
    setNextDirection("right");
    setFood(nextFood);
    setObstacles(buildObstacles(nextSnake, nextFood));
  };

  const startGame = (game: TrainingGame = activeGame) => {
    if (!selected || selectedLocked) {
      setMessage("该角色暂不可用，完成后台更新后才能训练");
      return;
    }
    setActiveGame(game);
    setStatus("playing");
    setScore(0);
    setCombo(0);
    setReward(null);
    if (game === "snake") {
      resetSnake();
      setTimeLeft(60);
      setMessage("方向键或 WASD 控制，吃能量，别撞墙和障碍");
      return;
    }
    setMineBoard(emptyMineBoard());
    setMineStarted(false);
    setFlagMode(false);
    setTimeLeft(180);
    setMessage("第一格必安全，左键翻开，右键或插旗模式标雷");
  };

  useEffect(() => {
    if (status !== "playing") return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (status === "playing" && timeLeft <= 0) {
      finishGame(score);
    }
  }, [finishGame, score, status, timeLeft]);

  const setSnakeDirection = useCallback(
    (next: Direction) => {
      const opposite: Record<Direction, Direction> = {
        up: "down",
        down: "up",
        left: "right",
        right: "left",
      };
      if (opposite[next] === direction) return;
      setNextDirection(next);
    },
    [direction],
  );

  useEffect(() => {
    if (status !== "playing" || activeGame !== "snake") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowup" || key === "w") {
        event.preventDefault();
        setSnakeDirection("up");
      }
      if (key === "arrowdown" || key === "s") {
        event.preventDefault();
        setSnakeDirection("down");
      }
      if (key === "arrowleft" || key === "a") {
        event.preventDefault();
        setSnakeDirection("left");
      }
      if (key === "arrowright" || key === "d") {
        event.preventDefault();
        setSnakeDirection("right");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGame, setSnakeDirection, status]);

  useEffect(() => {
    if (status !== "playing" || activeGame !== "snake") return;
    const interval = window.setInterval(() => {
      setDirection(nextDirection);
      const head = snake[0];
      const delta: Record<Direction, Point> = {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      const nextHead = {
        x: head.x + delta[nextDirection].x,
        y: head.y + delta[nextDirection].y,
      };
      const hitWall =
        nextHead.x < 0 ||
        nextHead.x >= SNAKE_SIZE ||
        nextHead.y < 0 ||
        nextHead.y >= SNAKE_SIZE;
      const hitSelf = snake.some((part) => samePoint(part, nextHead));
      const hitObstacle = obstacles.some((part) => samePoint(part, nextHead));
      if (hitWall || hitSelf || hitObstacle) {
        setMessage("撞到了，贪吃蛇结束");
        finishGame(score);
        return;
      }

      const ateFood = samePoint(nextHead, food);
      if (ateFood) {
        const gain = 35 + Math.min(combo * 5, 60);
        const nextSnake = [nextHead, ...snake];
        const blocked = [...nextSnake, ...obstacles];
        setSnake(nextSnake);
        setFood(randomPoint(blocked));
        setScore((current) => current + gain);
        setCombo((current) => current + 1);
        setMessage(`吃到能量 +${gain}`);
        return;
      }

      setSnake([nextHead, ...snake.slice(0, -1)]);
    }, 170);
    return () => window.clearInterval(interval);
  }, [
    activeGame,
    combo,
    finishGame,
    food,
    nextDirection,
    obstacles,
    score,
    snake,
    status,
  ]);

  const handleMineCell = (index: number) => {
    if (status !== "playing" || activeGame !== "minesweeper") return;
    if (flagMode) {
      setMineBoard((current) =>
        current.map((cell, cellIndex) =>
          cellIndex === index && !cell.revealed
            ? { ...cell, flagged: !cell.flagged }
            : cell,
        ),
      );
      return;
    }

    const board = mineStarted ? mineBoard : buildMineBoard(index);
    const result = revealMineCell(board, index);
    setMineStarted(true);
    setMineBoard(result.board);

    if (result.hitMine) {
      setMessage("踩雷了，扫雷结束");
      finishGame(score);
      return;
    }

    const gain = result.revealedCount * 12;
    const nextScore = score + gain;
    setScore(nextScore);
    setMessage(
      result.revealedCount > 0
        ? `翻开 ${result.revealedCount} 格 +${gain}`
        : "这里翻不开",
    );
    if (result.won) {
      finishGame(nextScore + 220);
    }
  };

  const flagMineCell = (event: React.MouseEvent, index: number) => {
    event.preventDefault();
    if (status !== "playing" || activeGame !== "minesweeper") return;
    setMineBoard((current) =>
      current.map((cell, cellIndex) =>
        cellIndex === index && !cell.revealed
          ? { ...cell, flagged: !cell.flagged }
          : cell,
      ),
    );
  };

  const flaggedCount = mineBoard.filter((cell) => cell.flagged).length;
  const gameCards = [
    {
      id: "snake" as const,
      title: "贪吃蛇",
      subtitle: "吃能量 · 躲障碍 · 活得久",
      icon: <Zap size={22} />,
      color: "#FFD700",
    },
    {
      id: "minesweeper" as const,
      title: "扫雷",
      subtitle: "推理排雷 · 通关大奖",
      icon: <Bomb size={22} />,
      color: "#66FCF1",
    },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden grid-bg p-6">
      <ParticleField count={30} colors={["#FFD700", "#66FCF1", "#FF6B9D"]} />
      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <BackButton onClick={() => setPhase("MODE_SELECT")} color="#FFD700" />
          <div>
            <h1
              className="text-3xl font-black tracking-widest font-display"
              style={{ color: "#FFD700", textShadow: "0 0 18px #FFD700" }}
            >
              娱乐训练场
            </h1>
            <div className="mt-1 text-[10px] tracking-[0.35em] text-[#8a8d91]">
              CLASSIC MINI GAMES · XP TRAINING
            </div>
          </div>
        </div>

        {roster.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#FFD700]/40 bg-[#1F2833]/75 p-10 text-center">
            <Gamepad2 size={34} className="mx-auto mb-3 text-[#FFD700]" />
            <div className="font-black text-[#FFD700]">还没有可训练角色</div>
            <button
              type="button"
              onClick={() => setPhase("RECRUIT_CREATE")}
              className="mt-5 rounded border border-[#FFD700] px-5 py-2 text-xs font-black tracking-[0.25em] text-[#FFD700] hover:bg-[#FFD700] hover:text-[#0B0C10]"
            >
              去招募
            </button>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.35fr]">
            <section className="rounded-xl border-2 border-[#FFD700]/60 bg-[#1F2833]/75 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-black tracking-[0.3em] text-[#FFD700]">
                  选择训练角色
                </div>
                <div className="text-[10px] text-[#8a8d91]">
                  {roster.length}/24
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {roster.slice(0, 10).map((char) => (
                  <RosterPick
                    key={char.rosterId}
                    character={char}
                    selected={char.rosterId === selected?.rosterId}
                    locked={isRosterCharacterUnavailable(char)}
                    onClick={() => setSelectedRosterId(char.rosterId)}
                  />
                ))}
              </div>

              {selected && selectedProgress && (
                <div className="mt-4 rounded-lg border border-[#66FCF1]/30 bg-[#0B0C10]/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-lg bg-[#111827]">
                      {selected.imageUrl ? (
                        <img
                          src={selected.imageUrl}
                          alt={selected.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-black text-[#FFD700]">
                          {selected.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xl font-black text-[#FFD700]">
                        {selected.name}
                      </div>
                      <div className="text-xs text-[#C5C6C7]">
                        Lv.{selected.level} ·{" "}
                        {levelAscensionLabel(selected.level)} ·{" "}
                        {evolutionLabel(selected.evolutionStage)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded bg-[#1F2833]">
                    <div
                      className="h-full bg-[#FFD700]"
                      style={{
                        width: `${Math.round(selectedProgress.ratio * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-[#8a8d91]">
                    <span>
                      XP {selectedProgress.current}/{selectedProgress.need}
                    </span>
                    <span>
                      {selectedEvolution?.ready
                        ? "进化待塔战触发"
                        : selectedEvolution?.nextStage
                          ? `距${evolutionLabel(selectedEvolution.nextStage)} ${selectedEvolution.xpRemaining}XP`
                          : "最终形态"}
                    </span>
                  </div>
                  {selectedLocked && (
                    <div className="mt-3 rounded border border-[#FFD700]/35 bg-[#FFD700]/10 px-3 py-2 text-[10px] leading-relaxed text-[#FFD700]">
                      <Lock size={11} className="mr-1 inline" />
                      {isRosterCharacterRecruitLocked(selected)
                        ? selected.recruitLock?.status === "failed"
                          ? selected.recruitLock.error ||
                            "后台招募失败，请移除后重新招募。"
                          : "角色正在后台生成中，完成前暂时不能训练。"
                        : "进化图后台更新中，完成前暂时不能训练。"}
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]">
                    <Stat
                      icon={<Heart size={10} />}
                      value={selected.maxHp}
                      color="#FF6B9D"
                    />
                    <Stat
                      icon={<Zap size={10} />}
                      value={selected.attack}
                      color="#FFD700"
                    />
                    <Stat
                      icon={<Shield size={10} />}
                      value={selected.defense}
                      color="#66FCF1"
                    />
                    <Stat
                      icon={<Gauge size={10} />}
                      value={selected.speed}
                      color="#7FFF9F"
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-xl border-2 border-[#66FCF1]/55 bg-[#1F2833]/75 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                {gameCards.map((game) => {
                  const active = game.id === activeGame;
                  return (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() =>
                        status === "playing"
                          ? undefined
                          : setActiveGame(game.id)
                      }
                      className="rounded-lg border p-4 text-left transition-all"
                      style={{
                        borderColor: active ? game.color : `${game.color}55`,
                        boxShadow: active ? `0 0 18px ${game.color}40` : "none",
                        color: game.color,
                      }}
                    >
                      <div className="mb-3">{game.icon}</div>
                      <div className="font-black">{game.title}</div>
                      <div className="mt-1 text-[10px] text-[#8a8d91]">
                        {game.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-xl border border-[#66FCF1]/25 bg-[#0B0C10]/75 p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <Badge icon={<Timer size={13} />} label={`${timeLeft}s`} />
                  <Badge icon={<Trophy size={13} />} label={`${score} 分`} />
                  {activeGame === "snake" ? (
                    <Badge icon={<Zap size={13} />} label={`${combo} 连吃`} />
                  ) : (
                    <Badge
                      icon={<Flag size={13} />}
                      label={`${flaggedCount}/${MINE_COUNT} 旗`}
                    />
                  )}
                  <div className="ml-auto text-xs font-bold text-[#FFD700]">
                    {message}
                  </div>
                </div>

                {activeGame === "snake" && (
                  <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                    <div className="grid grid-cols-12 gap-1">
                      {Array.from(
                        { length: SNAKE_SIZE * SNAKE_SIZE },
                        (_, index) => {
                          const point = {
                            x: index % SNAKE_SIZE,
                            y: Math.floor(index / SNAKE_SIZE),
                          };
                          const snakeIndex = snake.findIndex((part) =>
                            samePoint(part, point),
                          );
                          const isHead = snakeIndex === 0;
                          const isBody = snakeIndex > 0;
                          const isFood = samePoint(food, point);
                          const isObstacle = obstacles.some((part) =>
                            samePoint(part, point),
                          );
                          return (
                            <div
                              key={index}
                              className="aspect-square rounded-[4px] border"
                              style={{
                                borderColor: isHead
                                  ? "#FFD700"
                                  : isBody
                                    ? "rgba(255,215,0,0.55)"
                                    : isFood
                                      ? "#66FCF1"
                                      : isObstacle
                                        ? "rgba(255,0,60,0.75)"
                                        : "rgba(102,252,241,0.12)",
                                background: isHead
                                  ? "#FFD700"
                                  : isBody
                                    ? "rgba(255,215,0,0.42)"
                                    : isFood
                                      ? "radial-gradient(circle, rgba(102,252,241,0.95), rgba(102,252,241,0.15))"
                                      : isObstacle
                                        ? "rgba(255,0,60,0.35)"
                                        : "rgba(31,40,51,0.55)",
                                boxShadow:
                                  isHead || isFood
                                    ? "0 0 14px rgba(102,252,241,0.35)"
                                    : "none",
                              }}
                            />
                          );
                        },
                      )}
                    </div>
                    <DirectionPad
                      disabled={status !== "playing"}
                      onDirection={setSnakeDirection}
                    />
                  </div>
                )}

                {activeGame === "minesweeper" && (
                  <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
                    <div className="grid grid-cols-8 gap-1.5">
                      {mineBoard.map((cell, index) => {
                        const content = cell.revealed
                          ? cell.hasMine
                            ? "雷"
                            : cell.adjacent > 0
                              ? cell.adjacent
                              : ""
                          : cell.flagged
                            ? "旗"
                            : "";
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleMineCell(index)}
                            onContextMenu={(event) =>
                              flagMineCell(event, index)
                            }
                            disabled={status !== "playing" || cell.revealed}
                            className="aspect-square rounded border text-sm font-black transition-all disabled:cursor-default"
                            style={{
                              borderColor: cell.revealed
                                ? cell.hasMine
                                  ? "rgba(255,0,60,0.85)"
                                  : "rgba(102,252,241,0.35)"
                                : cell.flagged
                                  ? "#FFD700"
                                  : "rgba(102,252,241,0.45)",
                              background: cell.revealed
                                ? cell.hasMine
                                  ? "rgba(255,0,60,0.45)"
                                  : "rgba(102,252,241,0.12)"
                                : cell.flagged
                                  ? "rgba(255,215,0,0.18)"
                                  : "rgba(31,40,51,0.82)",
                              color: cell.hasMine
                                ? "#FF6B9D"
                                : cell.flagged
                                  ? "#FFD700"
                                  : "#66FCF1",
                            }}
                          >
                            {content}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-col justify-center gap-3 text-center">
                      <button
                        type="button"
                        onClick={() => setFlagMode((current) => !current)}
                        className="rounded border px-3 py-3 text-xs font-black tracking-[0.2em]"
                        style={{
                          borderColor: flagMode
                            ? "#FFD700"
                            : "rgba(102,252,241,0.45)",
                          color: flagMode ? "#FFD700" : "#66FCF1",
                        }}
                      >
                        {flagMode ? "插旗模式 ON" : "插旗模式 OFF"}
                      </button>
                      <div className="text-[10px] leading-relaxed text-[#8a8d91]">
                        桌面端可右键插旗。第一下不会炸，清完安全格直接大奖。
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startGame(activeGame)}
                    disabled={!selected || selectedLocked}
                    className="flex items-center gap-2 rounded border-2 border-[#FFD700] px-5 py-3 text-xs font-black tracking-[0.25em] text-[#FFD700] transition-all hover:bg-[#FFD700] hover:text-[#0B0C10] disabled:opacity-40"
                  >
                    {status === "playing" ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Play size={15} />
                    )}
                    {status === "playing" ? "重开本局" : "开始训练"}
                  </button>
                  {status === "playing" && (
                    <button
                      type="button"
                      onClick={() => finishGame(score)}
                      className="rounded border border-[#8a8d91]/45 px-4 py-3 text-xs font-bold text-[#C5C6C7] hover:bg-white/5"
                    >
                      提前结算
                    </button>
                  )}
                </div>

                {reward && (
                  <div className="mt-5 rounded-lg border border-[#FFD700]/35 bg-[#FFD700]/10 p-4">
                    <div className="text-lg font-black text-[#FFD700]">
                      +{reward.xp} XP · {reward.score} 分
                    </div>
                    <div className="mt-1 text-sm text-[#C5C6C7]">
                      Lv.{reward.beforeLevel} → Lv.{reward.afterLevel}
                      {reward.levelUps > 0
                        ? `，提升 ${reward.levelUps} 级`
                        : "，经验已累积"}
                    </div>
                    {reward.pendingEvolution && (
                      <div className="mt-2 text-xs font-bold text-[#66FCF1]">
                        已达到{reward.pendingEvolution}
                        条件，下一场九层塔结算会触发形态演出。
                      </div>
                    )}
                    {reward.triggeredSkillUnlock && (
                      <div className="mt-1 text-xs text-[#8a8d91]">
                        {reward.learnedSkills.length > 0
                          ? `已领悟：${reward.learnedSkills.join("、")}`
                          : "已跨过技能领悟等级，当前技能槽已满。"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

const DirectionPad: React.FC<{
  disabled: boolean;
  onDirection: (direction: Direction) => void;
}> = ({ disabled, onDirection }) => (
  <div className="flex flex-col items-center justify-center gap-2">
    <button
      type="button"
      disabled={disabled}
      onClick={() => onDirection("up")}
      className="h-12 w-16 rounded border border-[#FFD700]/60 text-[#FFD700] disabled:opacity-30"
    >
      ↑
    </button>
    <div className="flex gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDirection("left")}
        className="h-12 w-16 rounded border border-[#FFD700]/60 text-[#FFD700] disabled:opacity-30"
      >
        ←
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDirection("down")}
        className="h-12 w-16 rounded border border-[#FFD700]/60 text-[#FFD700] disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDirection("right")}
        className="h-12 w-16 rounded border border-[#FFD700]/60 text-[#FFD700] disabled:opacity-30"
      >
        →
      </button>
    </div>
    <div className="mt-2 text-center text-[10px] leading-relaxed text-[#8a8d91]">
      WASD / 方向键也能控制
    </div>
  </div>
);

const RosterPick: React.FC<{
  character: RosterCharacter;
  selected: boolean;
  locked: boolean;
  onClick: () => void;
}> = ({ character, selected, locked, onClick }) => {
  const recruitLocked = isRosterCharacterRecruitLocked(character);
  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-lg border bg-[#0B0C10]/75 text-left transition-all"
      style={{
        borderColor: selected ? "#FFD700" : "rgba(255,215,0,0.25)",
        boxShadow: selected ? "0 0 16px rgba(255,215,0,0.35)" : "none",
      }}
    >
      <div className="relative aspect-[4/3] bg-[#111827]">
        {character.imageUrl ? (
          <img
            src={character.imageUrl}
            alt={character.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-black text-[#FFD700]">
            {character.name[0]}
          </div>
        )}
        <div className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-[#FFD700]">
          Lv.{character.level}
        </div>
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/68">
            <div className="rounded border border-[#FFD700]/60 bg-[#0B0C10]/85 px-2 py-1 text-[9px] font-black tracking-widest text-[#FFD700]">
              <Lock size={10} className="mr-1 inline" />
              {recruitLocked
                ? character.recruitLock?.status === "failed"
                  ? "失败"
                  : "招募中"
                : "进化中"}
            </div>
          </div>
        )}
      </div>
      <div className="truncate px-2 py-1.5 text-xs font-black text-[#FFD700]">
        {character.name}
      </div>
    </button>
  );
};

const Badge: React.FC<{ icon: React.ReactNode; label: string }> = ({
  icon,
  label,
}) => (
  <div className="flex items-center gap-1.5 rounded bg-[#1F2833] px-2 py-1 text-xs font-bold text-[#C5C6C7]">
    <span className="text-[#FFD700]">{icon}</span>
    {label}
  </div>
);

const Stat: React.FC<{
  icon: React.ReactNode;
  value: number;
  color: string;
}> = ({ icon, value, color }) => (
  <div className="flex items-center justify-center gap-1 rounded bg-[#1F2833]/80 px-2 py-1">
    <span style={{ color }}>{icon}</span>
    <span className="font-black" style={{ color }}>
      {value}
    </span>
  </div>
);
