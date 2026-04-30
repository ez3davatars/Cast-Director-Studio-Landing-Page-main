/**
 * Shared credit cost constants — Deno-compatible.
 * Used by stripe-webhook fulfillment and frontend alike.
 */

/** Credit cost per generation resolution / type */
export const RESOLUTION_CREDIT_COST: Record<string, number> = {
  '1k': 1,
  '2k': 2,
  'character_sheet': 2,
  '4k': 6,
};

/** Monthly credit allotment by hosted plan key */
export const MONTHLY_CREDITS: Record<string, number> = {
  starter: 600,
  pro: 1200,
};

/** One-time credit pack amounts by product key */
export const CREDIT_PACK_AMOUNTS: Record<string, number> = {
  credit_pack_100: 100,
  credit_pack_500: 500,
};
