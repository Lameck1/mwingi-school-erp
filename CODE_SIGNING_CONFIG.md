# Code Signing Configuration

## Current Status

The Mwingi School ERP is currently configured for **unsigned builds** during development and testing phases.

## Configuration Details

### Windows (`package.json`)

- `cscLink: null` - No certificate configured
- `forceCodeSigning: false` - Explicitly disabled
- **Result**: Unsigned `.exe` files will be generated

### macOS (`package.json`)

- `hardenedRuntime: true` - Security hardening enabled
- `gatekeeperAssess: false` - Bypass Gatekeeper assessment
- **Result**: Apps will run but may show security warnings

### Linux (`package.json`)

- Standard AppImage and deb package targets
- **Result**: Standard Linux packaging without signing

## Production Deployment Strategy

### Phase 1: Internal Testing

- Continue with unsigned builds
- Manual verification of build integrity
- Test distribution within trusted environment

### Phase 2: Code Signing Implementation

When ready for production deployment:

1. **Windows Code Signing**
   - Obtain Code Signing Certificate from trusted CA
   - Set `cscLink` environment variable in CI/CD
   - Update `forceCodeSigning: true` for production builds
   - Configure timestamp server

2. **macOS Code Signing**
   - Obtain Apple Developer Certificate
   - Set `cscLink` for macOS builds
   - Consider notarization for distribution outside App Store

3. **Linux Package Signing**
   - Set up GPG signing for packages
   - Configure repository signing keys

## Security Implications

### Current (Unsigned)

- **Risk**: Users may see security warnings
- **Mitigation**: Distribute through trusted channels
- **Acceptable for**: Internal testing, controlled deployments

### Production (Signed)

- **Benefit**: Trusted installer, no security warnings
- **Requirement**: Certificate management infrastructure
- **Necessary for**: Public distribution, enterprise deployments

## CI/CD Integration

The GitHub Actions workflow should be updated to:

1. **Development Branches**: Build without signing (current)
2. **Release Tags**: Build with signing (when certificates are available)
3. **Environment Variables**: Use secrets for certificate storage

```yaml
# Example for future implementation
- name: Build with Code Signing
  if: startsWith(github.ref, 'refs/tags/')
  run: npm run electron:build
  env:
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

## Recommendations

1. **Short-term**: Continue with current configuration for testing
2. **Medium-term**: Plan certificate acquisition process
3. **Long-term**: Implement full code signing pipeline before public release

## Audit Requirements

- [ ] Certificate procurement process documented
- [ ] Secure storage of certificate private keys
- [ ] Code signing verification in CI/CD pipeline
- [ ] Signed build verification procedures
- [ ] Certificate renewal process established
