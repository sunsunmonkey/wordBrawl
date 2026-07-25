import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Loader2, Sparkles, Swords, Trophy, Zap } from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSocialStore } from "../store/useSocialStore";
import type {
  SocialBattleReport,
  SocialBattleState,
} from "../store/socialTypes";
import type { BattleEvent, Skill } from "../store/useGameStore";
import { BattleEngine, ULTIMATE_THRESHOLD } from "../utils/battleEngine";
import { socialTransport } from "../utils/socialTransport";
import { CharacterAvatar } from "./CharacterAvatar";

const TURN_TIMEOUT_MS = 12_000;
const ACTION_DELAY_MS = 800;

const isUltimateSkill = (skill: Skill): boolean =>
  skill.type === "ultimate" || !!skill.isUltimate;

type Side = "host" | "guest";

export const SocialBattleScreen: React.FC = () => {
  const setPhase = useGameStore((s) => s.setPhase);
  const { playerId } = usePlayerStore();
  const {
    currentRoom,
    activeBattle,
    updateBattleState,
    sendBattleAction,
    finishBattle,
    sendBattleReport,
    setActiveBattle,
  } = useSocialStore();

  // 引擎只存在于 host 端
  const engineRef = useRef<BattleEngine | null>(null);
  const [pendingSkills, setPendingSkills] = useState<{
    host?: Skill;
    guest?: Skill;
  }>({});
  const [turnDeadline, setTurnDeadline] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const [resolvedLogs, setResolvedLogs] = useState<BattleEvent[]>([]);
  const [finished, setFinished] = useState(false);

  const battle = activeBattle ?? currentRoom?.activeBattle ?? null;

  const isHost = battle?.hostPlayerId === playerId;
  const mySide: Side | null = battle
    ? battle.hostPlayerId === playerId
      ? "host"
      : battle.guestPlayerId === playerId
        ? "guest"
        : null
    : null;

  // 心跳定时器（每秒更新进度条 + 检查超时）
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // host 初始化引擎
  useEffect(() => {
    if (!battle || !isHost || engineRef.current) return;
    if (battle.phase !== "preparing") return;
    const engine = new BattleEngine(
      battle.hostSpirit.combatSnapshot,
      battle.guestSpirit.combatSnapshot,
    );
    engineRef.current = engine;
    // 进入 fighting 状态
    const openingLogs = engine.createOpeningLogs();
    const state = engine.getState();
    const nextState: SocialBattleState = {
      ...battle,
      currentTurn: state.currentTurn,
      hostHp: state.p1.hp,
      guestHp: state.p2.hp,
      hostMaxHp: state.p1.maxHp,
      guestMaxHp: state.p2.maxHp,
      hostCharge: state.p1.ultimateCharge,
      guestCharge: state.p2.ultimateCharge,
      logs: openingLogs,
      phase: "fighting",
      updatedAt: Date.now(),
    };
    setResolvedLogs(openingLogs);
    updateBattleState(nextState);
    setTurnDeadline(Date.now() + TURN_TIMEOUT_MS);
  }, [battle, isHost, updateBattleState]);

  // host 监听客机的技能选择
  useEffect(() => {
    if (!isHost || !battle) return;
    const unsub = socialTransport.subscribe((event) => {
      if (event.kind !== "battle-action") return;
      if (event.battleId !== battle.battleId) return;
      if (event.actorPlayerId === battle.guestPlayerId) {
        const skill = battle.guestSpirit.combatSnapshot.skills.find(
          (s) => s.name === event.skillName,
        );
        if (skill) {
          setPendingSkills((prev) => ({ ...prev, guest: skill }));
        }
      } else if (event.actorPlayerId === battle.hostPlayerId) {
        const skill = battle.hostSpirit.combatSnapshot.skills.find(
          (s) => s.name === event.skillName,
        );
        if (skill) {
          setPendingSkills((prev) => ({ ...prev, host: skill }));
        }
      }
    });
    return unsub;
  }, [isHost, battle]);

  // host 在双方都选完或超时时结算回合
  useEffect(() => {
    if (!isHost || !engineRef.current || !battle) return;
    if (battle.phase !== "fighting") return;
    if (finished) return;

    const bothReady =
      Boolean(pendingSkills.host) && Boolean(pendingSkills.guest);
    const timedOut = now >= turnDeadline && turnDeadline > 0;

    if (!bothReady && !timedOut) return;

    const engine = engineRef.current;
    if (!engine) return;

    // 自动补全未选技能
    const hostSkill =
      pendingSkills.host ?? engine.chooseSkill(engine.p1, engine.p2);
    const guestSkill =
      pendingSkills.guest ?? engine.chooseSkill(engine.p2, engine.p1);

    // 速度决定先后
    const hostFirst = engine.p1.speed >= engine.p2.speed;
    const firstSide: Side = hostFirst ? "host" : "guest";
    const secondSide: Side = hostFirst ? "guest" : "host";

    void resolveTurn(
      engine,
      battle,
      firstSide,
      secondSide,
      hostSkill,
      guestSkill,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingSkills,
    now,
    turnDeadline,
    isHost,
    battle,
    finished,
    updateBattleState,
  ]);

  /** host 结算一回合 */
  const resolveTurn = async (
    engine: BattleEngine,
    current: SocialBattleState,
    firstSide: Side,
    secondSide: Side,
    hostSkill: Skill,
    guestSkill: Skill,
  ) => {
    setPendingSkills({});
    const newLogs: BattleEvent[] = [];

    const executeOnce = (side: Side, skill: Skill) => {
      if (engine.isBattleOver()) return;
      const attackerId = side === "host" ? "player1" : "player2";
      // 大招未就绪则降级为普通攻击第一招
      let actualSkill = skill;
      if (
        isUltimateSkill(skill) &&
        !engine.canUseUltimate(side === "host" ? engine.p1 : engine.p2)
      ) {
        const fallback = engine.p1.skills.find((s) => !isUltimateSkill(s));
        if (fallback) actualSkill = fallback;
      }
      const result = engine.executeSkill(attackerId, actualSkill);
      newLogs.push(result.log);
    };

    executeOnce(firstSide, firstSide === "host" ? hostSkill : guestSkill);
    // 推送中间状态
    await pushEngineState(engine, current, newLogs, false);
    await sleep(ACTION_DELAY_MS);

    executeOnce(secondSide, secondSide === "host" ? hostSkill : guestSkill);

    // 检查胜负
    let isFinished = false;
    let report: SocialBattleReport | undefined;
    if (engine.isBattleOver()) {
      const winnerSide: Side =
        engine.getWinner() === "player1" ? "host" : "guest";
      const defeatLog = engine.createDefeatLog(
        winnerSide === "host" ? "player2" : "player1",
      );
      newLogs.push(defeatLog);
      isFinished = true;
      report = buildReport(current, winnerSide, engine.currentTurn, newLogs);
    } else {
      engine.currentTurn += 1;
    }

    await pushEngineState(engine, current, newLogs, isFinished, report);

    if (isFinished && report) {
      setFinished(true);
      finishBattle(buildFinishedState(current, engine, newLogs, report));
      // 战报回群聊（短暂延迟让玩家看到结束动画）
      setTimeout(() => {
        sendBattleReport(report!);
      }, 2500);
    } else {
      setTurnDeadline(Date.now() + TURN_TIMEOUT_MS);
    }
  };

  const pushEngineState = async (
    engine: BattleEngine,
    current: SocialBattleState,
    newLogs: BattleEvent[],
    isFinished: boolean,
    report?: SocialBattleReport,
  ) => {
    const state = engine.getState();
    const mergedLogs = [...resolvedLogs, ...newLogs].slice(-30);
    setResolvedLogs(mergedLogs);
    const next: SocialBattleState = {
      ...current,
      currentTurn: state.currentTurn,
      hostHp: state.p1.hp,
      guestHp: state.p2.hp,
      hostMaxHp: state.p1.maxHp,
      guestMaxHp: state.p2.maxHp,
      hostCharge: state.p1.ultimateCharge,
      guestCharge: state.p2.ultimateCharge,
      logs: mergedLogs,
      phase: isFinished ? "finished" : "fighting",
      ...(report ? { report, winnerPlayerId: report.winnerPlayerId } : {}),
      updatedAt: Date.now(),
    };
    updateBattleState(next);
    await sleep(120);
  };

  // 处理玩家选择技能
  const handleSkillPick = (skill: Skill) => {
    if (!battle || !mySide || finished) return;
    if (isUltimateSkill(skill)) {
      const charge = mySide === "host" ? battle.hostCharge : battle.guestCharge;
      if (charge < ULTIMATE_THRESHOLD) return;
    }
    if (mySide === "host") {
      setPendingSkills((prev) => ({ ...prev, host: skill }));
    } else {
      setPendingSkills((prev) => ({ ...prev, guest: skill }));
    }
    // 客机需要通过 transport 通知 host
    if (!isHost) {
      sendBattleAction(skill.name);
    }
  };

  // 自动结束动画后返回房间
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => {
      setActiveBattle(null);
      setPhase("SOCIAL_ROOM");
    }, 4000);
    return () => clearTimeout(t);
  }, [finished, setActiveBattle, setPhase]);

  // 退出按钮
  const handleForfeit = () => {
    if (!battle || finished) return;
    if (window.confirm("确认放弃这场对战？")) {
      const winnerSide: Side = mySide === "host" ? "guest" : "host";
      const report = buildReport(
        battle,
        winnerSide,
        battle.currentTurn,
        battle.logs,
      );
      if (isHost) {
        finishBattle(
          buildFinishedState(battle, engineRef.current, battle.logs, report),
        );
      } else {
        sendBattleAction("__forfeit__");
      }
      setFinished(true);
      setTimeout(() => {
        sendBattleReport(report);
        setActiveBattle(null);
        setPhase("SOCIAL_ROOM");
      }, 1500);
    }
  };

  if (!battle || !mySide) {
    return (
      <div className="min-h-screen grid-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-white/60 mb-4">未在对战中</div>
          <button
            type="button"
            onClick={() => setPhase("SOCIAL_ROOM")}
            className="px-4 py-2 text-sm border border-[#A78BFA] text-[#A78BFA] hover:bg-[#A78BFA] hover:text-[#0B0C10] transition-all"
          >
            返回房间
          </button>
        </div>
      </div>
    );
  }

  const hostSpirit = battle.hostSpirit;
  const guestSpirit = battle.guestSpirit;
  const hostHpPct = Math.max(0, (battle.hostHp / battle.hostMaxHp) * 100);
  const guestHpPct = Math.max(0, (battle.guestHp / battle.guestMaxHp) * 100);
  const hostChargePct = Math.min(
    100,
    (battle.hostCharge / ULTIMATE_THRESHOLD) * 100,
  );
  const guestChargePct = Math.min(
    100,
    (battle.guestCharge / ULTIMATE_THRESHOLD) * 100,
  );

  const myPendingSkill =
    mySide === "host" ? pendingSkills.host : pendingSkills.guest;
  const mySkills = (mySide === "host" ? hostSpirit : guestSpirit).combatSnapshot
    .skills;
  const isMyTurnReady = Boolean(myPendingSkill);

  const timeLeft = Math.max(0, Math.ceil((turnDeadline - now) / 1000));
  const showTimeout =
    battle.phase === "fighting" && !finished && turnDeadline > 0;

  return (
    <div className="min-h-screen grid-bg relative overflow-hidden flex flex-col">
      {/* 顶部 */}
      <header className="shrink-0 px-4 md:px-6 py-3 border-b border-[#FF003C]/25 bg-[#0B0C10]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords size={16} className="text-[#FF003C]" />
          <span
            className="text-sm font-black tracking-[0.3em] text-[#FF003C]"
            style={{ textShadow: "0 0 12px rgba(255,0,60,0.55)" }}
          >
            1v1 约战
          </span>
          <span className="text-[10px] font-mono tracking-widest text-white/40">
            第 {battle.currentTurn} 回合
          </span>
        </div>
        <div className="flex items-center gap-3">
          {showTimeout && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-white/60">
              <Loader2 size={11} className="animate-spin" />
              {timeLeft}s
            </div>
          )}
          {!finished && (
            <button
              type="button"
              onClick={handleForfeit}
              className="text-[10px] font-mono tracking-widest text-white/40 hover:text-[#FF6B9D] transition-colors"
            >
              认输
            </button>
          )}
        </div>
      </header>

      {/* 双方角色区 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="grid grid-cols-2 gap-2 px-4 md:px-8 pt-6 pb-3">
          {/* Host 角色 */}
          <CombatantPanel
            spirit={hostSpirit}
            nickname={battle.hostNickname}
            hpPct={hostHpPct}
            chargePct={hostChargePct}
            isMe={mySide === "host"}
            isLeft
            ready={Boolean(pendingSkills.host)}
          />
          {/* Guest 角色 */}
          <CombatantPanel
            spirit={guestSpirit}
            nickname={battle.guestNickname}
            hpPct={guestHpPct}
            chargePct={guestChargePct}
            isMe={mySide === "guest"}
            isLeft={false}
            ready={Boolean(pendingSkills.guest)}
          />
        </div>

        {/* 战斗日志 */}
        <div className="flex-1 min-h-0 mx-4 md:mx-8 mb-3 rounded-lg border border-white/10 bg-black/40 overflow-hidden flex flex-col">
          <div className="shrink-0 px-3 py-1.5 border-b border-white/5 text-[9px] font-mono tracking-[0.3em] text-white/40">
            BATTLE LOG
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5">
            {resolvedLogs.length === 0 && battle.logs.length === 0 ? (
              <div className="text-[11px] text-white/30 italic">
                战斗即将开始...
              </div>
            ) : (
              (resolvedLogs.length > 0 ? resolvedLogs : battle.logs)
                .slice(-20)
                .map((log, idx) => (
                  <motion.div
                    key={`${log.id}-${idx}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`text-[11px] leading-relaxed ${
                      log.attacker === "system"
                        ? "text-[#FFD700]"
                        : log.isUltimate
                          ? "text-[#FF6B9D] font-bold"
                          : log.isCrit
                            ? "text-[#FFD700] font-bold"
                            : "text-white/70"
                    }`}
                  >
                    {log.message}
                  </motion.div>
                ))
            )}
          </div>
        </div>

        {/* 技能选择 */}
        <div className="shrink-0 px-4 md:px-8 pb-4">
          {finished ? (
            <FinishedBanner battle={battle} />
          ) : battle.phase === "preparing" ? (
            <div className="rounded-lg border border-[#FFD700]/30 bg-[#FFD700]/8 px-4 py-3 text-center text-xs text-[#FFD700] tracking-wider">
              <Loader2 size={13} className="animate-spin inline mr-1.5" />
              战斗准备中...
            </div>
          ) : (
            <SkillPicker
              skills={mySkills}
              currentCharge={
                mySide === "host" ? battle.hostCharge : battle.guestCharge
              }
              onPick={handleSkillPick}
              disabled={isMyTurnReady}
              pickedSkillName={myPendingSkill?.name}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const CombatantPanel: React.FC<{
  spirit: SocialBattleState["hostSpirit"];
  nickname: string;
  hpPct: number;
  chargePct: number;
  isMe: boolean;
  isLeft: boolean;
  ready: boolean;
}> = ({ spirit, nickname, hpPct, chargePct, isMe, isLeft, ready }) => {
  const themeColor = isLeft ? "#66FCF1" : "#FF003C";
  const hpColor = hpPct > 60 ? "#22ff88" : hpPct > 30 ? "#FFD700" : "#FF003C";
  return (
    <motion.div
      layout
      className={`relative rounded-lg border p-3 ${
        isMe ? "border-[#FFD700]/50" : "border-white/15"
      } bg-black/40`}
    >
      {isMe && (
        <div className="absolute -top-2 left-3 text-[8px] font-mono tracking-widest text-[#FFD700] bg-[#0B0C10] px-1.5 border border-[#FFD700]/40 rounded">
          YOU
        </div>
      )}
      <div
        className={`flex items-center gap-2.5 ${isLeft ? "" : "flex-row-reverse text-right"}`}
      >
        <div
          className="h-12 w-12 shrink-0 overflow-hidden rounded border"
          style={{ borderColor: `${themeColor}55` }}
        >
          <CharacterAvatar
            imageUrl={spirit.imageUrl}
            name={spirit.name}
            themeColor={themeColor}
            className="h-full w-full"
            iconSize={20}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-1.5"
            style={{ justifyContent: isLeft ? "flex-start" : "flex-end" }}
          >
            <span
              className="text-sm font-bold truncate"
              style={{ color: themeColor }}
            >
              {spirit.name}
            </span>
            {ready && (
              <span className="text-[8px] font-mono text-[#7FFF9F] border border-[#7FFF9F]/40 px-1 rounded">
                READY
              </span>
            )}
          </div>
          <div className="text-[10px] text-white/40 truncate">
            {nickname} · {spirit.persona.archetype}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-1.5">
          <Heart size={10} style={{ color: hpColor }} />
          <div className="flex-1 h-2 rounded-full bg-black/60 overflow-hidden border border-white/5">
            <motion.div
              className="h-full rounded-full"
              style={{ background: hpColor }}
              animate={{ width: `${hpPct}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span
            className="text-[9px] font-mono tabular-nums"
            style={{ color: hpColor }}
          >
            {Math.round(hpPct)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap size={10} className="text-[#FFD700]" />
          <div className="flex-1 h-1 rounded-full bg-black/60 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: chargePct >= 100 ? "#FF6B9D" : "#FFD700",
                boxShadow: chargePct >= 100 ? "0 0 8px #FF6B9D" : "none",
              }}
              animate={{ width: `${chargePct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <span className="text-[8px] font-mono tabular-nums text-[#FFD700]">
            {chargePct >= 100 ? "ULT" : `${Math.round(chargePct)}%`}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

const SkillPicker: React.FC<{
  skills: Skill[];
  currentCharge: number;
  onPick: (skill: Skill) => void;
  disabled: boolean;
  pickedSkillName?: string;
}> = ({ skills, currentCharge, onPick, disabled, pickedSkillName }) => {
  const ult = skills.find(isUltimateSkill);
  const normalSkills = skills.filter((s) => !isUltimateSkill(s));
  const canUseUlt = ult && currentCharge >= ULTIMATE_THRESHOLD;

  return (
    <div className="rounded-lg border border-[#A78BFA]/30 bg-[#0B0C10]/70 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono tracking-[0.3em] text-white/50">
          选择技能
        </span>
        {disabled && (
          <span className="text-[10px] font-mono text-[#7FFF9F] flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" />
            等待对手...
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {normalSkills.slice(0, 4).map((skill) => {
          const picked = pickedSkillName === skill.name;
          return (
            <button
              key={skill.name}
              type="button"
              onClick={() => onPick(skill)}
              disabled={disabled}
              className={`text-left rounded border px-2.5 py-2 transition-all ${
                picked
                  ? "border-[#7FFF9F] bg-[#7FFF9F]/15"
                  : "border-white/15 bg-black/30 hover:border-[#A78BFA] hover:bg-[#A78BFA]/10"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <div className="text-[11px] font-bold text-white truncate">
                {skill.name}
              </div>
              <div className="text-[9px] text-white/40 truncate mt-0.5">
                {skill.type === "attack"
                  ? `攻击 ×${skill.damageMultiplier}`
                  : skill.type === "heal"
                    ? `治疗 ${skill.healPercent ?? 0}%`
                    : skill.type === "buff"
                      ? `增益 ${skill.buffPercent ?? 0}%`
                      : skill.type === "debuff"
                        ? `减益 ${skill.buffPercent ?? 0}%`
                        : skill.type}
              </div>
            </button>
          );
        })}
        {ult && (
          <button
            type="button"
            onClick={() => onPick(ult)}
            disabled={disabled || !canUseUlt}
            className={`text-left rounded border-2 px-2.5 py-2 transition-all ${
              canUseUlt
                ? pickedSkillName === ult.name
                  ? "border-[#FF6B9D] bg-[#FF6B9D]/15"
                  : "border-[#FF6B9D]/70 bg-[#FF6B9D]/8 hover:bg-[#FF6B9D]/20"
                : "border-white/10 bg-black/40 opacity-50 cursor-not-allowed"
            }`}
            style={
              canUseUlt
                ? { boxShadow: "0 0 14px rgba(255,107,157,0.3)" }
                : undefined
            }
          >
            <div className="text-[11px] font-black text-[#FF6B9D] truncate flex items-center gap-1">
              <Sparkles size={10} />
              {ult.name}
            </div>
            <div className="text-[9px] text-[#FF6B9D]/70 truncate mt-0.5">
              大招 ×{ult.damageMultiplier}
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

const FinishedBanner: React.FC<{ battle: SocialBattleState }> = ({
  battle,
}) => {
  if (!battle.report) return null;
  const { report } = battle;
  const isHostWin = report.winnerPlayerId === battle.hostPlayerId;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-lg border-2 border-[#FFD700]/50 bg-[#FFD700]/10 p-4 text-center"
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <Trophy size={20} className="text-[#FFD700]" />
        <span
          className="text-lg font-black tracking-wider text-[#FFD700]"
          style={{ textShadow: "0 0 12px rgba(255,215,0,0.5)" }}
        >
          {report.winnerNickname} 胜利
        </span>
      </div>
      <div className="text-xs text-white/70 mb-3">
        {report.winnerSpiritName} 击败了 {report.loserNickname} 的{" "}
        {report.loserSpiritName}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="rounded bg-black/40 p-2">
          <div className="text-white/40">回合数</div>
          <div className="text-[#FFD700] font-bold">{report.totalTurns}</div>
        </div>
        <div className="rounded bg-black/40 p-2">
          <div className="text-white/40">胜方输出</div>
          <div className="text-[#7FFF9F] font-bold">
            {report.damageDealtByWinner}
          </div>
        </div>
        <div className="rounded bg-black/40 p-2">
          <div className="text-white/40">败方输出</div>
          <div className="text-[#FF6B9D] font-bold">
            {report.damageDealtByLoser}
          </div>
        </div>
      </div>
      {report.highlights.length > 0 && (
        <div className="mt-3 text-[11px] text-white/60 italic">
          {report.highlights[0]}
        </div>
      )}
      <div className="mt-3 text-[10px] font-mono text-white/40 tracking-widest">
        即将返回房间...
      </div>
      {/* 标记 isHostWin 用于未来扩展（如统计） */}
      <span className="hidden">{isHostWin ? "host-win" : "guest-win"}</span>
    </motion.div>
  );
};

// ===== 工具函数 =====

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const buildReport = (
  battle: SocialBattleState,
  winnerSide: Side,
  totalTurns: number,
  logs: BattleEvent[],
): SocialBattleReport => {
  const isHostWin = winnerSide === "host";
  const winnerSpirit = isHostWin ? battle.hostSpirit : battle.guestSpirit;
  const loserSpirit = isHostWin ? battle.guestSpirit : battle.hostSpirit;
  const winnerPlayerId = isHostWin ? battle.hostPlayerId : battle.guestPlayerId;
  const loserPlayerId = isHostWin ? battle.guestPlayerId : battle.hostPlayerId;
  const winnerNickname = isHostWin ? battle.hostNickname : battle.guestNickname;
  const loserNickname = isHostWin ? battle.guestNickname : battle.hostNickname;

  // 估算双方输出：从日志里累加 damage
  let damageDealtByWinner = 0;
  let damageDealtByLoser = 0;
  const skillUseCount: Record<string, number> = {};
  logs.forEach((log) => {
    if (log.attacker === "system") return;
    const isHostAttack = log.attacker === "player1";
    const isWinnerAttack = isHostAttack === isHostWin;
    if (log.damage && log.damage > 0) {
      if (isWinnerAttack) damageDealtByWinner += log.damage;
      else damageDealtByLoser += log.damage;
    }
    if (log.skillName) {
      skillUseCount[log.skillName] = (skillUseCount[log.skillName] ?? 0) + 1;
    }
  });
  const mvpSkillName = Object.entries(skillUseCount).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const highlights: string[] = [];
  const ultLog = logs.find((l) => l.isUltimate);
  if (ultLog) {
    highlights.push(
      `${ultLog.attackerName ?? ""} 释放了大招「${ultLog.skillName ?? ""}」`,
    );
  }
  const critLog = logs.find((l) => l.isCrit);
  if (critLog) {
    highlights.push(`暴击一击改变战局`);
  }
  if (totalTurns <= 3) {
    highlights.push(`${totalTurns} 回合速胜！`);
  }
  if (highlights.length === 0) {
    highlights.push(`${winnerSpirit.name} 艰难取胜`);
  }

  return {
    winnerPlayerId,
    winnerNickname,
    winnerSpiritName: winnerSpirit.name,
    loserPlayerId,
    loserNickname,
    loserSpiritName: loserSpirit.name,
    totalTurns,
    damageDealtByWinner,
    damageDealtByLoser,
    mvpSkillName,
    highlights,
  };
};

const buildFinishedState = (
  current: SocialBattleState,
  engine: BattleEngine | null,
  logs: BattleEvent[],
  report: SocialBattleReport,
): SocialBattleState => {
  const state = engine?.getState();
  return {
    ...current,
    currentTurn: state?.currentTurn ?? current.currentTurn,
    hostHp:
      state?.p1.hp ??
      (report.winnerPlayerId === current.hostPlayerId ? current.hostMaxHp : 0),
    guestHp:
      state?.p2.hp ??
      (report.winnerPlayerId === current.guestPlayerId
        ? current.guestMaxHp
        : 0),
    hostMaxHp: state?.p1.maxHp ?? current.hostMaxHp,
    guestMaxHp: state?.p2.maxHp ?? current.guestMaxHp,
    hostCharge: state?.p1.ultimateCharge ?? current.hostCharge,
    guestCharge: state?.p2.ultimateCharge ?? current.guestCharge,
    logs: logs.slice(-30),
    phase: "finished",
    winnerPlayerId: report.winnerPlayerId,
    report,
    updatedAt: Date.now(),
  };
};

// 保留 AnimatePresence 引用（即将用于结算动画）
void AnimatePresence;
void useMemo;
