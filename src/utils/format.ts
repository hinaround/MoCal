export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatSignedCurrency(cents: number): string {
  return `${cents >= 0 ? '+' : '-'}${formatCurrency(Math.abs(cents))}`;
}

function parseDateParts(dateInput: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function formatDateLabel(dateInput?: string): string {
  if (!dateInput) {
    return '未填写日期';
  }

  const parts = parseDateParts(dateInput);

  if (!parts) {
    return dateInput;
  }

  return `${parts.month}月${parts.day}日`;
}

export function formatDateRange(startDate?: string, endDate?: string): string {
  if (startDate && endDate) {
    return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
  }

  if (startDate) {
    return `${formatDateLabel(startDate)} 开始`;
  }

  if (endDate) {
    return `到 ${formatDateLabel(endDate)}`;
  }

  return '日期未填写';
}

export function todayInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(/[￥元,\s]/g, '');

  if (!normalized) {
    return null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const [whole, fraction = ''] = normalized.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

export function formatNetLabel(cents: number): string {
  if (cents > 0) {
    return `如现在清账，可退回 ${formatCurrency(cents)}`;
  }

  if (cents < 0) {
    return `如现在清账，还需补 ${formatCurrency(Math.abs(cents))}`;
  }

  return '如现在清账，正好持平';
}

export function formatBalanceLabel(cents: number): string {
  if (cents > 0) {
    return `余额充足 ${formatCurrency(cents)}`;
  }

  if (cents < 0) {
    return `余额不足 ${formatCurrency(Math.abs(cents))}`;
  }

  return '余额正好';
}

export function formatRecordStatus(status: 'posted' | 'void'): string {
  return status === 'posted' ? '正式入账' : '已作废';
}
