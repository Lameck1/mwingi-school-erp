import { type PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
    testDir: './tests/e2e',
    timeout: 30000,
    retries: process.env.CI ? 1 : 0,
    fullyParallel: false,
    workers: 1,
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    reporter: [['list']],
    outputDir: 'test-results/',
}

export default config
