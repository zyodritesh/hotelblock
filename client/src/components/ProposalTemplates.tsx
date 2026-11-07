import React, { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Section { id: string; name: string; sort_order: number; active: number; }
interface ItemTemplate { id: string; section_id: string; section_name: string; description: string; default_rate: number; }
interface TermsTemplate { id: string; name: string; body: string; is_default: number; }

export default function ProposalTemplates() {
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<ItemTemplate[]>([]);
  const [terms, setTerms] = useState<TermsTemplate[]>([]);
  const [sectionName, setSectionName] = useState('');
  const [itemForm, setItemForm] = useState({ section_id: '', description: '', default_rate: 0 });
  const [termsForm, setTermsForm] = useState<Partial<TermsTemplate> | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    const data = await api.get<{ sections: Section[]; items: ItemTemplate[]; terms: TermsTemplate[] }>('/catalog');
    setSections(data.sections);
    setItems(data.items);
    setTerms(data.terms);
    if (!itemForm.section_id && data.sections[0]) setItemForm(f => ({ ...f, section_id: data.sections[0].id }));
  };

  useEffect(() => { load().catch(e => setError(e.message)); }, []);

  const addSection = async () => {
    if (!sectionName.trim()) return;
    await api.post('/catalog/sections', { name: sectionName.trim() });
    setSectionName('');
    load();
  };

  const addItem = async () => {
    if (!itemForm.description.trim() || !itemForm.section_id) return;
    await api.post('/catalog/items', itemForm);
    setItemForm(f => ({ ...f, description: '', default_rate: 0 }));
    load();
  };

  const saveTerms = async () => {
    if (!termsForm?.name?.trim()) return;
    if (termsForm.id) await api.put(`/catalog/terms/${termsForm.id}`, termsForm);
    else await api.post('/catalog/terms', termsForm);
    setTermsForm(null);
    load();
  };

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-1">Proposal sections</h2>
        <p className="text-xs text-gray-500 mb-4">These names appear in every proposal. Rename or add a section here. Existing proposals keep the name they were saved with.</p>
        <div className="space-y-2 mb-3">
          {sections.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <input className="input w-20 text-center" type="number" defaultValue={s.sort_order}
                onBlur={e => api.put(`/catalog/sections/${s.id}`, { sort_order: Number(e.target.value) }).then(load)} />
              <input className="input flex-1" defaultValue={s.name}
                onBlur={e => { if (e.target.value.trim() && e.target.value !== s.name) api.put(`/catalog/sections/${s.id}`, { name: e.target.value.trim() }).then(load); }} />
              <button className="btn-ghost text-xs text-red-500" onClick={() => api.del(`/catalog/sections/${s.id}`).then(load)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input max-w-xs" placeholder="New section name" value={sectionName} onChange={e => setSectionName(e.target.value)} />
          <button className="btn-primary" onClick={addSection}>Add section</button>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-1">Description templates</h2>
        <p className="text-xs text-gray-500 mb-4">Picking a description on a proposal fills the line and its rate. The rate can still be changed on that proposal.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <select className="select w-48" value={itemForm.section_id} onChange={e => setItemForm(f => ({ ...f, section_id: e.target.value }))}>
            {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="input flex-1 min-w-[200px]" placeholder="Description" value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} />
          <input className="input w-32" type="number" placeholder="Rate" value={itemForm.default_rate || ''} onChange={e => setItemForm(f => ({ ...f, default_rate: Number(e.target.value) || 0 }))} />
          <button className="btn-primary" onClick={addItem}>Add</button>
        </div>
        <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded w-36 truncate">{item.section_name}</span>
              <span className="flex-1">{item.description}</span>
              <span className="text-gray-500 w-24 text-right">₹{item.default_rate.toLocaleString('en-IN')}</span>
              <button className="text-xs text-red-500" onClick={() => api.del(`/catalog/items/${item.id}`).then(load)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-800">Terms & conditions templates</h2>
          <button className="btn-primary text-sm" onClick={() => setTermsForm({ name: '', body: '', is_default: 0 })}>+ New template</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">A template fills a new proposal. Editing the text on a proposal does not change the template, and editing the template does not change proposals already saved.</p>
        <div className="space-y-2">
          {terms.map(t => (
            <div key={t.id} className="border border-gray-200 rounded-lg p-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-sm">{t.name} {t.is_default ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded ml-1">Default</span> : null}</div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2 whitespace-pre-line">{t.body}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button className="btn-ghost text-xs" onClick={() => setTermsForm(t)}>Edit</button>
                {!t.is_default && <button className="btn-ghost text-xs" onClick={() => api.put(`/catalog/terms/${t.id}`, { is_default: true }).then(load)}>Set default</button>}
                <button className="btn-ghost text-xs text-red-500" onClick={() => api.del(`/catalog/terms/${t.id}`).then(load)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {termsForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="font-bold text-lg mb-4">{termsForm.id ? 'Edit terms template' : 'New terms template'}</h3>
            <label className="label">Template name</label>
            <input className="input mb-3" value={termsForm.name || ''} onChange={e => setTermsForm(f => ({ ...f, name: e.target.value }))} />
            <label className="label">Terms & conditions</label>
            <textarea className="input font-mono text-sm" rows={16} value={termsForm.body || ''} onChange={e => setTermsForm(f => ({ ...f, body: e.target.value }))} />
            <label className="flex items-center gap-2 mt-3 text-sm">
              <input type="checkbox" checked={!!termsForm.is_default} onChange={e => setTermsForm(f => ({ ...f, is_default: e.target.checked ? 1 : 0 }))} />
              Use as the default for new proposals
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setTermsForm(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveTerms}>Save template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
