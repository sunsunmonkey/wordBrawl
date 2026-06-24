import { CharacterData, BattleEvent } from '../store/useGameStore';

export class BattleEngine {
  private p1: CharacterData;
  private p2: CharacterData;
  private currentTurn: number = 1;
  private logs: BattleEvent[] = [];

  constructor(p1: CharacterData, p2: CharacterData) {
    this.p1 = JSON.parse(JSON.stringify(p1)); // deep copy
    this.p2 = JSON.parse(JSON.stringify(p2));
  }

  public simulateBattle(): { logs: BattleEvent[], winner: 'player1' | 'player2' } {
    this.logs.push({
      id: `turn-0-start`,
      turn: 0,
      attacker: 'system',
      message: `战斗开始！【${this.p1.name}】 VS 【${this.p2.name}】`
    });

    let p1Turn = this.p1.speed >= this.p2.speed;

    while (this.p1.hp > 0 && this.p2.hp > 0) {
      const attacker = p1Turn ? this.p1 : this.p2;
      const defender = p1Turn ? this.p2 : this.p1;
      const attackerId = p1Turn ? 'player1' : 'player2';

      // 决定使用普攻还是技能 (30% 概率使用特殊技能)
      const useSkill = Math.random() < 0.3 && attacker.skills.length > 1;
      const skill = useSkill ? attacker.skills[1] : attacker.skills[0];

      // 计算伤害
      const baseDamage = attacker.attack * skill.damageMultiplier;
      // 防御减伤公式: 伤害 = 基础伤害 * (100 / (100 + 防御))
      const actualDamage = Math.max(1, Math.floor(baseDamage * (100 / (100 + defender.defense))));
      
      const isCrit = Math.random() < 0.15; // 15% 暴击率
      const finalDamage = isCrit ? Math.floor(actualDamage * 1.5) : actualDamage;

      defender.hp = Math.max(0, defender.hp - finalDamage);

      const actionText = useSkill 
        ? `发动了专属技能【${skill.name}】！`
        : `使出了【${skill.name}】！`;
        
      const critText = isCrit ? ' 触发了暴击，' : '';

      this.logs.push({
        id: `turn-${this.currentTurn}-${attackerId}`,
        turn: this.currentTurn,
        attacker: attackerId,
        message: `【${attacker.name}】${actionText}${critText}对【${defender.name}】造成了 ${finalDamage} 点伤害。`,
        damage: finalDamage,
        isCrit,
        isSkill: useSkill
      });

      if (defender.hp <= 0) {
        this.logs.push({
          id: `turn-${this.currentTurn}-end`,
          turn: this.currentTurn,
          attacker: 'system',
          message: `【${defender.name}】倒下了！`
        });
        break;
      }

      p1Turn = !p1Turn; // 交换回合
      this.currentTurn++;
      
      // 防止死循环
      if (this.currentTurn > 100) break;
    }

    const winner = this.p1.hp > 0 ? 'player1' : 'player2';
    
    return {
      logs: this.logs,
      winner
    };
  }
}
