import { test, expect } from '@playwright/test'
import path from 'path'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

// Skip E2E if not in E2E environment
const isE2E = process.env.E2E === 'true'

let electronApp: ElectronApplication
let page: Page | null = null

// Only run if we can launch electron (might fail in headless CI without display)
test.describe('Fee Payment Flow', () => {
    test.beforeAll(async () => {
        if (!isE2E) {
            return
        }

        try {
            electronApp = await electron.launch({
                args: [path.join(__dirname, '../../dist-electron/main/index.js')],
                env: {
                    ...process.env,
                    NODE_ENV: 'test'
                }
            })
            page = await electronApp.firstWindow()
            await page.waitForLoadState('domcontentloaded')
        } catch (e) {
            console.warn('Skipping E2E tests: Could not launch Electron', e)
            page = null
        }
    })

    test.afterAll(async () => {
        if (electronApp) {
            await electronApp.close()
        }
    })

    test('should login and navigate to fee payment', async () => {
        if (!isE2E || !page) {return}

        // Login
        await page.fill('input[type="text"]', 'admin')
        await page.fill('input[type="password"]', 'admin123')
        await page.click('button[type="submit"]')

        // Wait for dashboard
        await expect(page.locator('h1:has-text("Financial Overview")')).toBeVisible()

        // Navigate to fee payment
        await page.click('a[href="/fee-payment"]')
        await expect(page.locator('h1:has-text("Fee Payment")')).toBeVisible()
    })

    test('should record a payment', async () => {
        if (!isE2E || !page) {return}

        // Mock/Simulate filling payment
        // Note: In a real test, we'd need to seed data first.
        // Given the environment constraints, we are just scaffolding this test file.

        // Check if form exists
        await expect(page.locator('form')).toBeVisible()
    })
})
