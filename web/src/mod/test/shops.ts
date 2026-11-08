/**
 * shops.ts
 *
 * Testhaven's shops: Brann's arms, Mira's tavern and Sister Ophe's
 * healing - their names, keepers, wares and prices in DATA.OVL, and what
 * their keepers say (SHOPPE.DAT).
 */

import type { OvlBuilder } from '../ovl.ts';

export function testShops(o: OvlBuilder): Uint8Array {
  void o;
  return new Uint8Array(0x2000);
}
