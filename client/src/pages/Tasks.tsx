import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import FollowUpPicker from '../components/FollowUpPicker';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate, cn } from '../lib/utils';
import { useAuthStore } from '../store/auth';

interface Task {
  id: string; lead_id: string | null; call_id: string | null; user_id: string; user_name: string;
  title: string; due_date: string | null; completed: number; created_at: string;
}

export default function Tasks() {
  const { isManager } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', due_date: '', user_id: '' });
  const [editing, setEditing] = useState<Task | null>(null);
  const [filter, setFilter] = useState<'pending' | 'completed' | 'overdue'>('pending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    const completed = filter === 'completed' ? 'true' : 'false';
    api.get<Task[]>(`/tasks?completed=${completed}`).then(data => {
      if (filter === 'overdue') {
        const today = new Date().toISOString().slice(0, 10);
        setTasks(data.filter(t => t.due_date && t.due_date < today));
      } else {
        setTasks(data);
      }
    });
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { if (isManager()) api.get<any[]>('/users').then(setUsers); }, []);

  const toggle = async (task: Task) => {
    await api.put(`/tasks/${task.id}`, { completed: !task.completed });
    load();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (editing) await api.put(`/tasks/${editing.id}`, form);
      else await api.post('/tasks', form);
      setShowModal(false); load();
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const openEdit = (t: Task) => {
    setEditing(t); setForm({ title: t.title, due_date: t.due_date || '', user_id: t.user_id }); setShowModal(true);
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = tasks.filter(t => t.due_date && t.due_date < today && !t.completed).length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">✅ Tasks & Follow-ups</h1>
        <button className="btn-primary" onClick={() => { setEditing(null); setForm({ title: '', due_date: '', user_id: '' }); setShowModal(true); }}>+ Add Task</button>
      </div>

      {overdueCount > 0 && filter !== 'overdue' && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer" onClick={() => setFilter('overdue')}>
          <span className="text-lg">⚠️</span>
          <span className="font-medium">{overdueCount} overdue task{overdueCount !== 1 ? 's' : ''}!</span>
          <span className="text-sm text-red-500 hover:underline">View →</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex border border-gray-200 rounded-xl overflow-hidden w-fit">
        {(['pending', 'overdue', 'completed'] as const).map(f => (
          <button key={f} className={cn('px-4 py-2 text-sm capitalize', filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')} onClick={() => setFilter(f)}>
            {f} {f === 'overdue' && overdueCount > 0 ? `(${overdueCount})` : ''}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {tasks.map(task => {
          const isOverdue = task.due_date && task.due_date < today && !task.completed;
          return (
            <div key={task.id} className={cn('card flex items-start gap-4', isOverdue && 'border-red-200 bg-red-50')}>
              <button
                onClick={() => toggle(task)}
                className={cn('mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                  task.completed ? 'bg-green-500 border-green-500 text-white' : (isOverdue ? 'border-red-400' : 'border-gray-300 hover:border-blue-400')
                )}
              >
                {task.completed && <span className="text-xs">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={cn('font-medium', task.completed ? 'line-through text-gray-400' : '')}>{task.title}</p>
                <p className={cn('text-xs mt-0.5', isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                  {task.due_date ? `Due: ${formatDate(task.due_date)}` : 'No due date'} · {task.user_name}
                </p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button className="btn-ghost text-xs px-2 py-1" onClick={() => openEdit(task)}>Edit</button>
                <button className="btn-ghost text-xs px-2 py-1 text-red-500 hover:bg-red-100" onClick={() => setDeleteId(task.id)}>Del</button>
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p>No {filter} tasks.</p>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Task' : 'Add Task'} size="sm">
        {error && <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Task *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="e.g. Send proposal to ABC Corp" /></div>
          <FollowUpPicker label="When to follow up" value={form.due_date} onChange={due_date => setForm(f => ({ ...f, due_date }))} />
          {isManager() && (
            <div><label className="label">Assign To</label>
              <select className="select" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">— Self —</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? '…' : editing ? 'Update' : 'Add Task'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={async () => { await api.del(`/tasks/${deleteId}`); load(); }} title="Delete Task" message="Delete this task?" confirmLabel="Delete" danger />
    </div>
  );
}
