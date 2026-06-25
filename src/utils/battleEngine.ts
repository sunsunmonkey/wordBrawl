import { CharacterData, BattleEvent, Skill } from '../store/useGameStore';

const ULTIMATE_THRESHOLD = 100; // 大招充能阈值

// ===== 充能算法参数（多维度，让不同角色充能节奏差异化）=====
const BASE_CHARGE_PER_TURN = 12; // 基础每回合充能（固定部分）
const SPEED_CHARGE_FACTOR = 0.22; // 速度 → 充能：速度越快越先出手且充能越多
const DAMAGE_DEALT_CHARGE_FACTOR = 0.16; // 造成伤害 → 充能：攻击型角色充能更快
const DAMAGE_TAKEN_CHARGE_FACTOR = 0.28; // 受击伤害 → 充能：肉盾/反击型角色充能更快
const CRIT_CHARGE_BONUS = 24; // 暴击额外充能
const LOW_HP_RAGE_THRESHOLD = 0.4; // 血量低于 40% 触发狂暴
const LOW_HP_RAGE_MULTIPLIER = 2.1; // 狂暴时充能倍率（绝地反击）
// 不同技能类型的额外充能（辅助技能也有充能收益）
const SKILL_TYPE_CHARGE_BONUS: Record<string, number> = {
  attack: 0,
  heal: 14,
  buff: 16,
  debuff: 16,
  ultimate: 0,
};

export { ULTIMATE_THRESHOLD };

type BattleState = {
  name: string;
  description: string;
  weight: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  critChanceBonus: number;
  critDamageBonus: number;
  damageSwing: number;
  executeChance: number;
  chargeMultiplier: number;
};

