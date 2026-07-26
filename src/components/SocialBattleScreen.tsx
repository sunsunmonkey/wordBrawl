import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Swords, Trophy } from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSocialStore } from "../store/useSocialStore";
import type {
  SerializedSpirit,
  SocialBattleReport,
  SocialBattleState,
} from "../store/socialTypes";
import type { CharacterData, BattleEvent, Skill } from "../store/useGameStore";
import { BattleEngine, ULTIMATE_THRESHOLD } from "../utils/battleEngine";
import { socialTransport } from "../utils/socialTransport";
// 复用九层塔（Tower/BattleScreen）的战斗演出层，保证两套系统观感一致。
import { CharacterCard, UltimateOverlayView, useBattleFx } from "./battleFx";

const TURN_TIMEOUT_MS = 15_000;
/** 单招演出时长（普攻/技能）：留足受击飘字 + 震屏时间 */
const SKILL_FX_MS = 1_200;
/** 大招演出时长：预警 500 + 蓄力 400 + 释放 2100 + 收尾缓冲 */
const ULTIMATE_FX_MS = 3_400;

const isUltimateSkill = (skill: Skill): boolean =>
  skill.type === "ultimate" || !!skill.isUltimate;

type Side = "host" | "guest";

/**
 * 把序列化词灵 + 实时 HP/充能 组装成 Tower CharacterCard 所需的 CharacterData。
 * displayedHp / displayedCharge 是“已播放到当前日志”的数值，驱动血条平滑动画。
 */
