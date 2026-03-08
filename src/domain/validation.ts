import type { ExpensePayerKind, Party, ShareMode } from './types';

export interface DraftIssue {
  level: 'error' | 'confirm';
  message: string;
}

export interface ExpenseDraftInput {
  title?: string;
  amountCents: number | null;
  payerKind: ExpensePayerKind;
  payerPartyId?: string;
  shareMode: ShareMode;
  participants: Array<{ partyId: string; headcountSnapshot: number }>;
  poolBalanceCents: number;
  partyNamesById: Map<string, string>;
}

export interface DepositDraftInput {
  amountCents: number | null;
  partyId?: string;
}

export function buildExpenseConfirmationSentence(input: ExpenseDraftInput): string {
  const payerLabel =
    input.payerKind === 'pool'
      ? '从公账支出'
      : `先由${input.partyNamesById.get(input.payerPartyId ?? '') ?? '未选择'}代付`;
  const participantLabel = input.participants
    .map((participant) => input.partyNamesById.get(participant.partyId) ?? '未命名')
    .join('、');
  const shareLabel = input.shareMode === 'by_party' ? '按参加的家数平分' : '按实际到场人数分';
  const amountLabel = ((input.amountCents ?? 0) / 100).toFixed(2);
  const titlePrefix = input.title?.trim() ? `“${input.title.trim()}”这笔支出 ` : '这笔支出 ';

  return `${titlePrefix}${amountLabel} 元，${payerLabel}，由 ${participantLabel} 一起分，${shareLabel}。`;
}

export function validateExpenseDraft(input: ExpenseDraftInput): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!input.title?.trim()) {
    issues.push({ level: 'error', message: '请先写这笔支出的短标题' });
  }

  if (input.amountCents === null) {
    issues.push({ level: 'error', message: '请先填写金额' });
  } else if (!Number.isInteger(input.amountCents)) {
    issues.push({ level: 'error', message: '金额格式不对，请重新填写' });
  } else if (input.amountCents <= 0) {
    issues.push({ level: 'error', message: '金额必须大于 0' });
  }

  if (input.payerKind === 'party' && !input.payerPartyId) {
    issues.push({ level: 'error', message: '这笔是谁先付的，还没选' });
  }

  if (input.participants.length === 0) {
    issues.push({ level: 'error', message: '这笔还没选谁参加' });
  }

  if (input.shareMode === 'by_headcount') {
    for (const participant of input.participants) {
      if (!Number.isInteger(participant.headcountSnapshot) || participant.headcountSnapshot <= 0) {
        issues.push({ level: 'error', message: '你选了按人数分，但还没填这次来了几个人' });
        break;
      }
    }
  }

  if (
    input.payerKind === 'pool' &&
    input.amountCents !== null &&
    input.amountCents > input.poolBalanceCents
  ) {
    issues.push({
      level: 'error',
      message: '公账余额不够支付这笔，请改成某家代付，或先记一笔成员入金',
    });
  }

  if (input.payerKind === 'party' && input.participants.length > 0 && input.payerPartyId) {
    const payerName = input.partyNamesById.get(input.payerPartyId) ?? '这家';
    issues.push({
      level: 'confirm',
      message: `请确认：这笔是先由${payerName}代付，再按规则分给参加的人。`,
    });
  }

  return issues;
}

export function validateDepositDraft(input: DepositDraftInput): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!input.partyId) {
    issues.push({ level: 'error', message: '请先选哪一家入金' });
  }

  if (input.amountCents === null) {
    issues.push({ level: 'error', message: '请先填写金额' });
  } else if (!Number.isInteger(input.amountCents)) {
    issues.push({ level: 'error', message: '金额格式不对，请重新填写' });
  } else if (input.amountCents <= 0) {
    issues.push({ level: 'error', message: '金额必须大于 0' });
  }

  return issues;
}

export function buildTailRuleSentence(params: {
  parties: Party[];
  participants: Array<{ partyId: string; tailDeltaCents?: number }>;
}): string {
  const sortOrderById = new Map(params.parties.map((party) => [party.id, party.sortOrder]));
  const namesById = new Map(params.parties.map((party) => [party.id, party.name]));
  const receivers = [...params.participants]
    .filter((participant) => (participant.tailDeltaCents ?? 0) > 0)
    .sort(
      (left, right) =>
        (sortOrderById.get(left.partyId) ?? Number.MAX_SAFE_INTEGER) -
        (sortOrderById.get(right.partyId) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((participant) => `${namesById.get(participant.partyId) ?? '未命名'} +${((participant.tailDeltaCents ?? 0) / 100).toFixed(2)}元`);

  if (receivers.length === 0) {
    return '这笔刚好能整分，不需要补尾差。';
  }

  return `这笔不能整分，按固定名单顺序补尾差：${receivers.join('，')}。`;
}
