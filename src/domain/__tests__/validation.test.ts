import { buildAllocationBreakdownSentence, buildExpenseConfirmationSentence, buildTailRuleSentence, validateExpenseDraft } from '../validation';

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
      '请先写这笔支出的短标题',
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

    expect(issues.map((item) => item.message)).toContain('公账余额不够支付这笔，请改成某家代付，或先记一笔成员交款');
  });

  it('按家平分但人数不一致时，会明确提醒不是按人头算', () => {
    const issues = validateExpenseDraft({
      title: '西山晚饭',
      amountCents: 36000,
      payerKind: 'party',
      payerPartyId: 'zhang',
      shareMode: 'by_party',
      participants: [
        { partyId: 'zhang', headcountSnapshot: 2 },
        { partyId: 'li', headcountSnapshot: 3 },
        { partyId: 'wang', headcountSnapshot: 1 },
      ],
      poolBalanceCents: 0,
      partyNamesById: new Map([
        ['zhang', '张家'],
        ['li', '李家'],
        ['wang', '王阿姨'],
      ]),
    });

    expect(issues.filter((item) => item.level === 'confirm').map((item) => item.message)).toContain(
      '注意：你现在选的是“按家数平分”，不会按人数算。当前是 张家 2人、李家 3人、王阿姨 1人，如果想按人头分，请改成“按实际到场人数分”。',
    );
  });


  it('会输出一眼看懂的按人数分说明', () => {
    const sentence = buildAllocationBreakdownSentence({
      shareMode: 'by_headcount',
      allocations: [
        { partyId: 'zhang', headcountSnapshot: 2, shareAmountCents: 12000 },
        { partyId: 'li', headcountSnapshot: 3, shareAmountCents: 18000 },
        { partyId: 'wang', headcountSnapshot: 1, shareAmountCents: 6000 },
      ],
      partyNamesById: new Map([
        ['zhang', '张家'],
        ['li', '李家'],
        ['wang', '王阿姨'],
      ]),
    });

    expect(sentence).toBe('张家 2 人分 120 元，李家 3 人分 180 元，王阿姨 1 人分 60 元');
  });

  it('会输出一眼看懂的按家平分说明', () => {
    const sentence = buildAllocationBreakdownSentence({
      shareMode: 'by_party',
      allocations: [
        { partyId: 'zhang', headcountSnapshot: 2, shareAmountCents: 12000 },
        { partyId: 'li', headcountSnapshot: 3, shareAmountCents: 12000 },
        { partyId: 'wang', headcountSnapshot: 1, shareAmountCents: 12000 },
      ],
      partyNamesById: new Map([
        ['zhang', '张家'],
        ['li', '李家'],
        ['wang', '王阿姨'],
      ]),
    });

    expect(sentence).toBe('张家、李家、王阿姨 每家各分 120 元');
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

    expect(sentence).toBe('“西山晚饭”这笔支出 360.00 元，先由张家代付，由 张家、李家 一起分，按参加的家数平分。');
    expect(tailSentence).toBe('这笔不能整分，按固定名单顺序补尾差：张家 +0.01元。');
  });
});