const toCharacterData = (
  spirit: SerializedSpirit,
  hp: number,
  maxHp: number,
  charge: number,
): CharacterData => {
  const snap = spirit.combatSnapshot;
  return {
    ...snap,
    name: spirit.name,
    hp,
    maxHp,
    ultimateCharge: charge,
    imageUrl: spirit.imageUrl ?? snap.imageUrl,
  };
};

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

  // ===== 演出层（Tower 共享）=====
  const {
    ultimateOverlay,
    shakeScreen,
    hitSide,
    attackerSide,
    popups,
    playLogEffects,
    resetFx,
  } = useBattleFx();

  // ===== host 权威引擎 =====
  const engineRef = useRef<BattleEngine | null>(null);
  const [pendingSkills, setPendingSkills] = useState<{
    host?: Skill;
    guest?: Skill;
  }>({});
  const resolvingRef = useRef(false);
  const seenActionIdsRef = useRef<Set<string>>(new Set());

  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState(false);
  const [forfeitPending, setForfeitPending] = useState(false);

  const roomBattle = currentRoom?.activeBattle ?? null;
  const battle =
    activeBattle && roomBattle
      ? activeBattle.updatedAt >= roomBattle.updatedAt
        ? activeBattle
        : roomBattle
      : (activeBattle ?? roomBattle);

  const isHost = battle?.hostPlayerId === playerId;
  const mySide: Side | null = battle
    ? battle.hostPlayerId === playerId
      ? "host"
      : battle.guestPlayerId === playerId
        ? "guest"
        : null
    : null;

  // 对手离开后，房间状态会清空 activeBattle；不保留在失效的战斗界面。
  useEffect(() => {
    if (!battle) setPhase("SOCIAL_ROOM");
  }, [battle, setPhase]);

  // ===== 日志驱动的演出进度（两端各自播放）=====
  // 用 log.id 记录已播放的日志（对滑动窗口截断稳健）；caughtUp 表示演出已追平权威状态。
  const playedIdsRef = useRef<Set<string>>(new Set());
  const [caughtUp, setCaughtUp] = useState(true);
  const [displayHp, setDisplayHp] = useState<{ host: number; guest: number }>({
    host: battle?.hostHp ?? 0,
    guest: battle?.guestHp ?? 0,
  });
  const [displayCharge, setDisplayCharge] = useState<{
    host: number;
    guest: number;
  }>({ host: battle?.hostCharge ?? 0, guest: battle?.guestCharge ?? 0 });
  const playingRef = useRef(false);
  const initializedBattleIdRef = useRef<string | null>(null);
  const battleRef = useRef<SocialBattleState | null>(battle);
  if (
    battle &&
    (!battleRef.current ||
      battleRef.current.battleId !== battle.battleId ||
      battle.updatedAt >= battleRef.current.updatedAt)
  ) {
    battleRef.current = battle;
  }

  // 首次看到对战时，把当前所有日志标记为“已播放”，避免重挂载/中途加入时重放历史伤害。
  useEffect(() => {
    if (!battle || initializedBattleIdRef.current === battle.battleId) return;
    initializedBattleIdRef.current = battle.battleId;
    playedIdsRef.current.clear();
    seenActionIdsRef.current.clear();
    engineRef.current = null;
    resolvingRef.current = false;
    playingRef.current = false;
    battle.logs.forEach((l) => playedIdsRef.current.add(l.id));
    setDisplayHp({ host: battle.hostHp, guest: battle.guestHp });
    setDisplayCharge({ host: battle.hostCharge, guest: battle.guestCharge });
    setPendingSkills({});
    setForfeitPending(false);
    setFinished(false);
    setCaughtUp(true);
  }, [battle]);

  // 心跳定时器：驱动倒计时进度
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // ---------------------------------------------------------------------------
  // host：初始化/恢复权威引擎
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!battle || !isHost || engineRef.current) return;
    if (battle.phase === "finished") return;
    const engine = new BattleEngine(
      battle.hostSpirit.combatSnapshot,
      battle.guestSpirit.combatSnapshot,
    );
    engineRef.current = engine;
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    let nextState: SocialBattleState;
    if (battle.phase === "preparing") {
      const state = engine.getState();
      nextState = {
        ...battle,
        currentTurn: state.currentTurn,
        round: 1,
        hostHp: state.p1.hp,
        guestHp: state.p2.hp,
        hostMaxHp: state.p1.maxHp,
        guestMaxHp: state.p2.maxHp,
        hostCharge: state.p1.ultimateCharge,
        guestCharge: state.p2.ultimateCharge,
        logs: engine.createOpeningLogs(),
        phase: "fighting",
        acceptingActions: true,
        turnDeadlineAt: deadline,
        updatedAt: Math.max(Date.now(), battle.updatedAt + 1),
      };
    } else {
      // 页面刷新后最少恢复血量、充能与行动序号，并重新开放当前轮次。
      engine.p1.hp = battle.hostHp;
      engine.p1.maxHp = battle.hostMaxHp;
      engine.p1.ultimateCharge = battle.hostCharge;
      engine.p2.hp = battle.guestHp;
      engine.p2.maxHp = battle.guestMaxHp;
      engine.p2.ultimateCharge = battle.guestCharge;
      engine.currentTurn = battle.currentTurn;
      nextState = {
        ...battle,
        acceptingActions: true,
        turnDeadlineAt: deadline,
        updatedAt: Math.max(Date.now(), battle.updatedAt + 1),
      };
    }
    battleRef.current = nextState;
    updateBattleState(nextState);
  }, [battle, isHost, updateBattleState]);

  // ---------------------------------------------------------------------------
  // host：监听 guest 出招上行
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !battle) return;
    const unsub = socialTransport.subscribe((event) => {
      if (event.kind !== "battle-action") return;
      const current = battleRef.current;
      if (!current || event.battleId !== current.battleId) return;
      const activeRoom = useSocialStore.getState().currentRoom;
      const guestStillPresent = activeRoom?.players.some(
        (player) => player.playerId === current.guestPlayerId,
      );
      if (!guestStillPresent) return;
      if (!event.actionId || seenActionIdsRef.current.has(event.actionId))
        return;
      seenActionIdsRef.current.add(event.actionId);
      if (event.actorPlayerId !== current.guestPlayerId) return;
      if (event.skillName === "__forfeit__") {
        // guest 认输：host 直接判 host 胜
        handleRemoteForfeit();
        return;
      }
      if (
        current.phase !== "fighting" ||
        !current.acceptingActions ||
        resolvingRef.current ||
        event.round !== current.round
      )
        return;
      const skill = current.guestSpirit.combatSnapshot.skills.find(
        (s) => s.name === event.skillName,
      );
      if (skill) {
        setPendingSkills((prev) =>
          prev.guest ? prev : { ...prev, guest: skill },
        );
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, battle?.battleId]);

  // ---------------------------------------------------------------------------
  // host：双方选完 / 超时 → 结算整回合（逐招演出）
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isHost || !engineRef.current || !battle) return;
    if (battle.phase !== "fighting" || !battle.acceptingActions || finished)
      return;
    if (resolvingRef.current) return;

    const bothReady =
      Boolean(pendingSkills.host) && Boolean(pendingSkills.guest);
    const timedOut = now >= battle.turnDeadlineAt && battle.turnDeadlineAt > 0;
    if (!bothReady && !timedOut) return;

    const engine = engineRef.current;
    const hostSkill =
      pendingSkills.host ?? engine.chooseSkill(engine.p1, engine.p2);
    const guestSkill =
      pendingSkills.guest ?? engine.chooseSkill(engine.p2, engine.p1);
    const hostFirst = engine.p1.speed >= engine.p2.speed;

    resolvingRef.current = true;
    const lockedState: SocialBattleState = {
      ...battle,
      acceptingActions: false,
      turnDeadlineAt: 0,
      updatedAt: Math.max(Date.now(), battle.updatedAt + 1),
    };
    battleRef.current = lockedState;
    updateBattleState(lockedState);
    void resolveTurn(
      engine,
      lockedState,
      hostFirst ? "host" : "guest",
      hostFirst ? "guest" : "host",
      hostSkill,
      guestSkill,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSkills, now, isHost, battle, finished]);

  /** host 结算一回合：逐招 executeSkill → 逐招广播（每招之间留出演出时间）。 */
  const resolveTurn = async (
    engine: BattleEngine,
    current: SocialBattleState,
    firstSide: Side,
    secondSide: Side,
    hostSkill: Skill,
    guestSkill: Skill,
  ) => {
    setPendingSkills({});

    const executeOnce = (side: Side): BattleEvent | null => {
      if (engine.isBattleOver()) return null;
      const attackerId = side === "host" ? "player1" : "player2";
      const raw = side === "host" ? hostSkill : guestSkill;
      const actor = side === "host" ? engine.p1 : engine.p2;
      let skill = raw;
      // 大招未就绪 → 降级为首个普攻
      if (isUltimateSkill(raw) && !engine.canUseUltimate(actor)) {
        const fallback = actor.skills.find((s) => !isUltimateSkill(s));
        if (fallback) skill = fallback;
      }
      return engine.executeSkill(attackerId, skill).log;
    };

    // 第一招
    const firstLog = executeOnce(firstSide);
    if (firstLog) {
      await broadcastStep(engine, current, firstLog, false);
      await sleep(firstLog.isUltimate ? ULTIMATE_FX_MS : SKILL_FX_MS);
    }

    // 若第一招已终结战斗则跳过第二招
    let over = engine.isBattleOver();
    let secondLog: BattleEvent | null = null;
    if (!over) {
      secondLog = executeOnce(secondSide);
      over = engine.isBattleOver();
    }

    if (over) {
      // 结算：补一条击败日志
      const winnerSide: Side =
        engine.getWinner() === "player1" ? "host" : "guest";
      const defeatLog = engine.createDefeatLog(
        winnerSide === "host" ? "player2" : "player1",
      );
      const report = buildReport(
        current,
        winnerSide,
        current.round,
        collectAllLogs(current, [firstLog, secondLog, defeatLog]),
      );
      // 先播第二招（若有），再上结束态
      if (secondLog) {
        await broadcastStep(engine, current, secondLog, false);
        await sleep(secondLog.isUltimate ? ULTIMATE_FX_MS : SKILL_FX_MS);
      }
      const finalState = await broadcastStep(
        engine,
        current,
        defeatLog,
        true,
        report,
      );
      setFinished(true);
      finishBattle(finalState);
      resolvingRef.current = false;
      return;
    }

    // 未结束：播第二招 + 进入下一回合
    if (secondLog) {
      await broadcastStep(engine, current, secondLog, false);
      await sleep(secondLog.isUltimate ? ULTIMATE_FX_MS : SKILL_FX_MS);
    }
    const base = battleRef.current ?? current;
    const nextRound: SocialBattleState = {
      ...base,
      round: current.round + 1,
      acceptingActions: true,
      turnDeadlineAt: Date.now() + TURN_TIMEOUT_MS,
      updatedAt: Math.max(Date.now(), base.updatedAt + 1),
    };
    battleRef.current = nextRound;
    updateBattleState(nextRound);
    resolvingRef.current = false;
  };

  /** host 广播“单招后”的权威状态；返回 Promise 便于串行。 */
  const broadcastStep = async (
    engine: BattleEngine,
    current: SocialBattleState,
    newLog: BattleEvent,
    isFinished: boolean,
    report?: SocialBattleReport,
  ): Promise<SocialBattleState> => {
    const base = battleRef.current ?? current;
    const state = engine.getState();
    const mergedLogs = [...base.logs, newLog].slice(-40);
    const next: SocialBattleState = {
      ...base,
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
      acceptingActions: false,
      turnDeadlineAt: 0,
      updatedAt: Math.max(Date.now(), base.updatedAt + 1),
    };
    battleRef.current = next;
    updateBattleState(next);
    await sleep(60);
    return next;
  };

  // ---------------------------------------------------------------------------
  // 演出播放器（两端通用）：监听 battle.logs，逐条播放尚未播过的日志。
  // 每播一条：先 playLogEffects(log)，再把 displayHp/displayCharge 推到该招后的值。
  // ---------------------------------------------------------------------------
  const logs = battle?.logs ?? [];

  const advancePlayer = useCallback(async () => {
    if (playingRef.current) return;
    if (!battleRef.current) return;
    const played = playedIdsRef.current;
    playingRef.current = true;
    setCaughtUp(false);

    while (true) {
      // 每播完一条都重新读取日志，避免播放期间到达的新日志被漏掉。
      const cur = battleRef.current;
      if (!cur) break;
      const log = cur.logs.find((item) => !played.has(item.id));
      if (!log) break;
      await playLogEffects(log);
      applyLogToDisplay(log, cur);
      played.add(log.id);
      // system 开场日志之间不停顿，招式间隔由 host 的节奏控制
      if (log.attacker !== "system") {
        await sleep(120);
      }
    }
    playingRef.current = false;
    // 追平后把血量/充能对齐权威值，消除舍入误差
    const fin = battleRef.current;
    if (fin) {
      setDisplayHp({ host: fin.hostHp, guest: fin.guestHp });
      setDisplayCharge({ host: fin.hostCharge, guest: fin.guestCharge });
    }
    setCaughtUp(true);
  }, [playLogEffects]);

  /** 依据单条日志把 displayHp/displayCharge 平滑推进（受击方掉血，攻击方回血/充能）。 */
  const applyLogToDisplay = (log: BattleEvent, b: SocialBattleState) => {
    if (log.attacker === "system") return;
    const attackerSideKey: Side = log.attacker === "player1" ? "host" : "guest";
    const defenderSideKey: Side = attackerSideKey === "host" ? "guest" : "host";

    setDisplayHp((prev) => {
      const nextAtt = { ...prev };
      if (log.damage) {
        const maxHp = defenderSideKey === "host" ? b.hostMaxHp : b.guestMaxHp;
        nextAtt[defenderSideKey] = Math.max(
          0,
          Math.min(maxHp, prev[defenderSideKey] - log.damage),
        );
      }
      if (log.heal) {
        const maxHp = attackerSideKey === "host" ? b.hostMaxHp : b.guestMaxHp;
        nextAtt[attackerSideKey] = Math.max(
          0,
          Math.min(maxHp, prev[attackerSideKey] + log.heal),
        );
      }
      return nextAtt;
    });

    setDisplayCharge((prev) => {
      const next = { ...prev };
      if (typeof log.attackerCharge === "number")
        next[attackerSideKey] = log.attackerCharge;
      if (typeof log.defenderCharge === "number")
        next[defenderSideKey] = log.defenderCharge;
      return next;
    });
  };

  useEffect(() => {
    void advancePlayer();
  }, [advancePlayer, logs.length]);

  // 只有房主明确开启下一轮时才释放本地选招锁。
  useEffect(() => {
    setPendingSkills({});
  }, [battle?.round]);

  // 客端收到结束态后，先播完最后一段演出，再进入结算倒计时。
  useEffect(() => {
    if (battle?.phase === "finished" && caughtUp) {
      setFinished(true);
    }
  }, [battle?.phase, caughtUp]);

  // ---------------------------------------------------------------------------
  // 出招
  // ---------------------------------------------------------------------------
  const handleSkillPick = (skill: Skill) => {
    if (!battle || !mySide || finished || forfeitPending) return;
    if (battle.phase !== "fighting" || !battle.acceptingActions) return;
    // 演出未播完时禁止提前出招
    if (!caughtUp) return;
    if (isUltimateSkill(skill)) {
      const charge = mySide === "host" ? battle.hostCharge : battle.guestCharge;
      if (charge < ULTIMATE_THRESHOLD) return;
    }
    if (mySide === "host") {
      setPendingSkills((prev) => ({ ...prev, host: skill }));
    } else {
      setPendingSkills((prev) => ({ ...prev, guest: skill }));
      sendBattleAction(skill.name);
    }
  };

  const handleRemoteForfeit = () => {
    const b = battleRef.current;
    if (!b || finished) return;
    const report = buildReport(b, "host", b.round, b.logs);
    setFinished(true);
    finishBattle({
      ...b,
      phase: "finished",
      acceptingActions: false,
      turnDeadlineAt: 0,
      winnerPlayerId: report.winnerPlayerId,
      report,
    });
  };

  // 结束后自动返回房间
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => {
      const completedBattle = battleRef.current;
      if (completedBattle?.report) {
        sendBattleReport(completedBattle.report, completedBattle.battleId);
      }
      resetFx();
      setActiveBattle(null);
      setPhase("SOCIAL_ROOM");
    }, 4200);
    return () => clearTimeout(t);
  }, [finished, resetFx, sendBattleReport, setActiveBattle, setPhase]);

  const handleForfeit = () => {
    if (!battle || finished || forfeitPending) return;
    if (!window.confirm("确认放弃这场对战？")) return;
    if (isHost) {
      const report = buildReport(battle, "guest", battle.round, battle.logs);
      finishBattle(buildFinishedState(battle, engineRef.current, report));
      setFinished(true);
    } else {
      setForfeitPending(true);
      sendBattleAction("__forfeit__");
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

  // 左=host, 右=guest（与 FX 层 player1/player2 约定一致）
  const leftChar = toCharacterData(
    battle.hostSpirit,
    displayHp.host,
    battle.hostMaxHp,
    displayCharge.host,
  );
  const rightChar = toCharacterData(
    battle.guestSpirit,
    displayHp.guest,
    battle.guestMaxHp,
    displayCharge.guest,
  );

  const animationCaughtUp = caughtUp;
  const myPendingSkill =
    mySide === "host" ? pendingSkills.host : pendingSkills.guest;
  const isMyTurnReady = Boolean(myPendingSkill);
  const iAmActive =
    battle.phase === "fighting" &&
    battle.acceptingActions &&
    !finished &&
    !forfeitPending &&
    animationCaughtUp &&
    !isMyTurnReady;

  // 只有轮到“可出招”窗口时才把 onSkillSelect 给自己那张卡
  const hostCanPick = mySide === "host" && iAmActive;
  const guestCanPick = mySide === "guest" && iAmActive;

  const timeLeft = Math.max(0, Math.ceil((battle.turnDeadlineAt - now) / 1000));
  const showTimeout =
    battle.phase === "fighting" &&
    battle.acceptingActions &&
    !finished &&
    battle.turnDeadlineAt > 0 &&
    animationCaughtUp;

  return (
    <div
      className={`h-dvh max-h-dvh flex flex-col overflow-hidden p-3 md:p-4 relative grid-bg ${shakeScreen ? "shake" : ""}`}
    >
      {/* 中心聚光 */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-yellow-500/30 to-transparent rounded-full blur-3xl" />
      </div>

      {/* 大招全屏过场 */}
      <AnimatePresence>
        {ultimateOverlay && <UltimateOverlayView overlay={ultimateOverlay} />}
      </AnimatePresence>

      {/* 顶部 HUD */}
      <div className="shrink-0 z-10 flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Swords size={16} className="text-[#FF003C]" />
          <span
            className="text-sm font-black tracking-[0.3em] text-[#FF003C]"
            style={{ textShadow: "0 0 12px rgba(255,0,60,0.55)" }}
          >
            1v1 约战
          </span>
          <span className="text-[10px] font-mono tracking-widest text-white/40">
            第 {battle.round} 回合
          </span>
        </div>
        <div className="flex items-center gap-3">
          {showTimeout && iAmActive && (
            <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-widest text-white/60">
              <Loader2 size={11} className="animate-spin" />
              {timeLeft}s
            </div>
          )}
          {!finished && !forfeitPending && (
            <button
              type="button"
              onClick={handleForfeit}
              className="text-[10px] font-mono tracking-widest text-white/40 hover:text-[#FF6B9D] transition-colors"
            >
              认输
            </button>
          )}
        </div>
      </div>

      {/* 战场：左右大立绘 + 中间战斗日志 */}
      <div className="min-h-0 flex-1 flex flex-col md:flex-row gap-3 items-stretch max-w-7xl w-full mx-auto z-10 overflow-hidden">
        <CharacterCard
          char={leftChar}
          isLeft
          beingHit={hitSide === "left"}
          isAttacking={attackerSide === "left"}
          isActiveTurn={hostCanPick}
          canUseSkills={hostCanPick}
          onSkillSelect={hostCanPick ? handleSkillPick : undefined}
          popups={popups.left}
        />

        <div className="min-h-0 flex-1 flex flex-col bg-[#0B0C10]/90 border-2 border-[#45A29E]/40 rounded-xl overflow-hidden shadow-2xl relative backdrop-blur-md">
          <div className="bg-gradient-to-r from-[#1F2833] via-[#0B0C10] to-[#1F2833] p-3 text-center text-xs font-black tracking-[0.3em] border-b border-[#45A29E]/30 flex justify-between items-center">
            <span className="text-[#66FCF1] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              REC
            </span>
            <span className="text-[#C5C6C7]">▶ COMBAT LOG ◀</span>
            <span className="text-[#FF003C]">TURN {battle.round}</span>
          </div>

          <BattleLogList logs={battle.logs} />

          {/* 状态提示条 */}
          <div className="shrink-0 border-t border-[#45A29E]/25 bg-[#1F2833]/55 px-3 py-2 text-center">
            {finished ? (
              <FinishedBanner battle={battle} />
            ) : battle.phase === "preparing" ? (
              <div className="text-[11px] text-[#FFD700] tracking-wider flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                战斗准备中...
              </div>
            ) : forfeitPending ? (
              <div className="text-[11px] text-[#FF6B9D] tracking-wider flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                认输请求已发送，等待房主确认...
              </div>
            ) : !animationCaughtUp ? (
              <div className="text-[11px] text-[#66FCF1] tracking-wider flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                演出进行中...
              </div>
            ) : !battle.acceptingActions ? (
              <div className="text-[11px] text-[#66FCF1] tracking-wider flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                本轮结算中...
              </div>
            ) : isMyTurnReady ? (
              <div className="text-[11px] text-[#7FFF9F] tracking-wider flex items-center justify-center gap-1.5">
                <Loader2 size={12} className="animate-spin" />
                已锁定招式，等待对手...
              </div>
            ) : (
              <div className="text-[11px] text-[#FFD700] tracking-wider font-bold">
                ▼ 从你的角色卡选择招式 ▼
              </div>
            )}
          </div>
        </div>

        <CharacterCard
          char={rightChar}
          isLeft={false}
          beingHit={hitSide === "right"}
          isAttacking={attackerSide === "right"}
          isActiveTurn={guestCanPick}
          canUseSkills={guestCanPick}
          onSkillSelect={guestCanPick ? handleSkillPick : undefined}
          popups={popups.right}
        />
      </div>
    </div>
  );
};

/** 战斗日志滚动列表（自动滚到底部）。 */
const BattleLogList: React.FC<{ logs: BattleEvent[] }> = ({ logs }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [logs.length]);
  return (
    <div
      ref={ref}
      className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5"
    >
      {logs.length === 0 ? (
        <div className="text-[11px] text-white/30 italic">战斗即将开始...</div>
      ) : (
        logs.slice(-24).map((log, idx) => (
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
  );
};

const FinishedBanner: React.FC<{ battle: SocialBattleState }> = ({
  battle,
}) => {
  if (!battle.report) return null;
  const { report } = battle;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-left"
    >
      <div className="flex items-center justify-center gap-2 mb-1.5">
        <Trophy size={18} className="text-[#FFD700]" />
        <span
          className="text-base font-black tracking-wider text-[#FFD700]"
          style={{ textShadow: "0 0 12px rgba(255,215,0,0.5)" }}
        >
          {report.winnerNickname} 胜利
        </span>
      </div>
      <div className="text-[11px] text-white/70 text-center mb-2">
        {report.winnerSpiritName} 击败了 {report.loserNickname} 的{" "}
        {report.loserSpiritName}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="rounded bg-black/40 p-1.5 text-center">
          <div className="text-white/40">回合</div>
          <div className="text-[#FFD700] font-bold">{report.totalTurns}</div>
        </div>
        <div className="rounded bg-black/40 p-1.5 text-center">
          <div className="text-white/40">胜方输出</div>
          <div className="text-[#7FFF9F] font-bold">
            {report.damageDealtByWinner}
          </div>
        </div>
        <div className="rounded bg-black/40 p-1.5 text-center">
          <div className="text-white/40">败方输出</div>
          <div className="text-[#FF6B9D] font-bold">
            {report.damageDealtByLoser}
          </div>
        </div>
      </div>
      {report.highlights.length > 0 && (
        <div className="mt-2 text-[11px] text-white/60 italic text-center">
          {report.highlights[0]}
        </div>
      )}
      <div className="mt-2 text-[10px] font-mono text-white/40 tracking-widest text-center">
        即将返回房间...
      </div>
    </motion.div>
  );
};

// ===== 工具函数 =====

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 汇总本回合日志（用于战报统计），过滤 null。 */
const collectAllLogs = (
  current: SocialBattleState,
  newLogs: (BattleEvent | null)[],
): BattleEvent[] => {
  return [...current.logs, ...newLogs.filter((l): l is BattleEvent => !!l)];
};

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
  if (critLog) highlights.push(`暴击一击改变战局`);
  if (totalTurns <= 3) highlights.push(`${totalTurns} 回合速胜！`);
  if (highlights.length === 0) highlights.push(`${winnerSpirit.name} 艰难取胜`);

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
  report: SocialBattleReport,
  extraLog?: BattleEvent,
): SocialBattleState => {
  const state = engine?.getState();
  const logs = extraLog
    ? [...current.logs, extraLog].slice(-40)
    : current.logs.slice(-40);
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
    logs,
    phase: "finished",
    winnerPlayerId: report.winnerPlayerId,
    report,
    updatedAt: Date.now(),
  };
};
