import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from '@tanstack/react-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.fn();

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: apiGetMock }),
}));

import {
  EMPTY_ENTRY_FORM_VALUES,
  type EntryFormValues,
} from '@/pages/Event/Entries/entry-form.validation';
import { RegistrationAutocomplete } from '@/pages/Event/Entries/RegistrationAutocomplete';

const MATCH = {
  source: 'ORIS',
  externalId: '33',
  registration: 'ABM6707',
  firstname: 'Libor',
  lastname: 'Adamek',
  birthYear: 1967,
  license: 'C',
  organisation: 'KOB ALFA Brno',
  gender: 'M',
  card: 207849,
};

function Harness({ onMatch }: { onMatch: (item: typeof MATCH) => void }) {
  const form = useForm({ defaultValues: EMPTY_ENTRY_FORM_VALUES as EntryFormValues });
  return (
    <RegistrationAutocomplete
      form={form}
      label="Registration"
      onMatch={onMatch as never}
    />
  );
}

function renderHarness(onMatch: (item: typeof MATCH) => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness onMatch={onMatch} />
    </QueryClientProvider>
  );
}

describe('RegistrationAutocomplete', () => {
  it('does not query while the registration is incomplete', () => {
    renderHarness(vi.fn());
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABM' } });

    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('auto-fills the sibling fields once a full registration resolves to exactly one match', async () => {
    apiGetMock.mockResolvedValue({ data: [MATCH] });
    const onMatch = vi.fn();
    renderHarness(onMatch);

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABM6707' } });

    await waitFor(() => expect(onMatch).toHaveBeenCalledWith(MATCH));
    expect(apiGetMock).toHaveBeenCalledWith(
      expect.stringContaining('registration=ABM6707'),
      { skipAuth: true }
    );
  });

  it('shows the no-match state when the lookup returns nothing', async () => {
    apiGetMock.mockResolvedValue({ data: [] });
    renderHarness(vi.fn());

    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ABM6707' } });

    expect(await screen.findByText('Pages.Event.Entries.Form.Autocomplete.NoMatch')).toBeInTheDocument();
  });
});
