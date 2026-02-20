import React, { useState, useEffect, useCallback } from 'react';
import { html as diff2html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';

interface FileInfo {
  path: string;
  insertions: number;
  deletions: number;
}

interface DiffViewProps {
  agentId: string;
}

export default function DiffView({ agentId }: DiffViewProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [summary, setSummary] = useState({ filesChanged: 0, insertions: 0, deletions: 0 });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffHtml, setDiffHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('unified');

  // Load file list and summary on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [fileList, diffSummary] = await Promise.all([
          window.sweatshop.git.getFilesWithStats(agentId),
          window.sweatshop.git.getDiffSummary(agentId),
        ]);
        setFiles(fileList);
        setSummary(diffSummary);

        // Auto-select first file if available
        if (fileList.length > 0 && !selectedFile) {
          setSelectedFile(fileList[0].path);
        }
      } catch (err) {
        console.error('Failed to load diff data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId]);

  // Load diff for selected file
  useEffect(() => {
    if (!selectedFile) {
      setDiffHtml('');
      return;
    }
    const loadDiff = async () => {
      try {
        const raw = await window.sweatshop.git.getFileDiff(agentId, selectedFile);
        if (!raw) {
          setDiffHtml('<div class="diff-empty">No changes</div>');
          return;
        }
        const html = diff2html(raw, {
          drawFileList: false,
          matching: 'lines',
          outputFormat: viewMode === 'split' ? 'side-by-side' : 'line-by-line',
        });
        setDiffHtml(html);
      } catch (err) {
        console.error('Failed to load file diff:', err);
        setDiffHtml('<div class="diff-error">Failed to load diff</div>');
      }
    };
    loadDiff();
  }, [agentId, selectedFile, viewMode]);

  // Show all files diff
  const showFullDiff = useCallback(async () => {
    setSelectedFile(null);
    try {
      const raw = await window.sweatshop.git.getFullDiff(agentId);
      if (!raw) {
        setDiffHtml('<div class="diff-empty">No changes found</div>');
        return;
      }
      const html = diff2html(raw, {
        drawFileList: true,
        matching: 'lines',
        outputFormat: viewMode === 'split' ? 'side-by-side' : 'line-by-line',
      });
      setDiffHtml(html);
    } catch (err) {
      setDiffHtml('<div class="diff-error">Failed to load diff</div>');
    }
  }, [agentId, viewMode]);

  const getFileExtension = (path: string) => {
    const parts = path.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  };

  const getFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  const getFileDir = (path: string) => {
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
  };

  if (loading) {
    return (
      <div className="diff-view">
        <div className="diff-loading">Loading changes...</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="diff-view">
        <div className="diff-empty-state">
          <h3>No changes detected</h3>
          <p>The agent hasn't made any file changes on its branch yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-view">
      {/* Header bar */}
      <div className="diff-header">
        <div className="diff-summary">
          <span className="diff-stat-files">{summary.filesChanged} files changed</span>
          <span className="diff-stat-add">+{summary.insertions}</span>
          <span className="diff-stat-del">-{summary.deletions}</span>
        </div>
        <div className="diff-controls">
          <button
            className={`diff-mode-btn ${viewMode === 'unified' ? 'active' : ''}`}
            onClick={() => setViewMode('unified')}
          >
            Unified
          </button>
          <button
            className={`diff-mode-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button className="diff-mode-btn" onClick={showFullDiff}>
            All Files
          </button>
        </div>
      </div>

      <div className="diff-body">
        {/* File list sidebar */}
        <div className="diff-file-list">
          {files.map((file) => (
            <div
              key={file.path}
              className={`diff-file-item ${selectedFile === file.path ? 'selected' : ''}`}
              onClick={() => setSelectedFile(file.path)}
            >
              <span className={`diff-file-icon ext-${getFileExtension(file.path)}`} />
              <div className="diff-file-info">
                <span className="diff-file-name">{getFileName(file.path)}</span>
                <span className="diff-file-dir">{getFileDir(file.path)}</span>
              </div>
              <div className="diff-file-stats">
                {file.insertions > 0 && <span className="diff-stat-add">+{file.insertions}</span>}
                {file.deletions > 0 && <span className="diff-stat-del">-{file.deletions}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Diff content */}
        <div className="diff-content" dangerouslySetInnerHTML={{ __html: diffHtml }} />
      </div>
    </div>
  );
}
