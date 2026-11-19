import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DragDropContainer } from '@/components/molecules/DragDropContainer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const props = {
  uploadedFiles: [],
  onUpload: vi.fn(),
  onDelete: vi.fn(),
  count: 1,
  formats: ['xml'],
};

describe('DragDropContainer interaction', () => {
  it('opens the file picker by click, Enter and Space anywhere on the zone', () => {
    const { container } = render(<DragDropContainer {...props} />);
    const input = container.querySelector('input')!;
    const click = vi.spyOn(input, 'click');
    const zone = screen.getByRole('button', {
      name: 'Molecules.DragDrop.FileUpload',
    });
    fireEvent.click(zone);
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.keyDown(zone, { key: ' ' });
    expect(click).toHaveBeenCalledTimes(3);
    expect(input).not.toHaveAttribute('multiple');
  });

  it('blocks the file picker and file drops while uploading', () => {
    const onUpload = vi.fn();
    const { container } = render(
      <DragDropContainer {...props} onUpload={onUpload} isUploading />
    );
    const click = vi.spyOn(container.querySelector('input')!, 'click');
    const zone = screen.getByRole('button');
    fireEvent.click(zone);
    fireEvent.keyDown(zone, { key: 'Enter' });
    fireEvent.drop(zone, {
      dataTransfer: { files: [new File(['<xml/>'], 'start.xml')] },
    });
    expect(click).not.toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
    expect(zone).toHaveAttribute('aria-busy', 'true');
    expect(zone).toHaveAttribute('aria-disabled', 'true');
  });
});
