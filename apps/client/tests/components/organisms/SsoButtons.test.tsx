import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: apiGetMock }),
}));

import { SsoButtons } from '@/components/organisms/SsoButtons';

function renderButtons() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SsoButtons />
    </QueryClientProvider>
  );
}

describe('SsoButtons', () => {
  beforeEach(() => apiGetMock.mockReset());

  it('renders nothing when the server enables no provider', async () => {
    apiGetMock.mockResolvedValue({ data: { providers: [] } });
    const { container } = renderButtons();
    await vi.waitFor(() => expect(apiGetMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one button per enabled provider', async () => {
    apiGetMock.mockResolvedValue({ data: { providers: ['oris'] } });
    renderButtons();
    expect(await screen.findAllByRole('button')).toHaveLength(1);
  });
});
