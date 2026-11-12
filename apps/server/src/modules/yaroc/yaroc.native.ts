export async function loadYaroc() {
  const packageName = '@lukasp47/yaroc';
  try {
    const addon = await import(packageName);
    if (typeof addon.MqttClient !== 'function') throw new Error('Missing MqttClient export');
    return addon as {
      MqttClient: new (
        dns: { name: string; macAddress: string }[],
        configs: { url: string; port: number; keepAliveSecs: number; meshtasticChannel?: string }[],
        timezone: string,
      ) => NativeClient;
    };
  } catch {
    throw new Error(
      'YAROC 0.1.3 native entrypoint unavailable. Install a functional Linux distribution before starting reception.',
    );
  }
}
export interface NativeClient {
  start(callback: (error: Error | null, event: unknown) => void): void;
  stop(): void;
}

let availability: Promise<boolean> | undefined;
export function yarocNativeAvailable(): Promise<boolean> {
  return (availability ??= loadYaroc().then(
    () => true,
    () => false,
  ));
}
