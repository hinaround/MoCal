import { useEffect, useState, type FormEvent } from 'react';
import type { Party } from '../domain/types';

interface FamilyRosterPanelProps {
  parties: Party[];
  saving: boolean;
  onCreateParty: (input: { name: string; defaultHeadcount: number; note?: string }) => Promise<void>;
  onUpdateParty: (party: Party) => Promise<void>;
}

function PartyEditor(props: { party: Party; saving: boolean; onSave: (party: Party) => Promise<void> }) {
  const { party, saving, onSave } = props;
  const [name, setName] = useState(party.name);
  const [defaultHeadcount, setDefaultHeadcount] = useState(String(party.defaultHeadcount));
  const [note, setNote] = useState(party.note ?? '');
  const [active, setActive] = useState(party.active);

  useEffect(() => {
    setName(party.name);
    setDefaultHeadcount(String(party.defaultHeadcount));
    setNote(party.note ?? '');
    setActive(party.active);
  }, [party]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const headcount = Number(defaultHeadcount);

    if (!name.trim() || !Number.isInteger(headcount) || headcount <= 0) {
      return;
    }

    await onSave({
      ...party,
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
        <span>当前还参加</span>
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
      </label>
      <button className="secondary-button" type="submit" disabled={saving}>保存</button>
    </form>
  );
}

export function FamilyRosterPanel(props: FamilyRosterPanelProps) {
  const { parties, saving, onCreateParty, onUpdateParty } = props;
  const [name, setName] = useState('');
  const [defaultHeadcount, setDefaultHeadcount] = useState('2');
  const [note, setNote] = useState('');

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const headcount = Number(defaultHeadcount);

    if (!name.trim() || !Number.isInteger(headcount) || headcount <= 0) {
      return;
    }

    await onCreateParty({
      name,
      defaultHeadcount: headcount,
      note: note || undefined,
    });

    setName('');
    setDefaultHeadcount('2');
    setNote('');
  }

  return (
    <section className="panel-card">
      <div className="section-heading">
        <div>
          <h2>成员名单</h2>
          <p>名单只录一次，后面记账都从这里点选，不再反复手打人名。</p>
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
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：这次不住酒店" />
          </label>
          <button type="submit" className="primary-button" disabled={saving || !name.trim()}>
            加入当前账本
          </button>
        </form>
      </article>

      <div className="section-heading compact-gap compact-top-gap">
        <div>
          <h3>成员列表</h3>
          <p>可以修改名称、默认人数、备注，也可以先停用某家，但旧账不会变。</p>
        </div>
      </div>

      <div className="stack-list roster-list">
        {parties.map((party) => (
          <PartyEditor key={party.id} party={party} saving={saving} onSave={onUpdateParty} />
        ))}
      </div>
    </section>
  );
}
