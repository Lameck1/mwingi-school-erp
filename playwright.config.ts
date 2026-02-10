import { type PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
    testDir: './tests/e2e',
    timeout: 30000,
    retries: 1,
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    outputDir: 'test-results/',
}

export default config
