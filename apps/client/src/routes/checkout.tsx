import { createFileRoute } from '@tanstack/react-router';
import { CheckoutPage } from '../pages';

export const Route = createFileRoute('/checkout')({
  component: CheckoutPage,
});
