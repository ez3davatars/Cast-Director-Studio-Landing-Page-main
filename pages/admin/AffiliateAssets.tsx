import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Copy,
  Download,
  Edit3,
  FileText,
  Grid2X2,
  Link as LinkIcon,
  List,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const BUCKET = 'affiliate-assets';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ASSET_TYPES = ['banner', 'logo', 'copy', 'email_template', 'social_post', 'other'];
const FILE_OPTIONAL_TYPES = new Set(['copy', 'email_template', 'social_post']);
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'text/plain',
]);

const emptyForm = {
  title: '',
  type: 'banner',
  description: '',
  copy_body: '',
  width: '',
  height: '',
  is_active: true,
};

const STATUS_FILTERS = ['all', 'active', 'inactive', 'archived'] as const;
const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Newest updated' },
  { value: 'updated_asc', label: 'Oldest updated' },
  { value: 'title_asc', label: 'Title A → Z' },
  { value: 'title_desc', label: 'Title Z → A' },
];

const isImageMime = (mime?: string | null) => Boolean(mime?.startsWith('image/'));
const formatBytes = (bytes?: number | null) => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const slugifyFileName = (name: string) => {
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > -1 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > -1 ? name.slice(dotIndex).toLowerCase() : '';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'asset';
  return `${slug}${ext}`;
};

const getAssetUrl = (asset: any) => asset.public_url || asset.external_url || '';

