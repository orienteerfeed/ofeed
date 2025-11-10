import { useState } from 'react';

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
  onConfirm?: () => void;
}

export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default',
  });

  const showConfirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    options: {
      confirmText?: string;
      cancelText?: string;
      variant?: 'default' | 'destructive';
    } = {}
  ) => {
    setDialogState({
      isOpen: true,
      title,
      description,
      onConfirm,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      variant: options.variant || 'default',
    });
  };

  const hideConfirm = () => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
  };

  const handleConfirm = () => {
    dialogState.onConfirm?.();
    hideConfirm();
  };

  return {
    dialogState,
    showConfirm,
    hideConfirm,
    handleConfirm,
  };
};
