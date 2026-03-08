import { buildExpenseConfirmationSentence, buildTailRuleSentence, validateExpenseDraft } from '../validation';

describe('validateExpenseDraft', () => {
  it('会拦截短标题为空、金额为空和未选参与人', () => {
    const issues = validateExpenseDraft({
      title: '',
      amountCents: null,
      payerKind: 'party',
      payerPartyId: undefined,
      shareMode: 'by_party',
      participants: [],
      poolBalanceCents: 0,
      partyNamesById: new Map(),
    });

    expect(issues.map((item) => item.message)).toEqual([
      '请先写这笔花费的短标题',
      '请先填写金额',
      '这笔是谁先付的，还没选',
      '这笔还没选谁参加',
    ]);
  });

  it('会拦截公账余额不够的花费', () => {
    const issues = validateExpenseDraft({
      title: '景区门票',
      amountCents: 12000,
      payerKind: 'pool',
      shareMode: 'by_headcount',
      participants: [{ partyId: 'zhang', headcountSnapshot: 2 }],
      poolBalanceCents: 10000,
      partyNamesById: new Map([['zhang', '张家']]),
    });

    expect(issues.map((item) => item.message)).toContain('大家先收的钱不够支付这笔，请改成某家先垫，或先记一笔收款');
  });

  it('会输出普通人能看懂的确认文案和尾差说明', () => {
    const sentence = buildExpenseConfirmationSentence({
      title: '西山晚饭',
      amountCents: 36000,
      payerKind: 'party',
      payerPartyId: 'zhang',
      shareMode: 'by_party',
      participants: [
        { partyId: 'zhang', headcountSnapshot: 2 },
        { partyId: 'li', headcountSnapshot: 3 },
      ],
      poolBalanceCents: 0,
      partyNamesById: new Map([
        ['zhang', '张家'],
        ['li', '李家'],
      ]),
    });

    const tailSentence = buildTailRuleSentence({
      parties: [
        { id: 'zhang', tripId: 'trip-1', name: '张家', defaultHeadcount: 2, sortOrder: 0, active: true },
        { id: 'li', tripId: 'trip-1', name: '李家', defaultHeadcount: 3, sortOrder: 1, active: true },
      ],
      participants: [
        { partyId: 'zhang', tailDeltaCents: 1 },
        { partyId: 'li', tailDeltaCents: 0 },
      ],
    });

    expect(sentence).toBe('“西山晚饭”这笔 360.00 元，先由张家垫上，张家、李家一起出，按参加的家数平分。');
    expect(tailSentence).toBe('这笔不能整分，按固定名单顺序补尾差：张家 +0.01元。');
  });
});
