import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { BackupOverview, BackupSnapshotRecord, LedgerBackupPayload } from '../storage/backupRepository';
import { parseBackupFile, summarizeBackupCounts } from '../storage/backupRepository';

interface BackupPanelProps {
  saving: boolean;
  overview: BackupOverview;
  snapshots: BackupSnapshotRecord[];
  onExport: () => Promise<void>;
  onImport: (payload: LedgerBackupPayload, fileName: string) => Promise<void>;
  onRestoreSnapshot: (snapshotId: string) => Promise<void>;
}

function formatDateTimeLabel(value?: string | null): string {
  if (!value) {
    return '还没有';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BackupPanel(props: BackupPanelProps) {
  const { saving, overview, snapshots, onExport, onImport, onRestoreSnapshot } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busyAction, setBusyAction] = useState<'export' | 'import' | `restore:${string}` | null>(null);
  const [error, setError] = useState('');
  const [importPreview, setImportPreview] = useState<{
    fileName: string;
    payload: LedgerBackupPayload;
    countSummary: string;
  } | null>(null);
  const [restorePreview, setRestorePreview] = useState<BackupSnapshotRecord | null>(null);

  const snapshotRows = useMemo(() => snapshots.slice(0, 5), [snapshots]);

  async function handleExport() {
    try {
      setBusyAction('export');
      setError('');
      await onExport();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导出备份失败，请再试一次');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setError('');
      const parsed = await parseBackupFile(file);
      setImportPreview({
        fileName: file.name,
        payload: parsed.payload,
        countSummary: summarizeBackupCounts(parsed.counts),
      });
      setRestorePreview(null);
    } catch (cause) {
      setImportPreview(null);
      setError(cause instanceof Error ? cause.message : '备份文件读取失败，请重新选择');
    } finally {
      event.target.value = '';
    }
  }

  async function handleConfirmImport() {
    if (!importPreview) {
      return;
    }

    try {
      setBusyAction('import');
      setError('');
      await onImport(importPreview.payload, importPreview.fileName);
      setImportPreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入备份失败，请再试一次');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmRestoreSnapshot() {
    if (!restorePreview) {
      return;
    }

    try {
      setBusyAction(`restore:${restorePreview.id}`);
      setError('');
      await onRestoreSnapshot(restorePreview.id);
      setRestorePreview(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '恢复本机记录失败，请再试一次');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="panel-card compact-top-gap">
      <div className="section-heading">
        <div>
          <h2>数据备份与恢复</h2>
          <p>每次正式入账后，系统会自动留下本机恢复点，只保留最近 12 次。真正防止换手机或清浏览器后丢数据，还是要手动导出备份文件。</p>
        </div>
      </div>

      <article className="inline-card current-trip-card">
        <strong>当前保存位置</strong>
        <p className="storage-note">当前数据保存在本设备当前浏览器中。刷新页面一般不会丢，但换手机、换浏览器、清除浏览器数据后不会自动回来。</p>
        <div className="backup-meta-grid">
          <div>
            <span>最近一次手动导出</span>
            <strong>{formatDateTimeLabel(overview.lastManualExportAt)}</strong>
          </div>
          <div>
            <span>最近一次本机恢复点</span>
            <strong>{formatDateTimeLabel(overview.lastAutoSnapshotAt)}</strong>
          </div>
          <div>
            <span>当前保留的恢复点</span>
            <strong>{overview.autoSnapshotCount} 份</strong>
          </div>
        </div>
        <div className="action-row home-shortcuts">
          <button type="button" className="primary-button" onClick={() => void handleExport()} disabled={saving || busyAction !== null}>
            {busyAction === 'export' ? '正在导出…' : '立即导出备份文件'}
          </button>
          <button type="button" className="ghost-button" onClick={() => fileInputRef.current?.click()} disabled={saving || busyAction !== null}>
            选择备份文件导入
          </button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden-file-input" onChange={(event) => void handleSelectFile(event)} />
        </div>
        <p className="storage-note">建议：每次集中录完账，或准备换设备前，点一次“立即导出备份文件”。</p>
        {error ? <p className="field-error">{error}</p> : null}
      </article>

      {importPreview ? (
        <article className="inline-card compact-top-gap backup-warning-card">
          <strong>准备导入这份备份</strong>
          <p className="storage-note">文件名：{importPreview.fileName}</p>
          <p className="storage-note">导出时间：{formatDateTimeLabel(importPreview.payload.exportedAt)}</p>
          <p className="storage-note">内容概览：{importPreview.countSummary}</p>
          <p className="warn-text">导入后会覆盖当前这台设备这一个浏览器里的活动、成员、入金和支出数据。</p>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => void handleConfirmImport()} disabled={saving || busyAction !== null}>
              {busyAction === 'import' ? '正在导入…' : '确认导入并覆盖本机数据'}
            </button>
            <button type="button" className="ghost-button" onClick={() => setImportPreview(null)} disabled={saving || busyAction !== null}>
              先取消
            </button>
          </div>
        </article>
      ) : null}

      {restorePreview ? (
        <article className="inline-card compact-top-gap backup-warning-card">
          <strong>准备恢复到这个时间点</strong>
          <p className="storage-note">恢复点：{restorePreview.label}</p>
          <p className="storage-note">保存时间：{formatDateTimeLabel(restorePreview.createdAt)}</p>
          <p className="storage-note">内容概览：{summarizeBackupCounts(restorePreview.counts)}</p>
          <p className="warn-text">恢复后，当前这台设备这个浏览器里的正式数据会回到当时状态。</p>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => void handleConfirmRestoreSnapshot()} disabled={saving || busyAction !== null}>
              {busyAction === `restore:${restorePreview.id}` ? '正在恢复…' : '确认恢复到这里'}
            </button>
            <button type="button" className="ghost-button" onClick={() => setRestorePreview(null)} disabled={saving || busyAction !== null}>
              先取消
            </button>
          </div>
        </article>
      ) : null}

      <div className="section-heading compact-gap compact-top-gap">
        <div>
          <h3>最近本机恢复点</h3>
          <p>这是自动留下的恢复点，只能救回这台设备这个浏览器里的数据，不等于导出文件备份。</p>
        </div>
      </div>

      <div className="stack-list">
        {snapshotRows.length === 0 ? (
          <article className="inline-card">
            <strong>还没有本机恢复点</strong>
            <p className="storage-note">等你正式新增、调整或作废一笔记录后，系统会自动留下一份本机恢复点。</p>
          </article>
        ) : (
          snapshotRows.map((snapshot) => (
            <article key={snapshot.id} className="inline-card compact-row backup-row">
              <div>
                <strong>{snapshot.label}</strong>
                <span>{formatDateTimeLabel(snapshot.createdAt)} · {summarizeBackupCounts(snapshot.counts)}</span>
              </div>
              <button
                type="button"
                className="ghost-button small-button"
                onClick={() => {
                  setRestorePreview(snapshot);
                  setImportPreview(null);
                  setError('');
                }}
                disabled={saving || busyAction !== null}
              >
                恢复到这里
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
