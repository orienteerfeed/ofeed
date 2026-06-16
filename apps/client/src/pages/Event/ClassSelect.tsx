import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  hasDisplayableCourseClimb,
  hasDisplayableCourseInfo,
  hasDisplayableCourseLength,
} from '@/lib/course-info';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/atoms';

interface Class {
  id: number;
  name: string;
  length?: number;
  climb?: number;
}

interface ClassSelectProps {
  classes: Class[];
  selectedClass: number | null;
  onClassChange: (classId: number) => void;
  currentClass: Class;
}

// Sheet sizing limits (in px). The sheet height is user-adjustable within these
// bounds; the upper bound is additionally clamped to the viewport at drag time.
const MIN_SHEET_HEIGHT = 200;
const DEFAULT_HEIGHT_RATIO = 0.8;
const MAX_HEIGHT_RATIO = 0.9;
// How far past the minimum the user must drag down to dismiss (close) the sheet.
const DISMISS_THRESHOLD = 56;

const getDefaultHeight = () =>
  typeof window !== 'undefined'
    ? Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO)
    : 600;

const getMaxHeight = () =>
  typeof window !== 'undefined'
    ? Math.round(window.innerHeight * MAX_HEIGHT_RATIO)
    : 800;

export const ClassSelect: React.FC<ClassSelectProps> = ({
  classes,
  selectedClass,
  onClassChange,
  currentClass,
}) => {
  const { t } = useTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Sheet-behavior state. Height is fully adjustable (not fixed); dragging
  // disables the height transition for responsive feedback.
  const [sheetHeight, setSheetHeight] = useState(getDefaultHeight);
  const [isDragging, setIsDragging] = useState(false);

  const dragState = useRef<{ startY: number; startHeight: number } | null>(null);

  // Reset to a sensible default each time the sheet opens.
  useEffect(() => {
    if (isSheetOpen) {
      setSheetHeight(getDefaultHeight());
    }
  }, [isSheetOpen]);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        startY: e.clientY,
        startHeight: sheetHeight,
      };
      setIsDragging(true);
    },
    [sheetHeight],
  );

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragState.current) return;
    // Dragging up (smaller clientY) increases height; down decreases it.
    const delta = dragState.current.startY - e.clientY;
    const next = dragState.current.startHeight + delta;

    // Pulled well below the minimum (e.g. a quick swipe down) → close the sheet.
    if (next < MIN_SHEET_HEIGHT - DISMISS_THRESHOLD) {
      dragState.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsDragging(false);
      setIsSheetOpen(false);
      return;
    }

    const clamped = Math.min(getMaxHeight(), Math.max(MIN_SHEET_HEIGHT, next));
    setSheetHeight(clamped);
  }, []);

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = null;
    setIsDragging(false);
  }, []);

  // Create a sorted copy of classes for display
  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => a.name.localeCompare(b.name));
  }, [classes]);

  return (
    <>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 gap-1 min-w-[80px] bg-transparent"
          >
            <span className="text-xs font-bold">{currentClass.name}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="w-full rounded-t-2xl flex flex-col overflow-hidden p-0"
          style={{
            height: sheetHeight,
            maxHeight: '90vh',
            transition: isDragging ? 'none' : 'height 200ms ease',
          }}
        >
          <SheetHeader className="text-left shrink-0 px-6 pt-2">
            {/* Drag handle: drag up/down to resize the sheet height. */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize panel"
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className={cn(
                'group flex w-full touch-none cursor-row-resize select-none flex-col items-center pb-1 pt-1',
                isDragging && 'cursor-grabbing',
              )}
            >
              <span className="h-1.5 w-12 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/50" />
            </div>

            <SheetTitle>{t('Pages.Event.ClassSelect.Title')}</SheetTitle>
            <SheetDescription className="sr-only">
              {t('Pages.Event.ClassSelect.Description')}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {sortedClasses.map(classItem => (
                <ClassButton
                  key={classItem.id}
                  classItem={classItem}
                  isSelected={selectedClass === classItem.id}
                  onSelect={() => {
                    onClassChange(classItem.id);
                    setIsSheetOpen(false);
                  }}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile Floating Button */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <Button
          onClick={() => setIsSheetOpen(true)}
          className="rounded-full w-14 h-14 shadow-lg border-2 border-background"
          size="icon"
        >
          <ChevronDown className="w-6 h-6" />
        </Button>
      </div>
    </>
  );
};

interface ClassButtonProps {
  classItem: Class;
  isSelected: boolean;
  onSelect: () => void;
}

const ClassButton: React.FC<ClassButtonProps> = ({
  classItem,
  isSelected,
  onSelect,
}) => {
  const hasCourseInfo = hasDisplayableCourseInfo(classItem);
  const showLength = hasDisplayableCourseLength(classItem.length);
  const showClimb = hasDisplayableCourseClimb(classItem);
  const lengthLabel = showLength ? `${((classItem.length ?? 0) / 1000).toFixed(1)}km` : null;
  const climbLabel = showClimb ? `${classItem.climb ?? 0}m` : null;

  return (
    <Button
      variant={isSelected ? 'default' : 'outline'}
      className="h-16 text-base font-semibold"
      onClick={onSelect}
    >
      <div className="flex flex-col items-center gap-1">
        <span>{classItem.name}</span>
        {hasCourseInfo && (
          <div className="flex gap-2 text-xs font-normal opacity-80">
            {lengthLabel && <span>{lengthLabel}</span>}
            {showClimb && showLength && (
              <span className="text-muted-foreground">•</span>
            )}
            {climbLabel && <span>{climbLabel}</span>}
          </div>
        )}
      </div>
    </Button>
  );
};
