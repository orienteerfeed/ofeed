import { config } from '@/config';

export const resolveFeaturedImageUrl = (
  featuredImage?: string | null
): string | null => {
  if (!featuredImage) {
    return null;
  }

  if (featuredImage.startsWith('/')) {
    return `${config.BASE_API_URL.replace(/\/+$/, '')}${featuredImage}`;
  }

  return featuredImage;
};
