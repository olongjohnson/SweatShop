import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ConscriptNotification } from '../../shared/types';

interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string;
  conscriptId?: string;
  autoDismissMs: number;
}

interface NotificationSystemProps {
  onSelectConscript: (conscriptId: string) => void;
}

let toastCounter = 0;

function notificationToToast(notification: ConscriptNotification): Toast {
  const id = `toast-${++toastCounter}`;

  if (notification.event === 'merged') {
    return {
      id,
      type: 'success',
      title: 'Directive Merged',
      body: `${notification.directiveTitle || 'Directive'} merged successfully`,
      conscriptId: notification.conscriptId,
      autoDismissMs: 5000,
    };
  }

  switch (notification.status) {
    case 'QA_READY':
      return {
        id,
        type: 'success',
        title: 'Ready for QA',
        body: `${notification.conscriptName} is ready for QA review`,
        conscriptId: notification.conscriptId,
        autoDismissMs: 0,
      };
    case 'NEEDS_INPUT':
      return {
        id,
        type: 'warning',
        title: 'Input Required',
        body: `${notification.conscriptName} has a question`,
        conscriptId: notification.conscriptId,
        autoDismissMs: 0,
      };
    case 'ERROR':
      return {
        id,
        type: 'error',
        title: 'Conscript Error',
        body: `${notification.conscriptName} encountered an error`,
        conscriptId: notification.conscriptId,
        autoDismissMs: 0,
      };
    default:
      return {
        id,
        type: 'info',
        title: 'Conscript Update',
        body: `${notification.conscriptName}: ${notification.status}`,
        conscriptId: notification.conscriptId,
        autoDismissMs: 3000,
      };
  }
}

export default function NotificationSystem({ onSelectConscript }: NotificationSystemProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Toast) => {
    setToasts((prev) => [toast, ...prev].slice(0, 8));

    if (toast.autoDismissMs > 0) {
      const timer = setTimeout(() => dismissToast(toast.id), toast.autoDismissMs);
      timers.current.set(toast.id, timer);
    }
  }, [dismissToast]);

  useEffect(() => {
    window.sweatshop.conscripts.onNotification((notification) => {
      addToast(notificationToToast(notification));
    });

    // Listen for orchestrator completion
    window.sweatshop.orchestrator.onProgress((status) => {
      if (status.running && status.completed === status.total && status.total > 0) {
        addToast({
          id: `toast-${++toastCounter}`,
          type: 'success',
          title: 'All Work Complete!',
          body: `${status.total} directives processed`,
          autoDismissMs: 0,
        });
      }
    });
  }, [addToast]);

  // Clean up timers
  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => {
            if (toast.conscriptId) onSelectConscript(toast.conscriptId);
            dismissToast(toast.id);
          }}
        >
          <div className="toast-icon">
            {toast.type === 'success' && '\u2713'}
            {toast.type === 'warning' && '!'}
            {toast.type === 'error' && '\u2717'}
            {toast.type === 'info' && 'i'}
          </div>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-body">{toast.body}</div>
          </div>
          <button
            className="toast-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(toast.id);
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
