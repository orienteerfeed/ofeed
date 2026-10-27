import { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QrPaymentActions } from '@/components/molecules/QrPaymentActions';
import { toast } from '@/utils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/utils', () => ({ toast: vi.fn() }));
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
let download: ReturnType<typeof vi.spyOn>;
let downloadedUrl: string;
let downloadedName: string;
const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');

function sharing(share: unknown, canShare: unknown) {
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: share,
  });
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: canShare,
  });
}
function mount(withCanvas = true) {
  const ref = createRef<HTMLCanvasElement>();
  if (withCanvas) {
    ref.current = document.createElement('canvas');
    vi.spyOn(ref.current, 'toDataURL').mockReturnValue(PNG);
  }
  render(<QrPaymentActions canvasRef={ref} />);
  return ref;
}
const clickShare = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Pages.Checkout.QrPayment.ShareQr' })
  );
const clickDownload = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Pages.Checkout.QrPayment.DownloadQr' })
  );

beforeEach(() => {
  download = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      downloadedUrl = this.href;
      downloadedName = this.download;
    });
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, descriptor] of [
    ['share', originalShare],
    ['canShare', originalCanShare],
  ] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});

describe('QrPaymentActions', () => {
  it('shares a PNG file synchronously during the click, without raw payment text', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    sharing(share, vi.fn().mockReturnValue(true));
    mount();
    clickShare();
    // No asynchronous export before share(), so mobile user activation survives.
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]![0] as ShareData;
    expect(Object.keys(data)).toEqual(['files']);
    const file = data.files![0]!;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('ofeed-payment.png');
    expect(file.type).toBe('image/png');
    const contents = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    expect(contents).toBe(PNG);
    expect(download).not.toHaveBeenCalled();
  });

  it('downloads the PNG without invoking the share sheet', () => {
    const share = vi.fn();
    sharing(share, () => true);
    mount();
    clickDownload();
    expect(downloadedUrl).toBe(PNG);
    expect(downloadedName).toBe('ofeed-payment.png');
    expect(share).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it.each([false, undefined])(
    'downloads with instructions when file sharing is unavailable: %s',
    canShare => {
      const share = vi.fn();
      sharing(share, canShare === false ? () => false : undefined);
      mount();
      clickShare();
      expect(download).toHaveBeenCalledOnce();
      expect(downloadedUrl).toBe(PNG);
      expect(share).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pages.Checkout.QrPayment.ShareUnavailable',
        })
      );
    }
  );

  it('downloads when the browser has no Web Share API', () => {
    sharing(undefined, undefined);
    mount();
    clickShare();
    expect(download).toHaveBeenCalledOnce();
  });

  it('silently handles share cancellation without starting a download', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    sharing(share, () => true);
    mount();
    clickShare();
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(toast).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('shows an actionable error when sharing fails', async () => {
    sharing(
      vi.fn().mockRejectedValue(new Error('Permission denied')),
      () => true
    );
    mount();
    clickShare();
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Pages.Checkout.QrPayment.ShareError',
          variant: 'error',
        })
      )
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('reports export failures rather than silently ignoring the click', () => {
    mount(false);
    clickDownload();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pages.Checkout.QrPayment.ExportError' })
    );
    expect(download).not.toHaveBeenCalled();
  });
});
