import type { Weapon, WeaponRarity } from '../data/weapons';
import { WEAPONS } from '../data/weapons';

/** 稀有度权重（gacha 抽卡风格） */
const RARITY_WEIGHT: Record<WeaponRarity, number> = {
  common: 50,
  rare: 25,
  epic: 15,
  legendary: 8,
  mythic: 2,
};

/** 按权重抽取一种稀有度 */
const rollRarity = (): WeaponRarity => {
  const total = Object.values(RARITY_WEIGHT).reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (const [rarity, weight] of Object.entries(RARITY_WEIGHT) as [WeaponRarity, number][]) {
    r -= weight;
    if (r <= 0) return rarity;
  }
  return 'common';
};

/**
 * 随机抽取一把武器：先按权重决定稀有度，再在该稀有度内均匀抽一把。
 * 如果该稀有度没有武器（理论上不会），降级到 common。
 */
export const rollWeapon = (): Weapon => {
  let rarity = rollRarity();
  let pool = WEAPONS.filter((w) => w.rarity === rarity);
  if (pool.length === 0) {
    rarity = 'common';
    pool = WEAPONS.filter((w) => w.rarity === rarity);
  }
  if (pool.length === 0) pool = WEAPONS;
  return pool[Math.floor(Math.random() * pool.length)];
};
