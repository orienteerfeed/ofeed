import type { ReactNode } from 'react';

export type AppFiltersProps = {
  renderPresets?: ReactNode;
  renderActive?: ReactNode;
  renderActions?: ReactNode;
};

export const AppFilters = ({
  renderPresets,
  renderActive,
  renderActions,
}: AppFiltersProps) => {
  return (
    <div className="space-y-4">
      {renderPresets}
      {renderActive}
      {renderActions}
    </div>
  );
};
