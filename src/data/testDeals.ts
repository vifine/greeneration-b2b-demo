import TEST_DEALS from './testDeals.json';

/** Demo orders are mirrored as deals in the Bitrix24 «Portal · TEST» pipeline; the order number is the Bitrix24 deal ID. */
const DEAL_NO = TEST_DEALS as Record<string, number>;
export const dealNo = (demoId: string) => String(DEAL_NO[demoId] ?? demoId);
export const isTestDeal = (id: string) => Object.values(DEAL_NO).some((v) => String(v) === id);
