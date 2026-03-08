import { useState, type FormEvent } from 'react';
import type { MemberProfile } from '../domain/types';

interface MemberProfilesPanelProps {
  members: MemberProfile[];
  saving: boolean;
  onCreate: (input: { name: string; defaultHeadcount: number; note?: string }) => Promise<void>;
  onUpdate: (member: MemberProfile) => Promise<void>;
}

function MemberEditor(props: { member: MemberProfile; saving: boolean; onSave: (member: MemberProfile) => Promise<void> }) {
  const { member, saving, onSave } = props;
  const [name, setName] = useState(member.name);
  const [defaultHeadcount, setDefaultHeadcount] = useState(String(member.defaultHeadcount));
  const [note, setNote] = useState(member.note ?? '');
  const [active, setActive] = useState(member.active);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const headcount = Number(defaultHeadcount);
    if (!name.trim() || !Number.isInteger(headcount) || headcount <= 0) {
      return;
    }
    await onSave({
      ...member,
      name: name.trim(),
      defaultHeadcount: headcount,
      note: note.trim() || undefined,
      active,
    });
  }

  return (
    <form className="inline-card roster-editor" onSubmit={handleSubmit}>
      <label>
        <span>成员名称</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>默认人数</span>
        <input type="number" min="1" inputMode="numeric" value={defaultHeadcount} onChange={(event) => setDefaultHeadcount(event.target.value)} />
      </label>
      <label className="wide-field">
        <span>备注</span>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：这次带一个孩子" />
      </label>
      <label className="toggle-field">
        <span>当前启用</span>
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
      </label>
      <button className="secondary-button" type="submit" disabled={saving}>保存</button>
    </form>
  );
}

export function MemberProfilesPanel(props: MemberProfilesPanelProps) {
  const { members, saving, onCreate, onUpdate } = props;
  const [name, setName] = useState('');
  const [defaultHeadcount, setDefaultHeadcount] = useState('2');
  const [note, setNote] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const headcount = Number(defaultHeadcount);
    if (!name.trim() || !Number.isInteger(headcount) || headcount <= 0) {
      return;
    }
    await onCreate({
      name,
      defaultHeadcount: headcount,
      note: note || undefined,
    });
    setName('');
    setDefaultHeadcount('2');
    setNote('');
  }

  return (
    <section className="panel-card compact-top-gap">
      <div className="section-heading">
        <div>
          <h2>成员管理</h2>
          <p>成员是全局的。先把人录进来，后面记交款、拉进活动、看单家历史都可以直接点，不用反复手打。</p>
        </div>
      </div>

      <article className="inline-card">
        <strong>新增成员</strong>
        <form className="stack-form compact-top-gap" onSubmit={handleCreate}>
          <label>
            <span>成员名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：张家 / 王阿姨" />
          </label>
          <label>
            <span>默认人数</span>
            <input type="number" min="1" inputMode="numeric" value={defaultHeadcount} onChange={(event) => setDefaultHeadcount(event.target.value)} />
          </label>
          <label>
            <span>备注</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：平时 2 大 1 小" />
          </label>
          <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
            新建成员
          </button>
        </form>
      </article>

      <div className="section-heading compact-gap compact-top-gap">
        <div>
          <h3>成员列表</h3>
          <p>这里改的是全局成员资料。后面每次活动都能直接拿来用。</p>
        </div>
      </div>

      <div className="stack-list roster-list">
        {members.length === 0 ? (
          <article className="inline-card">
            <strong>还没有成员</strong>
            <p className="storage-note">先新增一个成员，后面就可以直接记交款，也可以把她加入某次活动。</p>
          </article>
        ) : (
          members.map((member) => <MemberEditor key={member.id} member={member} saving={saving} onSave={onUpdate} />)
        )}
      </div>
    </section>
  );
}
