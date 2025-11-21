import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ChevronDown } from 'lucide-react';
import React, { useMemo, useState } from 'react';
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

export const ClassSelect: React.FC<ClassSelectProps> = ({
  classes,
  selectedClass,
  onClassChange,
  currentClass,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

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
          className="w-full rounded-t-2xl h-[80vh] max-h-[80vh] flex flex-col"
        >
          <SheetHeader className="text-left pb-4 shrink-0">
            <SheetTitle>Select Class</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pb-6">
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
  const hasCourseInfo = classItem.length || classItem.climb;

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
            {classItem.length && (
              <span>{(classItem.length / 1000).toFixed(1)}km</span>
            )}
            {classItem.climb && classItem.length && (
              <span className="text-muted-foreground">•</span>
            )}
            {classItem.climb && <span>{classItem.climb}m</span>}
          </div>
        )}
      </div>
    </Button>
  );
};
