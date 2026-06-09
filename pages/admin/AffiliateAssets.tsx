import React, { useEffect, useState, useCallback } from 'react';
import { Copy, Edit3, FileText, Loader2, Plus, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ASSET_TYPES = ['banner', 'copy', 'email_template', 'logo', 'other'];

const emptyForm = {
  title: '',
  type: 'copy',
  description: '',
  public_url: '',
  storage_path: '',
  width: '',
  height: '',
  is_active: true,
};

const AffiliateAssetsAdmin: React.FC = () => {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('affiliate_assets')
        .select('id, title, type, description, storage_path, public_url, width, height, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setAssets(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load affiliate assets.');
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const openCreate = () => {
    setEditingAsset(null);
    setForm(emptyForm);
    setSaveError(null);
    setIsEditorOpen(true);
  };

  const openEdit = (asset: any) => {
    setEditingAsset(asset);
    setForm({
      title: asset.title || '',
      type: asset.type || 'copy',
      description: asset.description || '',
      public_url: asset.public_url || '',
      storage_path: asset.storage_path || '',
      width: asset.width ? String(asset.width) : '',
      height: asset.height ? String(asset.height) : '',
      is_active: asset.is_active !== false,
    });
    setSaveError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingAsset(null);
    setSaveError(null);
  };

  const saveAsset = async () => {
    const title = form.title.trim();
    if (!title) {
      setSaveError('Title is required.');
      return;
    }
    if (!ASSET_TYPES.includes(form.type)) {
      setSaveError('Choose a valid asset type.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        title,
        type: form.type,
        description: form.description.trim() || null,
        public_url: form.public_url.trim() || null,
        storage_path: form.storage_path.trim() || null,
        width: form.width ? Number(form.width) : null,
        height: form.height ? Number(form.height) : null,
        is_active: form.is_active,
      };

      const { error: err } = editingAsset
        ? await supabase.from('affiliate_assets').update(payload).eq('id', editingAsset.id)
        : await supabase.from('affiliate_assets').insert([payload]);

      if (err) throw err;
      closeEditor();
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save affiliate asset.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (asset: any) => {
    const { error: err } = await supabase
      .from('affiliate_assets')
      .update({ is_active: !asset.is_active })
      .eq('id', asset.id);
    if (err) {
      setError(err.message);
      return;
    }
    setAssets(prev => prev.map(row => row.id === asset.id ? { ...row, is_active: !asset.is_active } : row));
  };

  const copyValue = async (asset: any) => {
    const value = asset.public_url || asset.description || asset.storage_path || '';
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedId(asset.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-wide">Affiliate Assets</h2>
          <p className="text-sm text-nano-text mt-1">Manage public URLs and copy assets available to active affiliates.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded border border-nano-yellow/30 bg-nano-yellow/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20"
        >
          <Plus size={14} /> New Asset
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-4 text-sm font-mono text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded bg-white/5" />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-nano-border bg-black p-12 text-center">
          <FileText size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm italic text-gray-500">No affiliate assets yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-nano-border bg-black overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-nano-border bg-black/40 text-[10px] uppercase tracking-widest text-nano-text">
                <th className="p-4">Title</th>
                <th className="p-4">Type</th>
                <th className="p-4">URL / Storage</th>
                <th className="p-4">Status</th>
                <th className="p-4">Updated</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id} className="border-b border-nano-border/50 hover:bg-white/5">
                  <td className="p-4">
                    <div className="font-bold text-white">{asset.title}</div>
                    {asset.description && <div className="mt-1 max-w-[260px] truncate text-xs text-nano-text">{asset.description}</div>}
                  </td>
                  <td className="p-4 text-xs uppercase tracking-wider text-nano-text">{asset.type}</td>
                  <td className="p-4 text-xs font-mono text-nano-text max-w-[260px] truncate" title={asset.public_url || asset.storage_path || ''}>
                    {asset.public_url || asset.storage_path || '-'}
                  </td>
                  <td className="p-4">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${asset.is_active ? 'border-green-400/30 bg-green-400/10 text-green-400' : 'border-nano-border bg-white/5 text-nano-text'}`}>
                      {asset.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-[11px] font-mono text-nano-text">
                    {asset.updated_at ? new Date(asset.updated_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => copyValue(asset)}
                        disabled={!asset.public_url && !asset.description && !asset.storage_path}
                        className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white disabled:opacity-40"
                        title="Copy URL or copy text"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(asset)}
                        className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
                        title="Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(asset)}
                        className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
                        title={asset.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {asset.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                    {copiedId === asset.id && <div className="mt-1 text-[10px] text-green-400">Copied</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-nano-border bg-nano-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-nano-border px-5 py-4">
              <span className="text-sm font-bold uppercase tracking-widest text-white">{editingAsset ? 'Edit Asset' : 'New Asset'}</span>
              <button onClick={closeEditor} disabled={saving} className="text-nano-text hover:text-white disabled:opacity-50">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Title</label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                >
                  {ASSET_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Public URL</label>
                <input
                  value={form.public_url}
                  onChange={e => setForm(f => ({ ...f, public_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-nano-yellow focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Storage Path</label>
                <input
                  value={form.storage_path}
                  onChange={e => setForm(f => ({ ...f, storage_path: e.target.value }))}
                  placeholder="affiliate-assets/banner.png"
                  className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-nano-yellow focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Description / Copy Body</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={4}
                  className="w-full resize-none rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Width</label>
                  <input
                    type="number"
                    value={form.width}
                    onChange={e => setForm(f => ({ ...f, width: e.target.value }))}
                    className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Height</label>
                  <input
                    type="number"
                    value={form.height}
                    onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                    className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-nano-text">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="accent-yellow-400"
                />
                Active and visible to active affiliates
              </label>
              {saveError && <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs font-mono text-red-400">{saveError}</div>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={closeEditor}
                  disabled={saving}
                  className="rounded border border-nano-border px-4 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAsset}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded border border-nano-yellow/30 bg-nano-yellow/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save Asset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AffiliateAssetsAdmin;
