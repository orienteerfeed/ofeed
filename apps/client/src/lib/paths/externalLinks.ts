import config from '@/config';
export const externalLinks = {
  mrb: (baseApi: string) => `${baseApi}/mrb`,
  docs: config.DOCS_URL,
  buyMeCoffee: 'https://buymeacoffee.com/ofeed',
  discord: 'https://discord.gg/YWURC23tHZ',
  github: 'https://github.com/orienteerfeed/ofeed',
} as const;
