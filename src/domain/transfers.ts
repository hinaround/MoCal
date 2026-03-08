import type { Party, SettlementSummary, SettlementTransfer } from './types';

export interface TransferSuggestion extends SettlementTransfer {
  fromPartyName: string;
  toPartyName: string;
  sentence: string;
}

export function buildSettlementTransfers(params: {
  parties: Party[];
  summaries: SettlementSummary[];
}): TransferSuggestion[] {
  const partyNames = new Map(params.parties.map((party) => [party.id, party.name]));

  const payers = params.summaries
    .filter((summary) => summary.netCents < 0)
    .map((summary) => ({ partyId: summary.partyId, remainingCents: Math.abs(summary.netCents) }));

  const receivers = params.summaries
    .filter((summary) => summary.netCents > 0)
    .map((summary) => ({ partyId: summary.partyId, remainingCents: summary.netCents }));

  const transfers: TransferSuggestion[] = [];
  let payerIndex = 0;
  let receiverIndex = 0;

  while (payerIndex < payers.length && receiverIndex < receivers.length) {
    const payer = payers[payerIndex];
    const receiver = receivers[receiverIndex];
    const amountCents = Math.min(payer.remainingCents, receiver.remainingCents);

    transfers.push({
      fromPartyId: payer.partyId,
      toPartyId: receiver.partyId,
      amountCents,
      fromPartyName: partyNames.get(payer.partyId) ?? '未命名',
      toPartyName: partyNames.get(receiver.partyId) ?? '未命名',
      sentence: `${partyNames.get(payer.partyId) ?? '未命名'}补给${partyNames.get(receiver.partyId) ?? '未命名'} ${(
        amountCents / 100
      ).toFixed(2)} 元`,
    });

    payer.remainingCents -= amountCents;
    receiver.remainingCents -= amountCents;

    if (payer.remainingCents === 0) {
      payerIndex += 1;
    }

    if (receiver.remainingCents === 0) {
      receiverIndex += 1;
    }
  }

  return transfers;
}
