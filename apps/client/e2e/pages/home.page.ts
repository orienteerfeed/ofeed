import type { Page } from '@playwright/test';

export class HomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  getTab(name: 'ALL' | 'TODAY' | 'UPCOMING' | 'RECENT') {
    return this.page.getByRole('tab', { name: new RegExp(name, 'i') });
  }

  getEventRows() {
    return this.page.locator('[data-testid="event-row"]');
  }

  getEventList() {
    return this.page.locator('table, [role="table"], ul[class*="event"]').first();
  }

  async switchTab(name: 'ALL' | 'TODAY' | 'UPCOMING' | 'RECENT') {
    await this.getTab(name).click();
  }

  getNavbar() {
    return this.page.locator('header');
  }

  getSearchDialog() {
    return this.page.locator('[role="dialog"]');
  }
}
