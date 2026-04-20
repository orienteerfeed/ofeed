import type { Page } from '@playwright/test';

export class AuthPage {
  constructor(private page: Page) {}

  async gotoSignIn() {
    await this.page.goto('/auth/signin');
  }

  async gotoSignUp() {
    await this.page.goto('/auth/signup');
  }

  async gotoForgotPassword() {
    await this.page.goto('/auth/forgot-password');
  }

  async signIn(email: string, password: string) {
    await this.gotoSignIn();

    // Email field is always visible
    await this.page.getByPlaceholder(/email/i).fill(email);

    // Password field appears after email is filled (progressive disclosure)
    await this.page.getByPlaceholder(/password/i).fill(password);

    await this.page.getByRole('button', { name: /sign in/i }).click();
  }

  async submitForgotPassword(email: string) {
    await this.gotoForgotPassword();
    await this.page.getByPlaceholder(/email/i).fill(email);
    await this.page.getByRole('button', { name: /reset password/i }).click();
  }

  isOnSignInPage() {
    return this.page.waitForURL('/auth/signin');
  }

  getPasswordField() {
    return this.page.getByPlaceholder(/password/i);
  }

  getEmailField() {
    return this.page.getByPlaceholder(/email/i);
  }

  getForgotPasswordLink() {
    return this.page.getByRole('link', { name: /forgot/i });
  }

  getSignUpLink() {
    return this.page.getByRole('link', { name: /sign up/i });
  }

  getSuccessCheckIcon() {
    return this.page.locator('svg.text-green-500, [class*="text-green"]').first();
  }
}