const BATTLE_STATES: BattleState[] = [
  {
    name: '神挡杀神',
    description: '手感爆炸，任何一击都有可能直接终结比赛',
    weight: 8,
    attackMultiplier: 1.9,
    defenseMultiplier: 1.0,
    critChanceBonus: 0.24,
    critDamageBonus: 0.85,
    damageSwing: 0.75,
    executeChance: 0.075,
    chargeMultiplier: 1.35,
  },
  {
    name: '状态爆棚',
    description: '输出、暴击和充能都明显上扬',
    weight: 17,
    attackMultiplier: 1.42,
    defenseMultiplier: 1.08,
    critChanceBonus: 0.14,
    critDamageBonus: 0.45,
    damageSwing: 0.48,
    executeChance: 0.035,
    chargeMultiplier: 1.2,
  },
  {
    name: '热手',
    description: '攻击节奏更顺，伤害波动偏高',
    weight: 24,
    attackMultiplier: 1.18,
    defenseMultiplier: 1,
    critChanceBonus: 0.07,
    critDamageBonus: 0.2,
    damageSwing: 0.32,
    executeChance: 0.015,
    chargeMultiplier: 1.08,
  },
  {
    name: '平稳',
    description: '正常发挥，胜负主要看角色和技能',
    weight: 26,
    attackMultiplier: 1,
    defenseMultiplier: 1,
    critChanceBonus: 0,
    critDamageBonus: 0,
    damageSwing: 0.24,
    executeChance: 0.006,
    chargeMultiplier: 1,
  },
  {
    name: '手感冰凉',
    description: '伤害偏低，但挨打后更容易攒出反击大招',
    weight: 17,
    attackMultiplier: 0.78,
    defenseMultiplier: 0.92,
    critChanceBonus: -0.03,
    critDamageBonus: -0.12,
    damageSwing: 0.38,
    executeChance: 0.008,
    chargeMultiplier: 1.18,
  },
  {
    name: '孤注一掷',
    description: '身板发虚、上下限极端，可能刮痧，也可能突然秒人',
    weight: 8,
    attackMultiplier: 0.72,
    defenseMultiplier: 0.72,
    critChanceBonus: 0.1,
    critDamageBonus: 0.55,
    damageSwing: 1.05,
    executeChance: 0.06,
    chargeMultiplier: 1.3,
  },
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const pickBattleState = (): BattleState => {
  const total = BATTLE_STATES.reduce((sum, state) => sum + state.weight, 0);
  let roll = Math.random() * total;
  for (const state of BATTLE_STATES) {
    roll -= state.weight;
    if (roll <= 0) return state;
  }
  return BATTLE_STATES[BATTLE_STATES.length - 1];
};

export interface SkillResult {
  log: BattleEvent;
  damage?: number;
  heal?: number;
  isCrit: boolean;
  isUltimate: boolean;
  /** 攻击者释放大招后的充能值（通常为 0） */
  attackerChargeAfter: number;
  /** 受击者充能值变化后 */
  defenderChargeAfter: number;
}

export class BattleEngine {
  p1: CharacterData;
  p2: CharacterData;
  currentTurn: number = 1;
  private logs: BattleEvent[] = [];
  private readonly p1BattleState: BattleState;
  private readonly p2BattleState: BattleState;
  // 每个引擎实例的唯一 id 序列，避免 Date.now() 在同步循环中产生重复 key
  private static instanceCounter: number = 0;
  private readonly instanceId: number;

  constructor(p1: CharacterData, p2: CharacterData) {
    this.p1 = JSON.parse(JSON.stringify(p1)); // deep copy
    this.p2 = JSON.parse(JSON.stringify(p2));
    this.instanceId = ++BattleEngine.instanceCounter;
    this.p1BattleState = pickBattleState();
    this.p2BattleState = pickBattleState();
    // 重置充能与 buff
    this.p1.ultimateCharge = 0;
    this.p2.ultimateCharge = 0;
    this.p1.attackBuff = 0;
    this.p1.defenseBuff = 0;
    this.p1.buffTurnsLeft = 0;
    this.p2.attackBuff = 0;
    this.p2.defenseBuff = 0;
    this.p2.buffTurnsLeft = 0;
  }

  private getBattleState(c: CharacterData): BattleState {
    return c === this.p1 ? this.p1BattleState : this.p2BattleState;
  }

  /** 获取当前双方状态快照（用于 UI 渲染） */
  getState(): { p1: CharacterData; p2: CharacterData; currentTurn: number } {
    return {
      p1: { ...this.p1 },
      p2: { ...this.p2 },
      currentTurn: this.currentTurn,
    };
  }

  private getEffectiveAttack(c: CharacterData): number {
    const state = this.getBattleState(c);
    return c.attack * state.attackMultiplier * (1 + c.attackBuff / 100);
  }
  private getEffectiveDefense(c: CharacterData): number {
    const state = this.getBattleState(c);
    return c.defense * state.defenseMultiplier * (1 + c.defenseBuff / 100);
  }

  findUltimate(c: CharacterData): Skill | undefined {
    return c.skills.find((s) => s.isUltimate || s.type === 'ultimate');
  }

  /** 智能选择技能（自动模式用） */
  chooseSkill(attacker: CharacterData, defender: CharacterData): Skill {
    const ult = this.findUltimate(attacker);
    // 大招就绪：优先释放
    if (ult && attacker.ultimateCharge >= ULTIMATE_THRESHOLD) {
      return ult;
    }

    // HP 低于 35% 时，有治疗技能优先治疗
    if (attacker.hp / attacker.maxHp < 0.35) {
      const heal = attacker.skills.find((s) => s.type === 'heal');
      if (heal && Math.random() < 0.7) return heal;
    }

    // 30% 概率使用辅助技能（buff/debuff）
    const supportSkills = attacker.skills.filter(
      (s) => s.type === 'buff' || s.type === 'debuff',
    );
    if (supportSkills.length && Math.random() < 0.3) {
      const buff = supportSkills.find((s) => s.type === 'buff');
      if (buff && attacker.buffTurnsLeft === 0 && Math.random() < 0.5) return buff;
      const debuff = supportSkills.find((s) => s.type === 'debuff');
      if (debuff && defender.buffTurnsLeft === 0 && Math.random() < 0.5) return debuff;
    }

    // 50% 概率使用强力攻击技能
    const attackSkills = attacker.skills.filter(
      (s) => s.type === 'attack' && s.damageMultiplier > 1.2,
    );
    if (attackSkills.length && Math.random() < 0.5) {
      return attackSkills[Math.floor(Math.random() * attackSkills.length)];
    }

    // 默认普攻
    const normal = attacker.skills.find((s) => s.type === 'attack' && s.damageMultiplier <= 1.1);
    return normal || attacker.skills[0];
  }

  /** 处理 buff 回合递减 */
  private tickBuffs(c: CharacterData) {
    if (c.buffTurnsLeft > 0) {
      c.buffTurnsLeft--;
      if (c.buffTurnsLeft === 0) {
        c.attackBuff = 0;
        c.defenseBuff = 0;
      }
    }
  }

  /** 低血量狂暴倍率：HP 低于阈值时充能加速（绝地反击） */
  private getRageMultiplier(c: CharacterData): number {
    return c.hp / c.maxHp < LOW_HP_RAGE_THRESHOLD ? LOW_HP_RAGE_MULTIPLIER : 1;
  }

  /** 累加充能（带上限与可选倍率） */
  private addCharge(c: CharacterData, amount: number, multiplier = 1) {
    const gain = Math.floor(amount * multiplier * this.getBattleState(c).chargeMultiplier);
    if (gain > 0) {
      c.ultimateCharge = Math.min(ULTIMATE_THRESHOLD, c.ultimateCharge + gain);
    }
  }

  private rollDamageMultiplier(attacker: CharacterData, defender: CharacterData, isUlt: boolean): number {
    const state = this.getBattleState(attacker);
    const statGap = clamp((attacker.attack - defender.defense) / 180, -0.25, 0.4);
    const swing = state.damageSwing + (isUlt ? 0.18 : 0);
    const min = Math.max(0.28, 0.82 - swing * 0.75);
    const max = 1.32 + swing + statGap;
    return min + Math.random() * Math.max(0.05, max - min);
  }

  private rollFinisher(attacker: CharacterData, defender: CharacterData, skill: Skill, isUlt: boolean, isCrit: boolean): boolean {
    const state = this.getBattleState(attacker);
    const skillBonus = Math.max(0, skill.damageMultiplier - 1) * 0.012;
    const critBonus = isCrit ? 0.025 : 0;
    const ultBonus = isUlt ? 0.035 : 0;
    const desperateBonus = attacker.hp / attacker.maxHp < LOW_HP_RAGE_THRESHOLD ? 0.018 : 0;
    const weaponBonus = (attacker.critBonus || 0) / 1000;
    const chance = clamp(state.executeChance + skillBonus + critBonus + ultBonus + desperateBonus + weaponBonus, 0, 0.16);
    return Math.random() < chance;
  }

  private formatStateSummary(): string {
    return `临场状态：【${this.p1.name}】${this.p1BattleState.name}（${this.p1BattleState.description}）；【${this.p2.name}】${this.p2BattleState.name}（${this.p2BattleState.description}）。`;
  }

  /**
   * 执行单个技能（手动模式核心）。
   * attackerId 指定谁出手，skill 由调用方传入。
   * 返回这一步的结果（含日志、伤害、充能变化等）。
   */
  executeSkill(attackerId: 'player1' | 'player2', skill: Skill): SkillResult {
    const isP1 = attackerId === 'player1';
    const attacker = isP1 ? this.p1 : this.p2;
    const defender = isP1 ? this.p2 : this.p1;

    // 回合开始：基础充能 + 速度加成 + 低血量狂暴
    const speedBonus = Math.floor(attacker.speed * SPEED_CHARGE_FACTOR);
    const turnCharge = BASE_CHARGE_PER_TURN + speedBonus;
    this.addCharge(attacker, turnCharge, this.getRageMultiplier(attacker));
    this.tickBuffs(attacker);

    const isUlt = skill.type === 'ultimate' || skill.isUltimate;
    let logMessage = '';
    let damage: number | undefined;
    let heal: number | undefined;
    let isCrit = false;

    if (skill.type === 'heal') {
      const healSwing = 0.82 + Math.random() * (0.45 + this.getBattleState(attacker).damageSwing * 0.2);
      const healAmount = Math.floor(attacker.maxHp * (skill.healPercent || 20) / 100 * healSwing);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
      heal = healAmount;
      logMessage = `【${attacker.name}】释放了【${skill.name}】，恢复了 ${healAmount} 点生命！`;
    } else if (skill.type === 'buff') {
      const buffAmount = Math.floor((skill.buffPercent || 30) * (0.9 + Math.random() * 0.45));
      if (Math.random() < 0.5) {
        attacker.attackBuff = buffAmount;
      } else {
        attacker.defenseBuff = buffAmount;
      }
      attacker.buffTurnsLeft = skill.buffTurns || 2;
      logMessage = `【${attacker.name}】蓄力释放【${skill.name}】，自身战力提升 ${buffAmount}%！`;
    } else if (skill.type === 'debuff') {
      const debuffAmount = Math.floor((skill.buffPercent || 25) * (0.9 + Math.random() * 0.5));
      defender.attackBuff = -debuffAmount;
      defender.buffTurnsLeft = skill.buffTurns || 2;
      const baseDmg = this.getEffectiveAttack(attacker) * 0.5;
      const mitigatedDmg = baseDmg * (115 / (85 + this.getEffectiveDefense(defender) * 1.05));
      let actualDmg = Math.max(1, Math.floor(mitigatedDmg * this.rollDamageMultiplier(attacker, defender, false)));
      const isFinisher = this.rollFinisher(attacker, defender, skill, false, false);
      if (isFinisher) {
        actualDmg = Math.max(actualDmg, defender.hp);
      }
      defender.hp = Math.max(0, defender.hp - actualDmg);
      damage = actualDmg;
      logMessage = `【${attacker.name}】施放【${skill.name}】削弱对手 ${debuffAmount}%，并造成 ${actualDmg} 点伤害！${isFinisher ? '天命一击，直接击穿胜负线！' : ''}`;
    } else {
      // attack / ultimate
      const baseDamage = this.getEffectiveAttack(attacker) * skill.damageMultiplier;
      const mitigatedDamage = baseDamage * (115 / (85 + this.getEffectiveDefense(defender) * 1.05));
      const actualDamage = Math.max(1, Math.floor(mitigatedDamage * this.rollDamageMultiplier(attacker, defender, isUlt)));
      const critBonus = (attacker.critBonus || 0) / 100;
      const state = this.getBattleState(attacker);
      const baseCrit = isUlt ? 0.42 : 0.18;
      isCrit = Math.random() < Math.min(0.98, Math.max(0.02, baseCrit + critBonus + state.critChanceBonus));
      const critMultiplier = isUlt ? 2.25 + state.critDamageBonus : 1.65 + state.critDamageBonus;
      let finalDamage = isCrit ? Math.floor(actualDamage * critMultiplier) : actualDamage;
      const isFinisher = this.rollFinisher(attacker, defender, skill, isUlt, isCrit);
      if (isFinisher) {
        finalDamage = Math.max(finalDamage, defender.hp);
      }
      defender.hp = Math.max(0, defender.hp - finalDamage);
      damage = finalDamage;

      if (isUlt) {
        logMessage = `【${attacker.name}】爆气释放大招【${skill.name}】！${skill.description} 对【${defender.name}】造成毁灭性 ${finalDamage} 点伤害！${isFinisher ? '天命一击，一招定胜负！' : ''}`;
        attacker.ultimateCharge = 0;
      } else {
        logMessage = `【${attacker.name}】使出【${skill.name}】！${isCrit ? '触发暴击，' : ''}对【${defender.name}】造成 ${finalDamage} 点伤害。${isFinisher ? '天命一击，瞬间清场！' : ''}`;
      }
    }

    // 受击方充能：按承受伤害比例 + 低血量狂暴（肉盾/反击型角色充能更快）
    if (damage && defender.hp > 0) {
      this.addCharge(defender, damage * DAMAGE_TAKEN_CHARGE_FACTOR, this.getRageMultiplier(defender));
    }

    // 攻击方额外充能：造成伤害 + 暴击 + 技能类型加成（攻击型角色充能更快）
    if (!isUlt) {
      if (damage) {
        this.addCharge(attacker, damage * DAMAGE_DEALT_CHARGE_FACTOR);
      }
      if (isCrit) {
        this.addCharge(attacker, CRIT_CHARGE_BONUS);
      }
      const typeBonus = SKILL_TYPE_CHARGE_BONUS[skill.type] || 0;
      if (typeBonus > 0) {
        this.addCharge(attacker, typeBonus);
      }
    }

    const log: BattleEvent = {
      id: `turn-${this.instanceId}-${this.currentTurn}-${attackerId}`,
      turn: this.currentTurn,
      attacker: attackerId,
      message: logMessage,
      damage,
      heal,
      isCrit,
      isSkill: skill.type !== 'attack' || skill.damageMultiplier > 1.1,
      isUltimate: isUlt,
      skillName: skill.name,
      skillImageUrl: isUlt ? skill.imageUrl : undefined,
      ultimateType: isUlt ? skill.ultimateType : undefined,
      attackerName: attacker.name,
      attackerCharge: attacker.ultimateCharge,
      defenderCharge: defender.ultimateCharge,
    };

    this.logs.push(log);
    this.currentTurn++;

    return {
      log,
      damage,
      heal,
      isCrit,
      isUltimate: isUlt,
      attackerChargeAfter: attacker.ultimateCharge,
      defenderChargeAfter: defender.ultimateCharge,
    };
  }

  /** 判断是否大招可用 */
  canUseUltimate(c: CharacterData): boolean {
    return c.ultimateCharge >= ULTIMATE_THRESHOLD;
  }

  /** 判断战斗是否结束 */
  isBattleOver(): boolean {
    return this.p1.hp <= 0 || this.p2.hp <= 0;
  }

  getWinner(): 'player1' | 'player2' {
    return this.p1.hp > 0 ? 'player1' : 'player2';
  }

  /** 自动模拟整场战斗（自动模式用） */
  public simulateBattle(): { logs: BattleEvent[], winner: 'player1' | 'player2' } {
    this.logs.push({
      id: `turn-${this.instanceId}-0-start`,
      turn: 0,
      attacker: 'system',
      message: `战斗开始！【${this.p1.name}】 VS 【${this.p2.name}】`
    });
    this.logs.push({
      id: `turn-${this.instanceId}-0-state`,
      turn: 0,
      attacker: 'system',
      message: this.formatStateSummary(),
    });

    let p1Turn = this.p1.speed >= this.p2.speed;

    while (this.p1.hp > 0 && this.p2.hp > 0) {
      const attacker = p1Turn ? this.p1 : this.p2;
      const defender = p1Turn ? this.p2 : this.p1;
      const attackerId = p1Turn ? 'player1' : 'player2';

      const skill = this.chooseSkill(attacker, defender);
      this.executeSkill(attackerId, skill);

      if (defender.hp <= 0) {
        this.logs.push({
          id: `turn-${this.instanceId}-${this.currentTurn}-end`,
          turn: this.currentTurn,
          attacker: 'system',
          message: `【${defender.name}】倒下了！`
        });
        break;
      }

      p1Turn = !p1Turn;
      if (this.currentTurn > 100) break;
    }

    const winner = this.p1.hp > 0 ? 'player1' : 'player2';
    return { logs: this.logs, winner };
  }
}
