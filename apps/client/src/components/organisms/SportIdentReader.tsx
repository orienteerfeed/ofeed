import React, { useCallback, useEffect, useState } from 'react';
import type { USBDevice } from '@/types/webusb';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const SportIdentReader: React.FC = () => {
  const [device, setDevice] = useState<USBDevice | null>(null);
  const [punchData, setPunchData] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const connectReader = async (): Promise<void> => {
    try {
      setStatus('connecting');
      setError(null);

      if (!navigator.usb) {
        throw new Error(
          'WebUSB API is not supported in this browser. Please use Chrome, Edge, or Opera.'
        );
      }

      const usbDevice = await navigator.usb.requestDevice({
        filters: [{ vendorId: 0x04d8 }],
      });

      await usbDevice.open();

      if (usbDevice.configuration === null) {
        await usbDevice.selectConfiguration(1);
      }

      await usbDevice.claimInterface(0);
      setDevice(usbDevice);
      setStatus('connected');

      listenToPunches(usbDevice);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Connection failed';
      setError(errorMessage);
      setStatus('error');
    }
  };

  const listenToPunches = async (usbDevice: USBDevice): Promise<void> => {
    try {
      const result = await usbDevice.transferIn(1, 64);

      if (result.data && status === 'connected') {
        const decoder = new TextDecoder();
        const punch = decoder.decode(result.data).trim();
        if (punch) {
          setPunchData(punch);
        }
      }

      if (status === 'connected' && usbDevice.opened) {
        listenToPunches(usbDevice);
      }
    } catch (err) {
      console.error('Read error:', err);
      if (status === 'connected' && usbDevice.opened) {
        setTimeout(() => listenToPunches(usbDevice), 1000);
      }
    }
  };

  const disconnectReader = useCallback(async (): Promise<void> => {
    if (device?.opened) {
      try {
        await device.close();
      } catch (err) {
        console.error('Close error:', err);
      }
    }
    setDevice(null);
    setStatus('disconnected');
    setPunchData(null);
  }, [device]);

  useEffect(() => {
    return () => {
      disconnectReader();
    };
  }, [disconnectReader]);

  const getStatusColor = (): string => {
    switch (status) {
      case 'connected':
        return 'bg-green-100 border-green-400 text-green-700';
      case 'connecting':
        return 'bg-blue-100 border-blue-400 text-blue-700';
      case 'error':
        return 'bg-red-100 border-red-400 text-red-700';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-700';
    }
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'connected':
        return 'Connected to SportIdent reader';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection failed';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">
        SportIdent Reader
      </h1>

      <div className={`mb-4 p-3 border rounded ${getStatusColor()}`}>
        {getStatusText()}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {status === 'disconnected' || status === 'error' ? (
          <button
            onClick={connectReader}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded transition-colors"
            disabled={!navigator.usb}
          >
            {navigator.usb ? 'Connect Reader' : 'WebUSB Not Supported'}
          </button>
        ) : (
          <button
            onClick={disconnectReader}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded transition-colors"
          >
            Disconnect Reader
          </button>
        )}
      </div>

      {punchData && (
        <div className="mt-6 p-4 bg-gray-50 rounded border">
          <h2 className="text-lg font-semibold mb-2 text-gray-700">
            Latest Punch:
          </h2>
          <pre className="bg-white p-3 rounded border text-sm font-mono overflow-x-auto">
            {punchData}
          </pre>
        </div>
      )}
    </div>
  );
};
