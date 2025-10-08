import {
  Dialog as ShadcnDialog,
  DialogClose as ShadcnDialogClose,
  DialogContent as ShadcnDialogContent,
  DialogDescription as ShadcnDialogDescription,
  DialogFooter as ShadcnDialogFooter,
  DialogHeader as ShadcnDialogHeader,
  DialogOverlay as ShadcnDialogOverlay,
  DialogPortal as ShadcnDialogPortal,
  DialogTitle as ShadcnDialogTitle,
  DialogTrigger as ShadcnDialogTrigger,
} from '@/components/ui/dialog';

// Simple re-export with TypeScript
export {
  ShadcnDialog as Dialog,
  ShadcnDialogClose as DialogClose,
  ShadcnDialogContent as DialogContent,
  ShadcnDialogDescription as DialogDescription,
  ShadcnDialogFooter as DialogFooter,
  ShadcnDialogHeader as DialogHeader,
  ShadcnDialogOverlay as DialogOverlay,
  ShadcnDialogPortal as DialogPortal,
  ShadcnDialogTitle as DialogTitle,
  ShadcnDialogTrigger as DialogTrigger,
};

// SimpleDialog component only
interface SimpleDialogProps {
  trigger: React.ReactNode;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SimpleDialog: React.FC<SimpleDialogProps> = ({
  trigger,
  title,
  description,
  children,
}) => {
  return (
    <ShadcnDialog>
      <ShadcnDialogTrigger asChild>{trigger}</ShadcnDialogTrigger>
      <ShadcnDialogContent>
        {title && <ShadcnDialogTitle>{title}</ShadcnDialogTitle>}
        {description && (
          <ShadcnDialogDescription>{description}</ShadcnDialogDescription>
        )}
        {children}
      </ShadcnDialogContent>
    </ShadcnDialog>
  );
};