const downloadAsset = async (asset: any) => {
  const url = getAssetUrl(asset);
  if (!url) return;

  const fileName = asset.file_name || `${slugifyFileName(asset.title || 'affiliate-asset')}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

const AffiliateAssetsAdmin: React.FC = () => {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');
  const [sortOption, setSortOption] = useState(SORT_OPTIONS[0].value);
  const [previewAsset, setPreviewAsset] = useState<{ title: string; url: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('affiliate_assets')
        .select('id, title, type, description, copy_body, storage_bucket, storage_path, public_url, file_name, mime_type, file_size_bytes, width, height, thumbnail_url, external_url, is_active, archived_at, created_at, updated_at')
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

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  const activeCount = useMemo(() => assets.filter(asset => asset.is_active && !asset.archived_at).length, [assets]);
  const archivedCount = useMemo(() => assets.filter(asset => asset.archived_at).length, [assets]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return assets
      .filter(asset => {
        if (statusFilter === 'active' && !(asset.is_active && !asset.archived_at)) return false;
        if (statusFilter === 'inactive' && !(asset.is_active === false && !asset.archived_at)) return false;
        if (statusFilter === 'archived' && !asset.archived_at) return false;
        if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
        if (!normalizedSearch) return true;
        const haystack = `${asset.title || ''} ${asset.description || ''} ${asset.type || ''} ${asset.file_name || ''}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .sort((a, b) => {
        if (sortOption === 'updated_desc') {
          return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
        }
        if (sortOption === 'updated_asc') {
          return new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime();
        }
        if (sortOption === 'title_asc') {
          return String(a.title || '').localeCompare(String(b.title || ''));
        }
        if (sortOption === 'title_desc') {
          return String(b.title || '').localeCompare(String(a.title || ''));
        }
        return 0;
      });
  }, [assets, searchQuery, statusFilter, typeFilter, sortOption]);

  const resultCount = filteredAssets.length;
  const filtersActive = Boolean(
    searchQuery.trim() ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    sortOption !== SORT_OPTIONS[0].value
  );

  const openCreate = () => {
    setEditingAsset(null);
    setForm(emptyForm);
    setSelectedFile(null);
    setSaveError(null);
    setIsEditorOpen(true);
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSortOption(SORT_OPTIONS[0].value);
  };

  const openEdit = (asset: any) => {
    setEditingAsset(asset);
    setForm({
      title: asset.title || '',
      type: asset.type || 'banner',
      description: asset.description || '',
      copy_body: asset.copy_body || '',
      width: asset.width ? String(asset.width) : '',
      height: asset.height ? String(asset.height) : '',
      is_active: asset.is_active !== false && !asset.archived_at,
    });
    setSelectedFile(null);
    setSaveError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingAsset(null);
    setSelectedFile(null);
    setSaveError(null);
  };

  const validateFile = (file: File) => {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return 'Unsupported file type. Use PNG, JPEG, WebP, GIF, SVG, PDF, MP4, or plain text.';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return 'File is too large. Affiliate assets must be 10 MB or smaller.';
    }
    return null;
  };

  const chooseFile = async (file: File | null) => {
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    setSaveError(null);
    setSelectedFile(file);

    if (isImageMime(file.type)) {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        setForm(prev => ({
          ...prev,
          width: prev.width || String(image.naturalWidth || ''),
          height: prev.height || String(image.naturalHeight || ''),
        }));
        URL.revokeObjectURL(objectUrl);
      };
      image.onerror = () => URL.revokeObjectURL(objectUrl);
      image.src = objectUrl;
    }
  };

  const generatedPathFor = (file: File) => {
    const year = new Date().getFullYear();
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${BUCKET}/${year}/${id}-${slugifyFileName(file.name)}`;
  };

  const uploadFile = async (file: File) => {
    const storagePath = generatedPathFor(file);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return {
      storage_path: storagePath,
      public_url: data.publicUrl,
      file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
    };
  };

  const removeUploadedFile = async (storagePath?: string | null) => {
    if (!storagePath) return;
    await supabase.storage.from(BUCKET).remove([storagePath]);
  };

  const saveAsset = async () => {
    const title = form.title.trim();
    const type = form.type;
    if (!title) {
      setSaveError('Title is required.');
      return;
    }
    if (!ASSET_TYPES.includes(type)) {
      setSaveError('Choose a valid asset type.');
      return;
    }
    if (!FILE_OPTIONAL_TYPES.has(type) && !selectedFile && !editingAsset?.public_url) {
      setSaveError('Upload a file for this asset type.');
      return;
    }
    if (FILE_OPTIONAL_TYPES.has(type) && !selectedFile && !form.copy_body.trim() && !editingAsset?.public_url) {
      setSaveError('Add copy text or upload a file for this asset.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    let uploadedPath: string | null = null;
    try {
      const uploaded = selectedFile ? await uploadFile(selectedFile) : null;
      uploadedPath = uploaded?.storage_path || null;

      const payload: Record<string, any> = {
        title,
        type,
        description: form.description.trim() || null,
        copy_body: form.copy_body.trim() || null,
        width: form.width ? Number(form.width) : null,
        height: form.height ? Number(form.height) : null,
        is_active: form.is_active,
        archived_at: form.is_active ? null : editingAsset?.archived_at || null,
      };

      if (uploaded) {
        Object.assign(payload, {
          storage_bucket: BUCKET,
          storage_path: uploaded.storage_path,
          public_url: uploaded.public_url,
          file_name: uploaded.file_name,
          mime_type: uploaded.mime_type,
          file_size_bytes: uploaded.file_size_bytes,
          thumbnail_url: isImageMime(uploaded.mime_type) ? uploaded.public_url : null,
        });
      } else if (!editingAsset) {
        Object.assign(payload, {
          storage_bucket: BUCKET,
          storage_path: null,
          public_url: null,
          file_name: null,
          mime_type: null,
          file_size_bytes: null,
          thumbnail_url: null,
        });
      }

      const result = editingAsset
        ? await supabase.from('affiliate_assets').update(payload).eq('id', editingAsset.id)
        : await supabase.from('affiliate_assets').insert([payload]);

      if (result.error) throw result.error;

      if (uploaded && editingAsset?.storage_bucket === BUCKET && editingAsset.storage_path && editingAsset.storage_path !== uploaded.storage_path) {
        await removeUploadedFile(editingAsset.storage_path);
      }

      closeEditor();
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      if (uploadedPath) await removeUploadedFile(uploadedPath);
      setSaveError(err.message || 'Failed to save affiliate asset.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (asset: any) => {
    const nextActive = !asset.is_active;
    const { error: err } = await supabase
      .from('affiliate_assets')
      .update({ is_active: nextActive, archived_at: nextActive ? null : asset.archived_at })
      .eq('id', asset.id);
    if (err) {
      setError(err.message);
      return;
    }
    setAssets(prev => prev.map(row => row.id === asset.id ? { ...row, is_active: nextActive } : row));
  };

  const archiveAsset = async (asset: any) => {
    const { error: err } = await supabase
      .from('affiliate_assets')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('id', asset.id);
    if (err) {
      setError(err.message);
      return;
    }
    setAssets(prev => prev.map(row => row.id === asset.id ? { ...row, is_active: false, archived_at: new Date().toISOString() } : row));
  };

  const deleteAsset = async (asset: any) => {
    const confirmed = window.confirm('Permanently delete this asset and its uploaded file? Archiving is safer if affiliates may still have old links.');
    if (!confirmed) return;
    if (asset.storage_bucket === BUCKET && asset.storage_path) {
      await removeUploadedFile(asset.storage_path);
    }
    const { error: err } = await supabase.from('affiliate_assets').delete().eq('id', asset.id);
    if (err) {
      setError(err.message);
      return;
    }
    setAssets(prev => prev.filter(row => row.id !== asset.id));
  };

  const copyValue = async (key: string, value?: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const renderPreview = (asset: any) => {
    const url = asset.thumbnail_url || getAssetUrl(asset);
    if (url && isImageMime(asset.mime_type)) {
      return <img src={url} alt="" className="max-h-full max-w-full object-contain" />;
    }
    if (url && asset.type === 'logo') {
      return <img src={url} alt="" className="max-h-full max-w-full object-contain" />;
    }
    const Icon = url ? Download : FileText;
    return <Icon size={28} className="text-nano-yellow" />;
  };

  const renderAssetActions = (asset: any) => {
    const url = getAssetUrl(asset);
    return (
      <div className="flex flex-wrap items-center gap-2">
        {url && (
          <>
            <button
              type="button"
              onClick={() => downloadAsset(asset)}
              className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
              title="Download asset"
            >
              <Download size={14} />
            </button>
            <button
              type="button"
              onClick={() => copyValue(`${asset.id}:url`, url)}
              className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
              title="Copy public URL"
            >
              <Copy size={14} />
            </button>
          </>
        )}
        {asset.copy_body && (
          <button
            type="button"
            onClick={() => copyValue(`${asset.id}:copy`, asset.copy_body)}
            className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
            title="Copy text"
          >
            <FileText size={14} />
          </button>
        )}
        {url && (isImageMime(asset.mime_type) || asset.type === 'logo') && (
          <button
            type="button"
            onClick={() => setPreviewAsset({ title: asset.title || 'Asset preview', url })}
            className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
            title="View full preview"
          >
            <Maximize2 size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => openEdit(asset)}
          className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
          title="Edit or replace file"
        >
          <Edit3 size={14} />
        </button>
        <button
          type="button"
          onClick={() => toggleActive(asset)}
          className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white"
          title={asset.is_active ? 'Deactivate' : 'Activate'}
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          onClick={() => archiveAsset(asset)}
          disabled={Boolean(asset.archived_at)}
          className="rounded border border-nano-border bg-white/5 p-1.5 text-nano-text hover:text-white disabled:opacity-40"
          title="Archive"
        >
          <Archive size={14} />
        </button>
        <button
          type="button"
          onClick={() => deleteAsset(asset)}
          className="rounded border border-red-500/30 bg-red-500/10 p-1.5 text-red-300 hover:text-red-100"
          title="Hard delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold font-mono tracking-wide">Affiliate Assets</h2>
          <p className="text-sm text-nano-text mt-1">Upload, filter, and sort shareable affiliate creative assets without affecting live active content.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="rounded border border-green-400/30 bg-green-400/10 px-2 py-1 text-green-400">{activeCount} Active</span>
            <span className="rounded border border-nano-border bg-white/5 px-2 py-1 text-nano-text">{archivedCount} Archived</span>
          </div>
        </div>
      </div>

      <div className="sticky top-4 z-20 mb-5 rounded-xl border border-nano-border bg-black/95 p-4 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-gray-400">Filter assets</div>
            <div className="mt-1 text-sm text-nano-text">Showing {resultCount} of {assets.length} total assets.</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filtersActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-2 rounded border border-nano-border bg-transparent px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:bg-white/5 hover:text-white"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
              className="inline-flex items-center gap-2 rounded border border-nano-border bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-text hover:text-white"
            >
              {viewMode === 'cards' ? <List size={14} /> : <Grid2X2 size={14} />}
              {viewMode === 'cards' ? 'List' : 'Cards'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded border border-nano-yellow/30 bg-nano-yellow/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20"
            >
              <Plus size={14} /> New Asset
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.7fr_1fr] xl:grid-cols-[1.4fr_1fr]">
          <label className="block">
            <span className="mb-2 block text-[11px] uppercase tracking-widest text-gray-400">Search assets</span>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search title, description, file name, or type"
              className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white outline-none transition-colors focus:border-nano-yellow"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-widest text-gray-400">Status</span>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}
                className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-nano-yellow"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-widest text-gray-400">Type</span>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-nano-yellow"
              >
                <option value="all">All types</option>
                {ASSET_TYPES.map(type => (
                  <option key={type} value={type}>{type.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-widest text-gray-400">Sort</span>
              <select
                value={sortOption}
                onChange={e => setSortOption(e.target.value)}
                className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white outline-none focus:border-nano-yellow"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-4 text-sm font-mono text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,320px))] justify-start gap-4 animate-pulse">
          {[...Array(6)].map((_, i) => <div key={i} className="h-72 rounded bg-white/5" />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-nano-border bg-black p-12 text-center">
          <UploadCloud size={34} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm italic text-gray-500">No affiliate assets yet. Add a new file or text asset to start sharing branded content.</p>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-lg border border-nano-border bg-black p-12 text-center">
          <UploadCloud size={34} className="mx-auto mb-3 text-gray-600" />
          <p className="text-sm italic text-gray-500">No assets match your search and filters. Clear filters or try a different keyword.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,280px))] justify-start gap-3">
          {filteredAssets.map(asset => (
            <div key={asset.id} className="flex min-h-[380px] flex-col overflow-hidden rounded-lg border border-nano-border bg-black/70">
              <button
                type="button"
                onClick={() => {
                  const url = asset.thumbnail_url || getAssetUrl(asset);
                  if (url && (isImageMime(asset.mime_type) || asset.type === 'logo')) setPreviewAsset({ title: asset.title || 'Asset preview', url });
                }}
                className="flex h-56 w-full items-center justify-center overflow-hidden border-b border-nano-border bg-black/50 p-2"
                title="View full preview"
              >
                {renderPreview(asset)}
              </button>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{asset.title}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-nano-text">{asset.type}</div>
                  </div>
                  <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${asset.archived_at ? 'border-gray-500/40 bg-gray-500/10 text-gray-400' : asset.is_active ? 'border-green-400/30 bg-green-400/10 text-green-400' : 'border-nano-border bg-white/5 text-nano-text'}`}>
                    {asset.archived_at ? 'Archived' : asset.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {asset.description && <p className="mt-3 line-clamp-2 text-sm text-nano-text">{asset.description}</p>}
                {asset.copy_body && <p className="mt-2 line-clamp-2 rounded border border-nano-border bg-black p-2 text-xs text-nano-text">{asset.copy_body}</p>}
                <div className="mt-3 text-[11px] font-mono text-nano-text">
                  {asset.file_name || 'Copy/text asset'} {asset.file_size_bytes ? `- ${formatBytes(asset.file_size_bytes)}` : ''}
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  {renderAssetActions(asset)}
                  {copied?.startsWith(asset.id) && <span className="text-[10px] text-green-400">Copied</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-nano-border bg-black overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-nano-border bg-black/40 text-[10px] uppercase tracking-widest text-nano-text">
                <th className="p-2 text-left">Asset</th>
                <th className="p-2 text-left">Type</th>
                <th className="p-2 text-left">File</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Updated</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map(asset => (
                <tr key={asset.id} className="border-b border-nano-border/50 hover:bg-white/5">
                  <td className="p-2 align-top">
                    <div className="font-bold text-white text-sm">{asset.title}</div>
                    {asset.description && <div className="mt-1 max-w-[220px] truncate text-[11px] text-nano-text">{asset.description}</div>}
                  </td>
                  <td className="p-2 text-xs uppercase tracking-wider text-nano-text align-top">{asset.type}</td>
                  <td className="p-2 text-[11px] font-mono text-nano-text align-top">{asset.file_name || '-'}</td>
                  <td className="p-2 align-top">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${asset.archived_at ? 'border-gray-500/40 bg-gray-500/10 text-gray-400' : asset.is_active ? 'border-green-400/30 bg-green-400/10 text-green-400' : 'border-nano-border bg-white/5 text-nano-text'}`}>
                      {asset.archived_at ? 'Archived' : asset.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-2 text-[11px] font-mono text-nano-text align-top">
                    {asset.updated_at ? new Date(asset.updated_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-2 text-right align-top">
                    <div className="flex justify-end gap-1">{renderAssetActions(asset)}</div>
                    {copied?.startsWith(asset.id) && <div className="mt-1 text-[10px] text-green-400">Copied</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-nano-border bg-nano-panel shadow-xl">
            <div className="flex items-center justify-between border-b border-nano-border px-5 py-4">
              <span className="text-sm font-bold uppercase tracking-widest text-white">{editingAsset ? 'Edit Asset' : 'New Asset'}</span>
              <button onClick={closeEditor} disabled={saving} className="text-nano-text hover:text-white disabled:opacity-50">
                <X size={16} />
              </button>
            </div>
            <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.1fr]">
              <div>
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDragging(false);
                    chooseFile(e.dataTransfer.files?.[0] || null);
                  }}
                  className={`flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center ${isDragging ? 'border-nano-yellow bg-nano-yellow/10' : 'border-nano-border bg-black/50'}`}
                >
                  {previewUrl && selectedFile && isImageMime(selectedFile.type) ? (
                    <div className="flex h-80 w-full items-center justify-center overflow-hidden rounded border border-nano-border bg-black/40 p-3">
                      <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : previewUrl && selectedFile ? (
                    <div className="rounded border border-nano-border bg-black p-5">
                      <FileText size={36} className="mx-auto mb-3 text-nano-yellow" />
                      <div className="text-sm font-bold text-white">{selectedFile.name}</div>
                      <div className="mt-1 text-xs text-nano-text">{selectedFile.type || 'Unknown type'} - {formatBytes(selectedFile.size)}</div>
                    </div>
                  ) : editingAsset && getAssetUrl(editingAsset) && isImageMime(editingAsset.mime_type) ? (
                    <div className="flex h-80 w-full items-center justify-center overflow-hidden rounded border border-nano-border bg-black/40 p-3">
                      <img src={editingAsset.thumbnail_url || getAssetUrl(editingAsset)} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <>
                      <UploadCloud size={40} className="mb-3 text-nano-yellow" />
                      <div className="text-sm font-bold text-white">Drop a file here</div>
                      <p className="mt-2 max-w-sm text-xs text-nano-text">PNG, JPEG, WebP, GIF, SVG, PDF, MP4, or plain text. Files can be up to 10 MB.</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept={[...ALLOWED_MIME_TYPES].join(',')}
                    onChange={e => chooseFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 inline-flex items-center gap-2 rounded border border-nano-yellow/30 bg-nano-yellow/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-nano-yellow hover:bg-nano-yellow/20"
                  >
                    <UploadCloud size={14} />
                    {editingAsset?.public_url ? 'Replace File' : 'Choose File'}
                  </button>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="mt-2 text-xs text-nano-text hover:text-white"
                    >
                      Clear selected file
                    </button>
                  )}
                </div>

                <details className="mt-4 rounded border border-nano-border bg-black/40 p-3 text-xs text-nano-text">
                  <summary className="cursor-pointer font-bold uppercase tracking-wider text-gray-400">Advanced details</summary>
                  <div className="mt-3 space-y-2 font-mono">
                    <div>Bucket: {BUCKET}</div>
                    <div className="break-all">Generated URL: {selectedFile ? 'Created after upload' : editingAsset?.public_url || '-'}</div>
                    <div className="break-all">Generated path: {selectedFile ? 'Created after upload' : editingAsset?.storage_path || '-'}</div>
                  </div>
                </details>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Title</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Asset Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  >
                    {ASSET_TYPES.map(type => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
                  </select>
                  {FILE_OPTIONAL_TYPES.has(form.type) && (
                    <p className="mt-1 text-xs text-nano-text">Copy, email, and social assets can be saved as text only or with an optional file.</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wider text-gray-500">Copy Body</label>
                  <textarea
                    value={form.copy_body}
                    onChange={e => setForm(f => ({ ...f, copy_body: e.target.value }))}
                    rows={5}
                    className="w-full resize-none rounded border border-nano-border bg-black px-3 py-2 text-sm text-white focus:border-nano-yellow focus:outline-none"
                  />
                </div>
                {(form.type === 'banner' || form.type === 'logo' || selectedFile?.type.startsWith('image/')) && (
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
                )}
                <label className="flex items-center gap-2 text-xs text-nano-text">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="accent-yellow-400"
                  />
                  Active and visible to active affiliates
                </label>
                {form.copy_body && (
                  <div className="rounded border border-nano-border bg-black p-3">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Copy preview</div>
                    <p className="whitespace-pre-wrap text-sm text-nano-text">{form.copy_body}</p>
                  </div>
                )}
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
        </div>
      )}

      {previewAsset && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-6xl rounded-lg border border-nano-border bg-nano-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-nano-border px-5 py-4">
              <span className="truncate text-sm font-bold uppercase tracking-widest text-white">{previewAsset.title}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const asset = assets.find(a => a.thumbnail_url === previewAsset.url || getAssetUrl(a) === previewAsset.url);
                    if (asset) downloadAsset(asset);
                  }}
                  className="text-nano-text hover:text-white transition-colors"
                  title="Download asset"
                >
                  <Download size={16} />
                </button>
                <button onClick={() => setPreviewAsset(null)} className="text-nano-text hover:text-white" title="Close preview">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex max-h-[80vh] items-center justify-center overflow-hidden bg-black/60 p-4">
              <img src={previewAsset.url} alt="" className="max-h-[78vh] max-w-[90vw] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AffiliateAssetsAdmin;
